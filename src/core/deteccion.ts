import * as fs from 'fs';
import * as path from 'path';
import { leer } from './langFileIo';

/**
 * Detección de textos traducibles en una carpeta de pack:
 * - valores de archivos `.lang`;
 * - cadenas de catálogos `.json`;
 * - literales de cadena en scripts `.js`, `.ts`, `.mjs`, `.cjs`, `.jsx`, `.tsx`.
 *
 * Cada texto recibe una clave sintética estable `archivo.texto` para poder
 * importarlo al editor como una clave nueva del `.lang` de destino.
 */

export type FuenteTexto = 'lang' | 'json' | 'script';

export interface TextoDetectado {
  /** Identificador estable dentro del escaneo. */
  id: string;
  /** Ruta relativa con separadores `/`. */
  archivo: string;
  fuente: FuenteTexto;
  /** Línea 1-based; 0 si no se puede determinar (JSON). */
  linea: number;
  texto: string;
  /** Clave sintética para el .lang. */
  clave: string;
}

export interface OpcionesDeteccion {
  /** Profundidad máxima de carpetas. */
  maxProfundidad?: number;
  /** Máximo de archivos a examinar. */
  maxArchivos?: number;
  /** Máximo de textos a devolver. */
  maxTextos?: number;
  /** Extensiones adicionales de script. */
  extensionesScript?: string[];
}

const DIRS_IGNORADOS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  'coverage',
  '.vscode',
  '.idea',
  '.gradle',
  'target',
  'bin',
  'obj',
]);

const EXT_SCRIPT_POR_DEFECTO = ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx'];

const PALABRAS_TECNICAS = new Set([
  'require',
  'module',
  'exports',
  'import',
  'export',
  'default',
  'function',
  'return',
  'const',
  'let',
  'var',
  'class',
  'extends',
  'super',
  'this',
  'true',
  'false',
  'null',
  'undefined',
  'typeof',
  'instanceof',
  'use strict',
  'async',
  'await',
  'yield',
  'break',
  'continue',
  'switch',
  'case',
  'catch',
  'finally',
  'throw',
  'new',
  'delete',
  'in',
  'of',
  'void',
]);

/** Escanea una carpeta y devuelve los textos candidatos. */
export function detectarTextos(
  carpeta: string,
  opciones: OpcionesDeteccion = {},
): TextoDetectado[] {
  const maxProfundidad = opciones.maxProfundidad ?? 8;
  const maxArchivos = opciones.maxArchivos ?? 800;
  const maxTextos = opciones.maxTextos ?? 8000;
  const extScript = new Set(
    (opciones.extensionesScript ?? EXT_SCRIPT_POR_DEFECTO).map((e) => e.toLowerCase()),
  );

  const resultado: TextoDetectado[] = [];
  const clavesUsadas = new Set<string>();
  const vistos = new Set<string>();

  if (!carpeta || !fs.existsSync(carpeta)) return resultado;

  let archivosLeidos = 0;

  const agregar = (archivo: string, fuente: FuenteTexto, linea: number, texto: string): void => {
    if (resultado.length >= maxTextos) return;
    const limpio = texto.trim();
    if (!limpio) return;
    if (!esTextoCandidato(limpio, fuente)) return;
    const firma = `${archivo.toLowerCase()}\u0000${limpio}`;
    if (vistos.has(firma)) return;
    vistos.add(firma);

    const clave = claveSintetica(archivo, limpio, clavesUsadas);
    clavesUsadas.add(clave.toLowerCase());
    resultado.push({
      id: `${archivo}:${linea}:${resultado.length}`,
      archivo,
      fuente,
      linea,
      texto: limpio,
      clave,
    });
  };

  const visitar = (dir: string, profundidad: number): void => {
    if (profundidad > maxProfundidad || archivosLeidos >= maxArchivos) return;
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entrada of entradas) {
      if (archivosLeidos >= maxArchivos || resultado.length >= maxTextos) return;
      const abs = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (DIRS_IGNORADOS.has(entrada.name.toLowerCase())) continue;
        visitar(abs, profundidad + 1);
        continue;
      }
      if (!entrada.isFile()) continue;

      const ext = path.extname(entrada.name).toLowerCase();
      const rel = path.relative(carpeta, abs).split(path.sep).join('/');

      if (ext === '.lang') {
        archivosLeidos++;
        try {
          const archivo = leer(abs);
          archivo.lineas.forEach((linea, indice) => {
            if (!linea.esPar) return;
            const texto = linea.texto ?? '';
            if (texto.trim()) agregar(rel, 'lang', indice + 1, texto);
          });
        } catch {
          // Archivo ilegible: se omite.
        }
      } else if (ext === '.json') {
        archivosLeidos++;
        try {
          const crudo = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
          const parsed: unknown = JSON.parse(crudo);
          for (const texto of cadenasDeJson(parsed)) agregar(rel, 'json', 0, texto);
        } catch {
          // JSON inválido: se omite.
        }
      } else if (extScript.has(ext)) {
        archivosLeidos++;
        try {
          const crudo = fs.readFileSync(abs, 'utf8');
          for (const hallazgo of extraerCadenasDeScript(crudo)) {
            agregar(rel, 'script', hallazgo.linea, hallazgo.texto);
          }
        } catch {
          // Script ilegible: se omite.
        }
      }
    }
  };

  visitar(carpeta, 0);
  return resultado;
}

/** Recorre un valor JSON y devuelve todas las cadenas. */
export function cadenasDeJson(valor: unknown): string[] {
  const salida: string[] = [];
  const visitar = (nodo: unknown): void => {
    if (typeof nodo === 'string') {
      salida.push(nodo);
    } else if (Array.isArray(nodo)) {
      for (const item of nodo) visitar(item);
    } else if (nodo && typeof nodo === 'object') {
      for (const item of Object.values(nodo as Record<string, unknown>)) visitar(item);
    }
  };
  visitar(valor);
  return salida;
}

/**
 * Heurística para saber si una `/` inicia una expresión regular y no una
 * división. No pretende ser un parser: evita los falsos positivos más comunes
 * (por ejemplo `/["']/` interpretado como una cadena).
 */
function esInicioDeRegex(codigo: string, indice: number): boolean {
  let j = indice - 1;
  while (j >= 0 && /\s/.test(codigo[j])) j--;
  if (j < 0) return true;

  const anterior = codigo[j];
  if ('=(:,![{;?&|+-*%^~<>'.includes(anterior)) return true;

  let k = j;
  while (k >= 0 && /[A-Za-z]/.test(codigo[k])) k--;
  const palabra = codigo.slice(k + 1, j + 1);
  return [
    'return',
    'case',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'throw',
    'else',
    'do',
    'yield',
    'await',
  ].includes(palabra);
}

/**
 * Extrae literales de cadena de un script con su línea. No interpreta el
 * código: solo reconoce comillas simples, dobles y plantillas sin `${...}`.
 */
export function extraerCadenasDeScript(codigo: string): Array<{ texto: string; linea: number }> {
  const salida: Array<{ texto: string; linea: number }> = [];
  let i = 0;
  let linea = 1;

  while (i < codigo.length) {
    const c = codigo[i];

    if (c === '\n') {
      linea++;
      i++;
      continue;
    }

    // Comentarios de línea y de bloque.
    if (c === '/' && codigo[i + 1] === '/') {
      i += 2;
      while (i < codigo.length && codigo[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && codigo[i + 1] === '*') {
      i += 2;
      while (i < codigo.length && !(codigo[i] === '*' && codigo[i + 1] === '/')) {
        if (codigo[i] === '\n') linea++;
        i++;
      }
      i += 2;
      continue;
    }

    // Expresión regular: se salta completa para no leer sus comillas.
    if (c === '/' && esInicioDeRegex(codigo, i)) {
      i++;
      let enClase = false;
      let escapado = false;
      while (i < codigo.length) {
        const d = codigo[i];
        if (escapado) {
          escapado = false;
          i++;
          continue;
        }
        if (d === '\\') {
          escapado = true;
          i++;
          continue;
        }
        if (d === '[') {
          enClase = true;
          i++;
          continue;
        }
        if (d === ']') {
          enClase = false;
          i++;
          continue;
        }
        if (d === '/' && !enClase) {
          i++;
          break;
        }
        if (d === '\n') break;
        i++;
      }
      while (i < codigo.length && /[a-z]/i.test(codigo[i])) i++;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const comilla = c;
      const lineaInicio = linea;
      let texto = '';
      let escapado = false;
      let interpolacion = false;
      i++;

      while (i < codigo.length) {
        const d = codigo[i];
        if (escapado) {
          texto += d;
          escapado = false;
          i++;
          continue;
        }
        if (d === '\\') {
          escapado = true;
          i++;
          continue;
        }
        if (comilla === '`' && d === '$' && codigo[i + 1] === '{') {
          interpolacion = true;
        }
        if (d === comilla) {
          i++;
          break;
        }
        if (d === '\n') linea++;
        texto += d;
        i++;
      }

      if (!interpolacion) {
        const limpio = texto.trim();
        if (limpio) salida.push({ texto: limpio, linea: lineaInicio });
      }
      continue;
    }

    i++;
  }

  return salida;
}

/** Filtra ruido técnico y deja textos con pinta de interfaz. */
export function esTextoCandidato(texto: string, fuente: FuenteTexto = 'lang'): boolean {
  const t = texto.trim();
  if (t.length < 2 || t.length > 300) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)) return false;
  if (/^(https?:\/\/|www\.|mailto:)/i.test(t)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  if (/^[A-Za-z]:\\/.test(t)) return false;
  // Rutas absolutas tipo /usr/bin; se permiten textos como "/say hello".
  if (/^\/[^\s/]+\/[^\s]*$/.test(t)) return false;
  if (/^[\d\s.,:;!?%+\-*/=<>()[\]{}"'`|&^~#@\\]+$/.test(t)) return false;

  if (fuente === 'lang') return true;

  const minusculas = t.toLowerCase();
  if (PALABRAS_TECNICAS.has(minusculas)) return false;
  if (/^[A-Za-z_$][\w$]*$/.test(t)) {
    // Identificador de una sola palabra: solo interesa si está capitalizado
    // y tiene al menos 4 letras (p. ej. "Diamond"), no "foo" o "bar".
    return /^[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ]{3,}$/.test(t);
  }
  if (/^[A-Z_][A-Z0-9_]*$/.test(t)) return false;
  if (/^[\w.-]+\.(json|js|ts|lang|png|jpg|jpeg|gif|svg|ogg|wav|mp3|mcfunction)$/i.test(t)) {
    return false;
  }
  if (/^[a-z]+(\.[a-z]+)+$/.test(t)) return false;
  if (/^[a-z0-9_]+:[a-z0-9_./-]+$/i.test(t)) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(t)) return false;
  if (/^\d+(\.\d+)?(px|em|rem|vh|vw|%|s|ms)?$/i.test(t)) return false;

  return true;
}

/** Convierte `archivo.ext` + texto en una clave `archivo.texto_en_snake_case`. */
export function claveSintetica(archivo: string, texto: string, usadas: Set<string>): string {
  const base = path
    .basename(archivo, path.extname(archivo))
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'texto';

  let slug = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  if (!slug) slug = 'texto';
  const raiz = `${base}.${slug}`;
  let clave = raiz;
  let n = 2;
  while (usadas.has(clave.toLowerCase())) {
    clave = `${raiz}_${n}`;
    n++;
  }
  return clave;
}
