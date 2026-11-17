/**
 * Detección de nombres propios candidatos a conservarse sin traducir.
 *
 * No es un análisis lingüístico completo: busca palabras capitalizadas que
 * aparecen fuera del inicio de una frase, mayúsculas internas (Minecraft,
 * iPhone), siglas y honoríficos (Sir, Lord, Dr.). El usuario decide cuáles
 * añadir al glosario.
 */

export interface CandidatoNombre {
  palabra: string;
  ocurrencias: number;
  /** Hasta dos textos donde aparece, para dar contexto. */
  ejemplos: string[];
}

const HONORIFICOS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'sir',
  'lady',
  'lord',
  'king',
  'queen',
  'prince',
  'princess',
  'captain',
  'professor',
  'master',
  'saint',
  'st',
  'madam',
  'madame',
]);

/** Palabras comunes que suelen empezar frases y no son nombres propios. */
const COMUNES = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'you',
  'your',
  'yours',
  'we',
  'our',
  'ours',
  'they',
  'their',
  'theirs',
  'it',
  'its',
  'he',
  'she',
  'his',
  'her',
  'hers',
  'him',
  'them',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'when',
  'then',
  'else',
  'for',
  'from',
  'with',
  'without',
  'not',
  'no',
  'yes',
  'all',
  'any',
  'some',
  'each',
  'every',
  'new',
  'old',
  'use',
  'using',
  'open',
  'close',
  'save',
  'cancel',
  'error',
  'warning',
  'loading',
  'enabled',
  'disabled',
  'unknown',
  'default',
  'here',
  'there',
  'what',
  'where',
  'who',
  'why',
  'how',
  'which',
  'while',
  'also',
  'only',
  'just',
  'now',
  'more',
  'most',
  'less',
  'least',
  'first',
  'last',
  'next',
  'previous',
  'one',
  'two',
  'three',
  'good',
  'bad',
  'best',
  'better',
  'hello',
  'welcome',
  'please',
  'thanks',
  'thank',
  'sorry',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'pero',
  'si',
  'cuando',
  'entonces',
  'para',
  'por',
  'con',
  'sin',
  'todo',
  'todos',
  'toda',
  'todas',
  'algun',
  'algunos',
  'cada',
  'nuevo',
  'nueva',
  'viejo',
  'vieja',
  'usar',
  'abrir',
  'cerrar',
  'guardar',
  'cancelar',
  'error',
  'aviso',
  'cargando',
  'aqui',
  'alli',
  'que',
  'quien',
  'como',
  'porque',
  'tambien',
  'solo',
  'ahora',
  'mas',
  'menos',
  'primero',
  'ultimo',
  'siguiente',
  'anterior',
  'uno',
  'dos',
  'tres',
  'bueno',
  'malo',
  'mejor',
  'hola',
  'bienvenido',
  'gracias',
  'perdon',
]);

const RE_PALABRA = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*/g;

interface Acumulado {
  palabra: string;
  ocurrencias: number;
  ejemplos: string[];
  fueraDeInicio: boolean;
  honorifico: boolean;
  mayusculasInternas: boolean;
  siglas: boolean;
}

/** Detecta candidatos en una lista de textos. */
export function detectarNombresPropios(
  textos: readonly string[],
  maxCandidatos = 200,
): CandidatoNombre[] {
  const porPalabra = new Map<string, Acumulado>();

  for (const texto of textos) {
    if (!texto) continue;
    RE_PALABRA.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RE_PALABRA.exec(texto)) !== null) {
      const palabra = match[0];
      if (palabra.length < 2) continue;

      const minusculas = palabra.toLowerCase();
      const honorifico = HONORIFICOS.has(minusculas);
      const mayusculasInternas = /[a-zà-öø-ÿ][A-ZÀ-ÖØ-Þ]/.test(palabra);
      const siglas = /^[A-ZÀ-ÖØ-Þ]{2,}$/.test(palabra);
      if (siglas && palabra.length <= 2) continue;

      // Debe empezar por mayúscula, salvo marcas como iPhone o eBay.
      if (!/^[A-ZÀ-ÖØ-Þ]/.test(palabra) && !mayusculasInternas) continue;

      const antes = texto.slice(0, match.index);
      const anterior = antes.trimEnd().slice(-1);
      const inicioFrase =
        match.index === 0 || /[.!?:\n]/.test(anterior) || antes.trim() === '';

      const clave = minusculas;
      let acumulado = porPalabra.get(clave);
      if (!acumulado) {
        acumulado = {
          palabra,
          ocurrencias: 0,
          ejemplos: [],
          fueraDeInicio: false,
          honorifico: false,
          mayusculasInternas: false,
          siglas: false,
        };
        porPalabra.set(clave, acumulado);
      }

      acumulado.ocurrencias++;
      if (!inicioFrase) acumulado.fueraDeInicio = true;
      acumulado.honorifico ||= honorifico;
      acumulado.mayusculasInternas ||= mayusculasInternas;
      acumulado.siglas ||= siglas;
      if (acumulado.ejemplos.length < 2 && !acumulado.ejemplos.includes(texto)) {
        acumulado.ejemplos.push(texto);
      }
    }
  }

  return [...porPalabra.values()]
    .filter((a) => {
      const especial = a.honorifico || a.mayusculasInternas || a.siglas;
      if (COMUNES.has(a.palabra.toLowerCase()) && !especial) return false;
      return a.fueraDeInicio || especial;
    })
    .map((a) => ({
      palabra: a.palabra,
      ocurrencias: a.ocurrencias,
      ejemplos: a.ejemplos,
    }))
    .sort((a, b) => {
      if (b.ocurrencias !== a.ocurrencias) return b.ocurrencias - a.ocurrencias;
      return a.palabra.toUpperCase() < b.palabra.toUpperCase() ? -1 : 1;
    })
    .slice(0, maxCandidatos);
}
