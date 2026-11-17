/**
 * Glosario de terminología aprobada.
 *
 * Formato de texto, una entrada por línea:
 *
 *   original = equivalencia1 | equivalencia2
 *
 * La primera equivalencia es la preferida. Las líneas vacías y las que empiezan
 * por `#` se ignoran. El glosario se envía como contexto a la IA; nunca
 * reemplaza texto por sí solo.
 */

export interface EntradaGlosario {
  original: string;
  equivalencias: string[];
}

/** Parsea el texto del glosario. */
export function parseGlosario(texto: string | null | undefined): EntradaGlosario[] {
  if (!texto) return [];
  const entradas: EntradaGlosario[] = [];
  const vistos = new Set<string>();

  for (const lineaCruda of texto.split(/\r\n|\n|\r/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith('#')) continue;
    const idx = linea.indexOf('=');
    if (idx <= 0) continue;

    const original = linea.slice(0, idx).trim();
    const resto = linea.slice(idx + 1);
    if (!original) continue;

    const equivalencias = resto
      .split('|')
      .map((e) => e.trim())
      .filter(Boolean);
    if (equivalencias.length === 0) continue;

    const clave = original.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    entradas.push({ original, equivalencias });
  }

  return entradas;
}

/** Serializa las entradas con el formato canónico. */
export function serializarGlosario(entradas: readonly EntradaGlosario[]): string {
  const lineas = entradas.map(
    (e) => `${e.original} = ${e.equivalencias.join(' | ')}`,
  );
  return lineas.join('\r\n') + (lineas.length ? '\r\n' : '');
}

/** Equivalencia preferida de un término, o cadena vacía. */
export function equivalenciaPreferida(
  entradas: readonly EntradaGlosario[],
  original: string,
): string {
  const buscado = original.trim().toLowerCase();
  if (!buscado) return '';
  const entrada = entradas.find((e) => e.original.trim().toLowerCase() === buscado);
  return entrada?.equivalencias[0] ?? '';
}

/**
 * Contexto compacto para el prompt de la IA. Se limita el número de términos
 * para no inflar el mensaje con glosarios enormes.
 */
export function contextoGlosario(
  entradas: readonly EntradaGlosario[],
  maxTerminos = 250,
): string {
  if (entradas.length === 0) return '';
  return entradas
    .slice(0, maxTerminos)
    .map((e) => `- ${e.original} = ${e.equivalencias.join(' | ')}`)
    .join('\n');
}

/**
 * Añade o actualiza una entrada. Devuelve una lista nueva; si el término ya
 * existe se conservan sus equivalencias y se añaden las que falten.
 */
export function agregarEntrada(
  entradas: readonly EntradaGlosario[],
  original: string,
  equivalencias: readonly string[],
): EntradaGlosario[] {
  const termino = original.trim();
  const nuevas = equivalencias.map((e) => e.trim()).filter(Boolean);
  if (!termino || nuevas.length === 0) return [...entradas];

  const salida = entradas.map((e) => ({
    original: e.original,
    equivalencias: [...e.equivalencias],
  }));
  const existente = salida.find(
    (e) => e.original.trim().toLowerCase() === termino.toLowerCase(),
  );

  if (!existente) {
    salida.push({ original: termino, equivalencias: nuevas });
    return salida;
  }

  const set = new Set(existente.equivalencias.map((e) => e.toLowerCase()));
  for (const eq of nuevas) {
    if (set.has(eq.toLowerCase())) continue;
    existente.equivalencias.push(eq);
    set.add(eq.toLowerCase());
  }
  return salida;
}
