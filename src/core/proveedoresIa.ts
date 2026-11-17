/**
 * Proveedores de IA con clave propia (OpenAI, Anthropic, Google y cualquier API
 * compatible con OpenAI).
 *
 * Módulo puro: no importa `vscode` ni hace peticiones de red, así que se puede
 * probar con vitest y reutilizar en la webview.
 */

export type ProveedorIa = 'vscode' | 'openai' | 'anthropic' | 'google' | 'compatible';

export interface ProveedorInfo {
  id: ProveedorIa;
  /** Nombre visible. */
  nombre: string;
  /** Si necesita clave API. */
  clave: boolean;
  /** URL base por defecto (vacía en `vscode`). */
  urlBase: string;
  /** Modelo propuesto al elegir el proveedor. */
  modelo: string;
  /** Modelos sugeridos para el desplegable. */
  sugeridos: readonly string[];
  /** Enlace para obtener la clave. */
  claveUrl: string;
}

export const PROVEEDORES: readonly ProveedorInfo[] = [
  {
    id: 'vscode',
    nombre: 'VS Code (Copilot)',
    clave: false,
    urlBase: '',
    modelo: '',
    sugeridos: [],
    claveUrl: '',
  },
  {
    id: 'openai',
    nombre: 'OpenAI (ChatGPT)',
    clave: true,
    urlBase: 'https://api.openai.com/v1',
    modelo: 'gpt-4o-mini',
    sugeridos: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    claveUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    nombre: 'Anthropic (Claude)',
    clave: true,
    urlBase: 'https://api.anthropic.com/v1',
    modelo: 'claude-sonnet-4-5',
    sugeridos: [
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-3-7-sonnet-latest',
      'claude-3-5-haiku-latest',
    ],
    claveUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    nombre: 'Google (Gemini)',
    clave: true,
    urlBase: 'https://generativelanguage.googleapis.com/v1beta',
    modelo: 'gemini-2.5-flash',
    sugeridos: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    claveUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'compatible',
    nombre: 'Compatible con OpenAI',
    clave: true,
    urlBase: '',
    modelo: '',
    sugeridos: [],
    claveUrl: '',
  },
];

/** Devuelve la definición del proveedor o el primero (VS Code). */
export function buscarProveedor(id: string | undefined): ProveedorInfo {
  return PROVEEDORES.find((p) => p.id === id) ?? PROVEEDORES[0];
}

/** Nombre de la entrada de `SecretStorage` para la clave de un proveedor. */
export function claveSecreto(proveedor: string): string {
  return `minecraftLangEditor.apiKey.${proveedor}`;
}

/** URL base sin barras finales. */
export function urlBaseDe(proveedor: ProveedorInfo, urlBase: string): string {
  return (urlBase || proveedor.urlBase || '').trim().replace(/\/+$/, '');
}

export interface PeticionHttp {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface DatosPeticion {
  modelo: string;
  urlBase: string;
  clave: string;
  prompt: string;
  /** Límite de tokens de salida. */
  maxTokens?: number;
}

/** Construye la petición HTTP de cada proveedor. */
export function construirPeticion(
  proveedor: ProveedorInfo,
  datos: DatosPeticion,
): PeticionHttp {
  const modelo = (datos.modelo || proveedor.modelo).trim();
  const base = urlBaseDe(proveedor, datos.urlBase);
  const maxTokens = datos.maxTokens ?? 8000;

  if (proveedor.id === 'anthropic') {
    return {
      url: `${base}/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': datos.clave,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: modelo,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: datos.prompt }],
      },
    };
  }

  if (proveedor.id === 'google') {
    return {
      url: `${base}/models/${encodeURIComponent(modelo)}:generateContent`,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': datos.clave,
      },
      body: {
        contents: [{ role: 'user', parts: [{ text: datos.prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      },
    };
  }

  // OpenAI y cualquier API compatible (Ollama, LM Studio, OpenRouter…).
  // Los modelos de razonamiento (o1/o3/o4, gpt-5) rechazan `temperature`.
  const razonamiento = /^o\d/i.test(modelo) || /^gpt-5/i.test(modelo);
  return {
    url: `${base}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${datos.clave}`,
    },
    body: {
      model: modelo,
      messages: [{ role: 'user', content: datos.prompt }],
      ...(razonamiento ? {} : { temperature: 0.2 }),
    },
  };
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

/** Une los fragmentos de texto de una lista de partes. */
function textoDePartes(valor: unknown): string {
  if (!Array.isArray(valor)) return '';
  return valor
    .map((parte) => objeto(parte).text)
    .filter((texto): texto is string => typeof texto === 'string')
    .join('');
}

/** Extrae el texto de la respuesta de cada proveedor. */
export function extraerTexto(proveedor: ProveedorIa, respuesta: unknown): string {
  const datos = objeto(respuesta);

  if (proveedor === 'anthropic') {
    const partes = Array.isArray(datos.content) ? datos.content : [];
    const texto = partes
      .filter((parte) => objeto(parte).type === 'text')
      .map((parte) => objeto(parte).text)
      .filter((t): t is string => typeof t === 'string')
      .join('');
    return texto.trim();
  }

  if (proveedor === 'google') {
    const candidatos = Array.isArray(datos.candidates) ? datos.candidates : [];
    const contenido = objeto(objeto(candidatos[0]).content);
    return textoDePartes(contenido.parts).trim();
  }

  // OpenAI y compatibles.
  const opciones = Array.isArray(datos.choices) ? datos.choices : [];
  const mensaje = objeto(objeto(opciones[0]).message);
  const contenido = mensaje.content;
  if (typeof contenido === 'string') return contenido.trim();
  return textoDePartes(contenido).trim();
}

/** Mensaje legible para un error HTTP del proveedor. */
export function mensajeDeErrorHttp(estado: number, cuerpo: string): string {
  let detalle = cuerpo;
  try {
    const datos = objeto(JSON.parse(cuerpo));
    const error = objeto(datos.error);
    if (typeof error.message === 'string') detalle = error.message;
    else if (typeof datos.message === 'string') detalle = datos.message;
  } catch {
    // El cuerpo no es JSON: se usa tal cual.
  }
  const limpio = String(detalle).replace(/\s+/g, ' ').trim().slice(0, 300);
  return `${estado}: ${limpio || 'sin detalle'}`;
}
