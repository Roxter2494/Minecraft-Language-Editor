import type { Idioma } from './types';

/**
 * Catálogo de idiomas que admite Minecraft Bedrock. En pantalla se muestra el
 * nombre amigable; en el archivo (.lang / languages.json) siempre se usa el código.
 */
export const CATALOGO: readonly Idioma[] = [
  { codigo: 'en_US', nombre: 'Inglés (Estados Unidos)' },
  { codigo: 'en_GB', nombre: 'Inglés (Reino Unido)' },
  { codigo: 'es_ES', nombre: 'Español (España)' },
  { codigo: 'es_MX', nombre: 'Español (México)' },
  { codigo: 'es_AR', nombre: 'Español (Argentina)' },
  { codigo: 'es_CL', nombre: 'Español (Chile)' },
  { codigo: 'es_CO', nombre: 'Español (Colombia)' },
  { codigo: 'es_PE', nombre: 'Español (Perú)' },
  { codigo: 'es_VE', nombre: 'Español (Venezuela)' },
  { codigo: 'pt_BR', nombre: 'Portugués (Brasil)' },
  { codigo: 'pt_PT', nombre: 'Portugués (Portugal)' },
  { codigo: 'fr_FR', nombre: 'Francés (Francia)' },
  { codigo: 'fr_CA', nombre: 'Francés (Canadá)' },
  { codigo: 'de_DE', nombre: 'Alemán' },
  { codigo: 'it_IT', nombre: 'Italiano' },
  { codigo: 'nl_NL', nombre: 'Neerlandés' },
  { codigo: 'pl_PL', nombre: 'Polaco' },
  { codigo: 'ru_RU', nombre: 'Ruso' },
  { codigo: 'uk_UA', nombre: 'Ucraniano' },
  { codigo: 'cs_CZ', nombre: 'Checo' },
  { codigo: 'sk_SK', nombre: 'Eslovaco' },
  { codigo: 'hu_HU', nombre: 'Húngaro' },
  { codigo: 'ro_RO', nombre: 'Rumano' },
  { codigo: 'bg_BG', nombre: 'Búlgaro' },
  { codigo: 'el_GR', nombre: 'Griego' },
  { codigo: 'tr_TR', nombre: 'Turco' },
  { codigo: 'sv_SE', nombre: 'Sueco' },
  { codigo: 'nb_NO', nombre: 'Noruego' },
  { codigo: 'da_DK', nombre: 'Danés' },
  { codigo: 'fi_FI', nombre: 'Finés' },
  { codigo: 'ja_JP', nombre: 'Japonés' },
  { codigo: 'ko_KR', nombre: 'Coreano' },
  { codigo: 'zh_CN', nombre: 'Chino simplificado' },
  { codigo: 'zh_TW', nombre: 'Chino tradicional' },
  { codigo: 'ar_SA', nombre: 'Árabe' },
  { codigo: 'he_IL', nombre: 'Hebreo' },
  { codigo: 'hi_IN', nombre: 'Hindi' },
  { codigo: 'th_TH', nombre: 'Tailandés' },
  { codigo: 'vi_VN', nombre: 'Vietnamita' },
  { codigo: 'id_ID', nombre: 'Indonesio' },
  { codigo: 'ms_MY', nombre: 'Malayo' },
  { codigo: 'fil_PH', nombre: 'Filipino' },
  { codigo: 'ca_ES', nombre: 'Catalán' },
];

/** Nombre amigable del código; si se desconoce, devuelve el propio código. */
export function nombreDe(codigo: string | null | undefined): string {
  if (!codigo || !codigo.trim()) return '';
  const id = CATALOGO.find((i) => i.codigo.toLowerCase() === codigo.toLowerCase());
  return id?.nombre ?? codigo;
}

/** Descripción de un idioma para el prompt de la IA: «Alemán · de_DE». */
export function paraPrompt(codigo: string | null | undefined): string {
  if (!codigo || !codigo.trim()) return '';
  const nombre = nombreDe(codigo);
  return nombre.toLowerCase() === codigo.toLowerCase() ? codigo : `${nombre} · ${codigo}`;
}

/** Formato de código de idioma válido: ll_CC (p. ej. es_MX, zh_CN). */
export function esCodigoValido(codigo: string | null | undefined): boolean {
  return !!codigo && /^[a-z]{2,3}[-_][a-z]{2}$/i.test(codigo.trim());
}

/**
 * Canoniza un código de idioma a `ll_CC` (minúsculas + guion bajo + mayúsculas).
 * Acepta `es_mx`, `ES_MX` o `es-MX` y devuelve `es_MX`. Si no tiene el formato
 * esperado, devuelve el texto recortado tal cual.
 */
export function normalizarCodigo(codigo: string | null | undefined): string {
  const limpio = (codigo ?? '').trim();
  const partes = /^([A-Za-z]{2,3})[-_]([A-Za-z]{2})$/.exec(limpio);
  if (!partes) return limpio;
  return `${partes[1].toLowerCase()}_${partes[2].toUpperCase()}`;
}

/** Filtra el catálogo por código o nombre (sin distinguir mayúsculas ni tildes). */
export function buscar(filtro: string | null | undefined): Idioma[] {
  if (!filtro || !filtro.trim()) return [...CATALOGO];
  const f = normalizar(filtro);
  return CATALOGO.filter(
    (i) => normalizar(i.codigo).includes(f) || normalizar(i.nombre).includes(f),
  );
}

/** Idioma hermano de español (es_ES ↔ es_MX) o cadena vacía si no aplica. */
export function hermanoEspanol(codigo: string | null | undefined): string {
  if (!codigo) return '';
  if (codigo.toLowerCase() === 'es_es') return 'es_MX';
  if (codigo.toLowerCase() === 'es_mx') return 'es_ES';
  return '';
}

/**
 * Catálogo para el selector destino: catálogo completo + códigos existentes que
 * no estén en él. El orden es catálogo y luego los personalizados ordenados.
 */
export function catalogoDestino(existentes: readonly string[]): Idioma[] {
  const lista = [...CATALOGO];
  const conocidos = new Set(CATALOGO.map((i) => i.codigo.toLowerCase()));
  const extra = existentes
    .filter((c) => c && c.trim() && !conocidos.has(c.toLowerCase()))
    .sort((a, b) => (a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0));
  for (const codigo of extra) lista.push({ codigo, nombre: codigo });
  return lista;
}

/** Normaliza quitando tildes y pasando a minúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
