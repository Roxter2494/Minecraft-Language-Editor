import * as vscode from 'vscode';
import { paraPrompt } from './core/langLocales';
import { buscarProveedor, urlBaseDe, type ProveedorInfo } from './core/proveedoresIa';
import { enviarProveedor, type DestinoIa } from './iaHttp';
import type { ModeloIa } from './core/types';

/**
 * Traducción y revisión con el modelo de lenguaje de VS Code (`vscode.lm`).
 *
 * No guarda claves API: usa los modelos que ya aporta GitHub Copilot Chat u
 * otra extensión compatible. La primera vez VS Code pedirá consentimiento.
 */

export interface EntradaIA {
  key: string;
  /** Texto original (inglés). */
  source: string;
  /** Traducción actual, solo para revisión. */
  actual?: string;
}

export interface ResultadoIA {
  key: string;
  texto: string;
}

export interface OpcionesIA {
  idiomaOrigen: string;
  idiomaDestino: string;
  entradas: EntradaIA[];
  /** Contexto del glosario ya formateado (`- original = equivalencia`). */
  glosario?: string;
  /** Nombres propios que deben conservarse. */
  nombres?: string[];
  /** Si es true, revisa traducciones existentes en lugar de traducir. */
  revisar?: boolean;
  /** Términos protegidos que nunca deben traducirse. */
  protegidos?: string[];
  /** Modelo concreto (`proveedor/id`); vacío = automático. */
  modelo?: string;
}

export interface ResultadoEjecucionIA {
  ok: boolean;
  resultados: ResultadoIA[];
  /** Propuestas descartadas por perder marcadores. */
  omitidas: number;
  /** Lotes que fallaron y no pudieron procesarse. */
  fallidos: number;
  /** Mensaje de error si `ok` es false. */
  error?: string;
}

export interface ProgresoIA {
  hechos: number;
  total: number;
}

const MAX_ENTRADAS_POR_LOTE = 40;
const MAX_CARACTERES_POR_LOTE = 6000;

/** Acceso a las claves API (lo inyecta la extensión desde `SecretStorage`). */
let leerClave: (proveedor: string) => Promise<string | undefined> = async () => undefined;

/** La extensión llama a esto al activarse para habilitar las claves propias. */
export function usarSecretosIa(
  fn: (proveedor: string) => Promise<string | undefined>,
): void {
  leerClave = fn;
}

export interface ConfiguracionIa {
  /** Proveedor activo (`vscode`, `openai`, `anthropic`, `google`, `compatible`). */
  proveedor: string;
  /** Modelo: `proveedor/id` en VS Code, nombre del modelo en las APIs. */
  modelo: string;
  /** URL base opcional (proxies o APIs compatibles). */
  urlBase: string;
}

/** Lee la configuración de IA de los ajustes de VS Code. */
export function leerConfiguracionIa(): ConfiguracionIa {
  const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
  const proveedor = cfg.get<string>('proveedorIA', 'vscode');
  return {
    proveedor,
    modelo:
      proveedor === 'vscode'
        ? cfg.get<string>('modeloIA', '').trim()
        : cfg.get<string>('modeloApi', '').trim(),
    urlBase: cfg.get<string>('urlBaseIA', '').trim(),
  };
}

/** Ejecuta la IA sobre las entradas indicadas, en lotes. */
export async function ejecutarIA(
  opciones: OpcionesIA,
  token: vscode.CancellationToken,
  onProgress?: (p: ProgresoIA) => void,
): Promise<ResultadoEjecucionIA> {
  const config = leerConfiguracionIa();
  const proveedor = buscarProveedor(config.proveedor);
  const enviar = await crearEnviador(proveedor, config, opciones, token);
  if ('error' in enviar) {
    return { ok: false, resultados: [], omitidas: 0, fallidos: 0, error: enviar.error };
  }
  return ejecutarLotes(opciones, enviar.enviar, token, onProgress);
}

type Enviador = (prompt: string) => Promise<string>;

/** Prepara la función que envía un prompt al proveedor elegido. */
async function crearEnviador(
  proveedor: ProveedorInfo,
  config: ConfiguracionIa,
  opciones: OpcionesIA,
  token: vscode.CancellationToken,
): Promise<{ enviar: Enviador } | { error: string }> {
  if (proveedor.id === 'vscode') {
    const modelo = await elegirModelo(config.modelo || opciones.modelo);
    if (!modelo) return { error: 'NO_MODEL' };
    return {
      enviar: async (prompt) => {
        const respuesta = await modelo.sendRequest(
          [vscode.LanguageModelChatMessage.User(prompt)],
          { justification: 'Traducir archivos .lang de Minecraft Bedrock' },
          token,
        );
        let texto = '';
        for await (const fragmento of respuesta.text) {
          texto += fragmento;
          if (token.isCancellationRequested) break;
        }
        return texto;
      },
    };
  }

  const clave = await leerClave(proveedor.id);
  if (!clave) return { error: 'NO_KEY' };

  const modelo = config.modelo || proveedor.modelo;
  if (!modelo) return { error: 'NO_MODEL_NAME' };
  if (proveedor.id === 'compatible' && !urlBaseDe(proveedor, config.urlBase)) {
    return { error: 'NO_URL' };
  }

  const destino: DestinoIa = {
    proveedor,
    modelo,
    urlBase: config.urlBase,
    clave,
  };
  return { enviar: (prompt) => enviarProveedor(destino, prompt, token) };
}

/** Bucle común: agrupa en lotes, pide al modelo y filtra propuestas. */
async function ejecutarLotes(
  opciones: OpcionesIA,
  enviar: Enviador,
  token: vscode.CancellationToken,
  onProgress?: (p: ProgresoIA) => void,
): Promise<ResultadoEjecucionIA> {
  const lotes = agrupar(opciones.entradas);
  const resultados: ResultadoIA[] = [];
  let omitidas = 0;
  let fallidos = 0;
  let hechos = 0;
  let ultimoError = '';
  let lotesCorrectos = 0;

  for (const lote of lotes) {
    if (token.isCancellationRequested) {
      return { ok: false, resultados, omitidas, fallidos, error: 'CANCELLED' };
    }

    try {
      const prompt = construirPrompt(opciones, lote);
      const texto = await enviar(prompt);
      if (token.isCancellationRequested) {
        return { ok: false, resultados, omitidas, fallidos, error: 'CANCELLED' };
      }

      const propuestas = normalizarRespuesta(extraerJson(texto));
      lotesCorrectos++;

      for (const propuesta of propuestas) {
        const entrada = lote.find((e) => e.key === propuesta.key);
        if (!entrada) continue;
        if (propuesta.texto.trim() === '') continue;

        if (!conservaMarcadores(entrada.source, propuesta.texto)) {
          omitidas++;
          continue;
        }
        if (conservaProtegidos(entrada.source, propuesta.texto, opciones.protegidos)) {
          resultados.push({ key: propuesta.key, texto: propuesta.texto });
        } else {
          omitidas++;
        }
      }
    } catch (e) {
      if (token.isCancellationRequested) {
        return { ok: false, resultados, omitidas, fallidos, error: 'CANCELLED' };
      }
      fallidos++;
      ultimoError = mensajeDeError(e);
    }

    hechos += lote.length;
    onProgress?.({ hechos, total: opciones.entradas.length });
  }

  if (lotesCorrectos === 0) {
    return { ok: false, resultados, omitidas, fallidos, error: ultimoError || 'UNKNOWN' };
  }

  return { ok: true, resultados, omitidas, fallidos };
}

/** Motivo por el que no hay ningún modelo de lenguaje disponible. */
export type MotivoSinModelo =
  | 'copilot-deshabilitado'
  | 'sin-sesion'
  | 'sin-modelos'
  | 'sin-clave';

export interface DiagnosticoModelo {
  ok: boolean;
  motivo?: MotivoSinModelo;
  /** Proveedor activo, para los mensajes. */
  proveedor?: string;
}

/** Identificador estable de un modelo para guardarlo en la configuración. */
export function idDeModelo(m: vscode.LanguageModelChat): string {
  return `${m.vendor}/${m.id}`;
}

function etiquetaModelo(m: vscode.LanguageModelChat): string {
  const nombre = (m.name || m.family || m.id).trim();
  return m.vendor && m.vendor !== 'copilot' ? `${nombre} · ${m.vendor}` : nombre;
}

/** Modelos disponibles ahora, listos para el desplegable de la interfaz. */
export async function listarModelos(): Promise<ModeloIa[]> {
  const modelos = await modelosDisponibles();
  const vistos = new Set<string>();
  const salida: ModeloIa[] = [];
  for (const m of modelos) {
    const id = idDeModelo(m);
    if (vistos.has(id)) continue;
    vistos.add(id);
    salida.push({ id, nombre: etiquetaModelo(m) });
  }
  salida.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return salida;
}

/** Modelos disponibles, prefiriendo el proveedor de Copilot. */
async function modelosDisponibles(): Promise<vscode.LanguageModelChat[]> {
  try {
    const copilot = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (copilot.length > 0) return copilot;
    return await vscode.lm.selectChatModels();
  } catch {
    return [];
  }
}

/**
 * Comprueba si hay modelos y, cuando no los hay, intenta explicar por qué:
 * Copilot Chat deshabilitado, sesión de GitHub sin iniciar o sin modelos.
 */
export async function diagnosticarModelo(): Promise<DiagnosticoModelo> {
  const config = leerConfiguracionIa();
  const proveedor = buscarProveedor(config.proveedor);

  // Con un proveedor externo solo hace falta la clave API.
  if (proveedor.id !== 'vscode') {
    const clave = await leerClave(proveedor.id);
    return clave
      ? { ok: true, proveedor: proveedor.id }
      : { ok: false, motivo: 'sin-clave', proveedor: proveedor.id };
  }

  const modelos = await modelosDisponibles();
  if (modelos.length > 0) return { ok: true, proveedor: 'vscode' };

  // `getExtension` devuelve undefined si la extensión está deshabilitada o no existe.
  if (!vscode.extensions.getExtension('GitHub.copilot-chat')) {
    return { ok: false, motivo: 'copilot-deshabilitado', proveedor: 'vscode' };
  }

  try {
    const sesion = await vscode.authentication.getSession('github', ['copilot'], {
      silent: true,
    });
    if (!sesion) return { ok: false, motivo: 'sin-sesion', proveedor: 'vscode' };
  } catch {
    return { ok: false, motivo: 'sin-sesion', proveedor: 'vscode' };
  }

  return { ok: false, motivo: 'sin-modelos', proveedor: 'vscode' };
}

/** Selecciona el modelo elegido o, si no hay, uno razonable. */
async function elegirModelo(preferido?: string): Promise<vscode.LanguageModelChat | undefined> {
  const modelos = await modelosDisponibles();
  if (modelos.length === 0) return undefined;

  // El usuario eligió un modelo concreto en el desplegable.
  const elegido = (preferido ?? '').trim();
  if (elegido) {
    const exacto = modelos.find((m) => idDeModelo(m) === elegido || m.id === elegido);
    if (exacto) return exacto;
  }

  // Preferir familias conocidas de buena calidad; si no, el primero.
  const buena = modelos.find((m) =>
    /gpt-4o|gpt-4\.1|gpt-4|gpt-5|claude|gemini|sonnet|opus|o3|o4/i.test(
      `${m.family} ${m.name}`,
    ),
  );
  return buena ?? modelos[0];
}

function agrupar(entradas: EntradaIA[]): EntradaIA[][] {
  const lotes: EntradaIA[][] = [];
  let actual: EntradaIA[] = [];
  let caracteres = 0;

  for (const entrada of entradas) {
    const tam = entrada.key.length + entrada.source.length + (entrada.actual?.length ?? 0) + 40;
    if (
      actual.length > 0 &&
      (actual.length >= MAX_ENTRADAS_POR_LOTE || caracteres + tam > MAX_CARACTERES_POR_LOTE)
    ) {
      lotes.push(actual);
      actual = [];
      caracteres = 0;
    }
    actual.push(entrada);
    caracteres += tam;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

function construirPrompt(opciones: OpcionesIA, lote: EntradaIA[]): string {
  const origen = paraPrompt(opciones.idiomaOrigen) || opciones.idiomaOrigen;
  const destino = paraPrompt(opciones.idiomaDestino) || opciones.idiomaDestino;

  const lineas: string[] = [];
  if (opciones.revisar) {
    lineas.push(
      'Eres un revisor profesional de traducciones de videojuegos.',
      `Revisa y mejora las traducciones del ${origen} al ${destino}.`,
      'Corrige gramática, naturalidad y coherencia con el texto original.',
      'Si una traducción ya es correcta, devuélvela tal cual.',
      'Devuelve SOLO un arreglo JSON válido, sin markdown ni explicaciones, con la forma:',
      '[{"key":"...","texto":"traducción revisada"}]',
    );
  } else {
    lineas.push(
      'Eres un traductor profesional de videojuegos.',
      `Traduce del ${origen} al ${destino}.`,
      'Devuelve SOLO un arreglo JSON válido, sin markdown ni explicaciones, con la forma:',
      '[{"key":"...","texto":"traducción"}]',
    );
  }

  lineas.push(
    'Conserva EXACTAMENTE los marcadores de formato y las variables, por ejemplo %s, %1$d, %d, §a, {0}, {name}.',
    'No traduzcas claves técnicas, identificadores ni nombres de archivo.',
    'No añadas texto que no esté en el original.',
  );

  if (opciones.glosario && opciones.glosario.trim()) {
    lineas.push('', 'Glosario aprobado (usa estas equivalencias):', opciones.glosario.trim());
  }

  const nombres = (opciones.nombres ?? []).filter(Boolean);
  if (nombres.length > 0) {
    lineas.push(
      '',
      'Nombres propios que deben conservarse sin traducir:',
      nombres.join(', '),
    );
  }

  const protegidos = (opciones.protegidos ?? []).filter(Boolean);
  if (protegidos.length > 0) {
    lineas.push('', 'No traduzcas estos términos:', protegidos.join(', '));
  }

  const datos = lote.map((e) =>
    opciones.revisar
      ? { key: e.key, source: e.source, actual: e.actual ?? '' }
      : { key: e.key, source: e.source },
  );

  lineas.push('', 'Entradas:', JSON.stringify(datos));
  return lineas.join('\n');
}

/** Extrae el primer arreglo u objeto JSON de la respuesta. */
export function extraerJson(texto: string): unknown {
  const limpio = texto.replace(/```(?:json)?/gi, '').trim();

  const inicioArr = limpio.indexOf('[');
  const finArr = limpio.lastIndexOf(']');
  if (inicioArr >= 0 && finArr > inicioArr) {
    return JSON.parse(limpio.slice(inicioArr, finArr + 1));
  }

  const inicioObj = limpio.indexOf('{');
  const finObj = limpio.lastIndexOf('}');
  if (inicioObj >= 0 && finObj > inicioObj) {
    return JSON.parse(limpio.slice(inicioObj, finObj + 1));
  }

  throw new Error('La respuesta del modelo no contiene JSON.');
}

/** Normaliza las distintas formas en que el modelo puede devolver el JSON. */
export function normalizarRespuesta(valor: unknown): ResultadoIA[] {
  const salida: ResultadoIA[] = [];
  const agregar = (key: unknown, texto: unknown): void => {
    if (typeof key !== 'string' || typeof texto !== 'string') return;
    if (!key.trim()) return;
    salida.push({ key, texto });
  };

  if (Array.isArray(valor)) {
    for (const item of valor) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      agregar(obj.key ?? obj.clave, obj.texto ?? obj.translation ?? obj.value);
    }
    return salida;
  }

  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if (Array.isArray(obj.translations)) {
      for (const item of obj.translations) {
        if (!item || typeof item !== 'object') continue;
        const fila = item as Record<string, unknown>;
        agregar(fila.key ?? fila.clave, fila.texto ?? fila.translation ?? fila.value);
      }
      return salida;
    }
    for (const [key, texto] of Object.entries(obj)) {
      if (typeof texto === 'string') agregar(key, texto);
    }
  }

  return salida;
}

const RE_MARCADOR = /%(?:\d+\$)?[sd]|§.|\{\d+\}|\{[A-Za-z0-9_]+\}|\$[A-Za-z_]+/g;

/** Lista ordenada de marcadores de formato de un texto. */
export function marcadores(texto: string): string[] {
  return (texto.match(RE_MARCADOR) ?? []).sort();
}

/** Comprueba que la propuesta conserva los mismos marcadores que el original. */
export function conservaMarcadores(original: string, propuesta: string): boolean {
  const a = marcadores(original);
  const b = marcadores(propuesta);
  if (a.length !== b.length) return false;
  return a.every((m, i) => m === b[i]);
}

/** Comprueba que los términos protegidos se mantienen literalmente. */
export function conservaProtegidos(
  original: string,
  propuesta: string,
  protegidos: string[] | undefined,
): boolean {
  if (!protegidos || protegidos.length === 0) return true;
  for (const termino of protegidos) {
    const t = termino.trim();
    if (!t) continue;
    if (!original.includes(t)) continue;
    if (!propuesta.includes(t)) return false;
  }
  return true;
}

function mensajeDeError(e: unknown): string {
  if (e instanceof vscode.LanguageModelError) {
    return `${e.code}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
