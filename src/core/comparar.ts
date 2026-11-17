import * as fs from 'fs';
import * as path from 'path';
import { diccionario, leer } from './langFileIo';

/**
 * Comparación de dos carpetas `texts` completas (solo archivos `.lang`).
 *
 * La carpeta A se considera la versión actual y la B la anterior:
 * - altas: claves que están en A y no en B.
 * - bajas: claves que están en B y no en A.
 * - cambiadas: claves presentes en ambas con texto distinto.
 */

export type EstadoArchivo = 'igual' | 'soloA' | 'soloB' | 'cambiado';
export type EstadoClave = 'alta' | 'baja' | 'cambiada' | 'igual';

export interface ClaveDiff {
  clave: string;
  estado: EstadoClave;
  /** Texto en A (actual). */
  a?: string;
  /** Texto en B (anterior). */
  b?: string;
}

export interface ArchivoDiff {
  /** Ruta relativa con separadores `/`. */
  ruta: string;
  estado: EstadoArchivo;
  altas: number;
  bajas: number;
  cambiadas: number;
  /** Solo las claves con diferencias (o todas si el archivo es nuevo). */
  detalles: ClaveDiff[];
  /** Error de lectura, si el archivo no se pudo comparar. */
  error?: string;
}

export interface ResumenComparacion {
  archivos: number;
  iguales: number;
  soloA: number;
  soloB: number;
  cambiados: number;
  altas: number;
  bajas: number;
  cambiadas: number;
}

export interface ResultadoComparacion {
  carpetaA: string;
  carpetaB: string;
  archivos: ArchivoDiff[];
  resumen: ResumenComparacion;
}

const DIRS_IGNORADOS = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage']);
const MAX_DETALLES = 5000;

interface ArchivoEncontrado {
  rel: string;
  abs: string;
}

/** Lista recursivamente los `.lang` de una carpeta. */
export function listarArchivosLang(carpeta: string, maxProfundidad = 8): ArchivoEncontrado[] {
  const encontrados: ArchivoEncontrado[] = [];
  if (!carpeta || !fs.existsSync(carpeta)) return encontrados;

  const visitar = (dir: string, profundidad: number): void => {
    if (profundidad > maxProfundidad) return;
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const abs = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (DIRS_IGNORADOS.has(entrada.name.toLowerCase())) continue;
        visitar(abs, profundidad + 1);
      } else if (entrada.isFile() && entrada.name.toLowerCase().endsWith('.lang')) {
        const rel = path.relative(carpeta, abs).split(path.sep).join('/');
        encontrados.push({ rel, abs });
      }
    }
  };

  visitar(carpeta, 0);
  encontrados.sort((a, b) =>
    a.rel.toUpperCase() < b.rel.toUpperCase() ? -1 : a.rel.toUpperCase() > b.rel.toUpperCase() ? 1 : 0,
  );
  return encontrados;
}

/** Compara dos carpetas `texts` y devuelve el detalle por archivo. */
export function compararCarpetas(carpetaA: string, carpetaB: string): ResultadoComparacion {
  const archivosA = listarArchivosLang(carpetaA);
  const archivosB = listarArchivosLang(carpetaB);

  const porRutaB = new Map<string, ArchivoEncontrado>();
  for (const a of archivosB) porRutaB.set(a.rel.toLowerCase(), a);

  const vistos = new Set<string>();
  const archivos: ArchivoDiff[] = [];
  const resumen: ResumenComparacion = {
    archivos: 0,
    iguales: 0,
    soloA: 0,
    soloB: 0,
    cambiados: 0,
    altas: 0,
    bajas: 0,
    cambiadas: 0,
  };

  for (const a of archivosA) {
    const clave = a.rel.toLowerCase();
    vistos.add(clave);
    const b = porRutaB.get(clave);
    const diff = b ? compararArchivo(a, b) : soloArchivo(a, 'soloA');
    archivos.push(diff);
    acumular(resumen, diff);
  }

  for (const b of archivosB) {
    if (vistos.has(b.rel.toLowerCase())) continue;
    const diff = soloArchivo(b, 'soloB');
    archivos.push(diff);
    acumular(resumen, diff);
  }

  archivos.sort((x, y) => {
    const rx = x.ruta.toUpperCase();
    const ry = y.ruta.toUpperCase();
    return rx < ry ? -1 : rx > ry ? 1 : 0;
  });
  resumen.archivos = archivos.length;

  return { carpetaA, carpetaB, archivos, resumen };
}

function acumular(resumen: ResumenComparacion, diff: ArchivoDiff): void {
  resumen.altas += diff.altas;
  resumen.bajas += diff.bajas;
  resumen.cambiadas += diff.cambiadas;
  if (diff.estado === 'igual') resumen.iguales++;
  else if (diff.estado === 'soloA') resumen.soloA++;
  else if (diff.estado === 'soloB') resumen.soloB++;
  else resumen.cambiados++;
}

function compararArchivo(a: ArchivoEncontrado, b: ArchivoEncontrado): ArchivoDiff {
  let dictA: Map<string, string>;
  let dictB: Map<string, string>;
  try {
    dictA = diccionario(leer(a.abs));
    dictB = diccionario(leer(b.abs));
  } catch (e) {
    return {
      ruta: a.rel,
      estado: 'cambiado',
      altas: 0,
      bajas: 0,
      cambiadas: 0,
      detalles: [],
      error: mensajeDeError(e),
    };
  }

  const detalles: ClaveDiff[] = [];
  let altas = 0;
  let bajas = 0;
  let cambiadas = 0;

  for (const [clave, textoA] of dictA) {
    if (!dictB.has(clave)) {
      altas++;
      if (detalles.length < MAX_DETALLES) {
        detalles.push({ clave, estado: 'alta', a: textoA });
      }
    } else {
      const textoB = dictB.get(clave) ?? '';
      if (textoA !== textoB) {
        cambiadas++;
        if (detalles.length < MAX_DETALLES) {
          detalles.push({ clave, estado: 'cambiada', a: textoA, b: textoB });
        }
      }
    }
  }

  for (const [clave, textoB] of dictB) {
    if (dictA.has(clave)) continue;
    bajas++;
    if (detalles.length < MAX_DETALLES) {
      detalles.push({ clave, estado: 'baja', b: textoB });
    }
  }

  const estado: EstadoArchivo =
    altas === 0 && bajas === 0 && cambiadas === 0 ? 'igual' : 'cambiado';

  return { ruta: a.rel, estado, altas, bajas, cambiadas, detalles };
}

function soloArchivo(archivo: ArchivoEncontrado, estado: 'soloA' | 'soloB'): ArchivoDiff {
  let dict = new Map<string, string>();
  let error: string | undefined;
  try {
    dict = diccionario(leer(archivo.abs));
  } catch (e) {
    dict = new Map();
    error = mensajeDeError(e);
  }

  const detalles: ClaveDiff[] = [];
  for (const [clave, texto] of dict) {
    if (detalles.length >= MAX_DETALLES) break;
    if (estado === 'soloA') detalles.push({ clave, estado: 'alta', a: texto });
    else detalles.push({ clave, estado: 'baja', b: texto });
  }

  return {
    ruta: archivo.rel,
    estado,
    altas: estado === 'soloA' ? dict.size : 0,
    bajas: estado === 'soloB' ? dict.size : 0,
    cambiadas: 0,
    detalles,
    error,
  };
}

/** Texto breve con los totales, para la barra de estado o una notificación. */
export function resumenComparacion(r: ResultadoComparacion): string {
  return (
    `${r.resumen.archivos} archivos · ${r.resumen.altas} altas · ` +
    `${r.resumen.bajas} bajas · ${r.resumen.cambiadas} cambiadas`
  );
}

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
