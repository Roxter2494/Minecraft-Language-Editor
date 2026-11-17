import type { ArchivoLang, EstadoHerencia } from './types';
import { diccionario } from './langFileIo';
import { t } from './i18n';

/**
 * Herencia de traducciones desde una versión anterior del pack.
 *
 * Compara el origen actual (p. ej. en_US nuevo) con el origen anterior y trae
 * las traducciones del destino anterior (p. ej. es_ES viejo) a las claves que
 * siguen existiendo. No escribe archivos: devuelve el mapa y los estados para
 * que el panel los muestre y el usuario revise antes de guardar.
 */

export interface CambiosVersion {
  /** Claves que existen en el origen actual y no en el anterior. */
  nuevas: string[];
  /** Claves que existían y ya no están en el origen actual. */
  eliminadas: string[];
  /** Claves presentes en ambos, pero con texto original distinto. */
  cambiadas: string[];
}

export interface ResultadoHerencia {
  /** Clave → traducción resultante (puede ser '' si no hay nada que heredar). */
  traducciones: Map<string, string>;
  /** Clave → estado para colorear/filtrar en la tabla. */
  estados: Map<string, EstadoHerencia>;
  cambios: CambiosVersion;
  /** Traducciones traídas de la versión anterior (incluye renombradas). */
  heredadas: number;
  /** De las heredadas, cuántas vinieron por renombre de clave. */
  renombradas: number;
  /** Heredadas cuyo texto original cambió: conviene revisarlas. */
  revisar: number;
  /** Claves nuevas sin traducción anterior. */
  nuevas: number;
  /** Claves totales del origen actual. */
  total: number;
}

/** Textos demasiado cortos o genéricos no sirven para emparejar por contenido. */
const TEXTOS_COMUNES = new Set([
  'yes',
  'no',
  'ok',
  'on',
  'off',
  'true',
  'false',
  'none',
  'all',
  'item',
  'block',
  'back',
  'done',
  'next',
  'close',
  'open',
  'save',
  'cancel',
  'error',
  'warning',
  'loading',
  'enabled',
  'disabled',
  'unknown',
  'default',
]);

function esTextoComun(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return t.length < 4 || TEXTOS_COMUNES.has(t);
}

/** Compara dos orígenes (mismo idioma, distinta versión). */
export function compararVersiones(
  actual: ArchivoLang,
  anterior: ArchivoLang,
): CambiosVersion {
  const actualDict = diccionario(actual);
  const anteriorDict = diccionario(anterior);

  const nuevas: string[] = [];
  const cambiadas: string[] = [];
  for (const [clave, texto] of actualDict) {
    if (!anteriorDict.has(clave)) {
      nuevas.push(clave);
    } else if (anteriorDict.get(clave) !== texto) {
      cambiadas.push(clave);
    }
  }

  const eliminadas: string[] = [];
  for (const clave of anteriorDict.keys()) {
    if (!actualDict.has(clave)) eliminadas.push(clave);
  }

  return { nuevas, eliminadas, cambiadas };
}

/**
 * Calcula las traducciones del origen actual heredando lo que había en el
 * destino anterior. Las traducciones actuales no vacías tienen prioridad.
 */
export function heredarTraducciones(
  actual: ArchivoLang,
  anteriorOrigen: ArchivoLang,
  anteriorDestino: ArchivoLang,
  traduccionesActuales: Map<string, string>,
): ResultadoHerencia {
  const actualDict = diccionario(actual);
  const viejoOrigenDict = diccionario(anteriorOrigen);
  const viejoDestinoDict = diccionario(anteriorDestino);
  const cambios = compararVersiones(actual, anteriorOrigen);

  // Claves viejas que desaparecieron, agrupadas por su texto original. Solo
  // sirven para renombrar si el texto es único y no es demasiado común.
  const huerfanasPorTexto = new Map<string, string[]>();
  for (const [clave, texto] of viejoOrigenDict) {
    if (actualDict.has(clave)) continue;
    if (!texto || esTextoComun(texto)) continue;
    const traduccion = viejoDestinoDict.get(clave);
    if (!traduccion) continue;
    const lista = huerfanasPorTexto.get(texto) ?? [];
    lista.push(clave);
    huerfanasPorTexto.set(texto, lista);
  }

  const traducciones = new Map<string, string>();
  const estados = new Map<string, EstadoHerencia>();
  let heredadas = 0;
  let renombradas = 0;
  let revisar = 0;
  let nuevas = 0;

  for (const [clave, fuenteActual] of actualDict) {
    const valorActual = traduccionesActuales.get(clave) ?? '';
    const valorViejo = viejoDestinoDict.get(clave) ?? '';
    const fuenteVieja = viejoOrigenDict.get(clave);

    // 1) Traducción actual válida. Se considera copia del inglés (y por tanto
    //    pendiente) si coincide con el origen y hay una traducción vieja distinta.
    const copiaDelIngles =
      valorActual !== '' &&
      valorActual === fuenteActual &&
      valorViejo !== '' &&
      valorViejo !== valorActual;

    if (valorActual !== '' && !copiaDelIngles) {
      traducciones.set(clave, valorActual);
      estados.set(clave, 'traducida');
      continue;
    }

    // 2) Misma clave en la versión anterior.
    if (valorViejo !== '') {
      traducciones.set(clave, valorViejo);
      const cambio = fuenteVieja !== undefined && fuenteVieja !== fuenteActual;
      estados.set(clave, cambio ? 'revisar' : 'heredada');
      heredadas++;
      if (cambio) revisar++;
      continue;
    }

    // 3) Renombre: la clave cambió pero el texto original es idéntico y único.
    const candidatas = huerfanasPorTexto.get(fuenteActual);
    if (candidatas && candidatas.length === 1) {
      const valor = viejoDestinoDict.get(candidatas[0]) ?? '';
      if (valor) {
        traducciones.set(clave, valor);
        estados.set(clave, 'heredada');
        heredadas++;
        renombradas++;
        continue;
      }
    }

    // 4) Sin traducción anterior.
    traducciones.set(clave, '');
    if (!viejoOrigenDict.has(clave)) {
      estados.set(clave, 'nueva');
      nuevas++;
    } else {
      estados.set(clave, 'vacia');
    }
  }

  return {
    traducciones,
    estados,
    cambios,
    heredadas,
    renombradas,
    revisar,
    nuevas,
    total: actualDict.size,
  };
}

/** Texto corto para mostrar en la barra de estado. */
export function resumenHerencia(r: ResultadoHerencia, idioma: string = 'es'): string {
  const partes = [
    t(idioma, 'inheritInherited', { n: r.heredadas }),
    t(idioma, 'inheritReview', { n: r.revisar }),
    t(idioma, 'inheritNew', { n: r.nuevas }),
    t(idioma, 'inheritObsolete', { n: r.cambios.eliminadas.length }),
  ];
  if (r.renombradas > 0) partes.push(t(idioma, 'inheritRenamed', { n: r.renombradas }));
  return t(idioma, 'inheritSummary', { parts: partes.join(' · ') });
}
