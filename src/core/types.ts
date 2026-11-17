/**
 * Tipos compartidos entre la extensión (Node) y las webviews (navegador).
 * No deben importar nada de `vscode` ni de `node`.
 */

import type { ArchivoDiff, ResumenComparacion } from './comparar';
import type { FuenteTexto, TextoDetectado } from './deteccion';

/** Una línea de un archivo .lang: comentario/vacía o par clave=valor. */
export interface LineaLang {
  esPar: boolean;
  clave: string;
  texto: string;
  /** Contenido original de la línea cuando no es un par. */
  cruda: string;
}

/** Contenido estructurado de un .lang de Minecraft Bedrock. */
export interface ArchivoLang {
  ruta: string;
  codigo: string;
  lineas: LineaLang[];
}

/** Código de idioma con su nombre amigable. */
export interface Idioma {
  codigo: string;
  nombre: string;
}

/**
 * Estado de una fila tras heredar una versión anterior.
 * - traducida: ya había una traducción válida.
 * - heredada: se copió de la versión anterior sin cambios en el inglés.
 * - revisar: se heredó, pero el texto original cambió.
 * - nueva: la clave no existía en la versión anterior.
 * - vacia: la clave existía, pero no tenía traducción anterior.
 */
export type EstadoHerencia = 'traducida' | 'heredada' | 'revisar' | 'nueva' | 'vacia';

/** Fila que se muestra en la tabla del editor. */
export interface FilaLang {
  key: string;
  source: string;
  value: string;
  estado?: EstadoHerencia;
}

/** Modelo de lenguaje disponible para la IA. */
export interface ModeloIa {
  /** Identificador estable `proveedor/id`. */
  id: string;
  /** Nombre legible para el desplegable. */
  nombre: string;
}

/** Estado completo que la extensión envía a la webview. */
export interface EditorState {
  folder: string;
  sourceCode: string;
  targetCode: string;
  /** Códigos que ya tienen archivo .lang en la carpeta. */
  sourceCodes: string[];
  /** Todos los códigos con archivo en la carpeta (para marcar «(nuevo)»). */
  existingCodes: string[];
  /** Catálogo de idiomas. */
  languages: Idioma[];
  rows: FilaLang[];
  /** Si hay un origen cargado y se puede guardar. */
  canSave: boolean;
  /** Mostrar colores por familia de claves. */
  coloresClaves: boolean;
  /** Hay cambios sin guardar en la webview. */
  dirty: boolean;
  /** Tamaño de fuente de la tabla en píxeles. */
  fontSize: number;
  /** Alto mínimo de fila en píxeles. */
  rowHeight: number;
  /** Idioma de la interfaz. */
  idiomaUi: string;
  /** Modelos de lenguaje disponibles ahora mismo. */
  modelos: ModeloIa[];
  /** Modelo elegido (`proveedor/id`); vacío = automático. */
  modeloIa: string;
  /** Proveedor de IA activo (`vscode`, `openai`, `anthropic`, `google`, `compatible`). */
  proveedorIa: string;
}

/** Mensajes de la webview del editor a la extensión. */
export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'pickFolder' }
  | { type: 'changeSource'; code: string }
  | { type: 'changeTarget'; code: string }
  | { type: 'customTarget' }
  | { type: 'save'; translations: Record<string, string> }
  | { type: 'draft'; translations: Record<string, string> }
  | { type: 'clearDraft' }
  | { type: 'inheritPrevious' }
  | { type: 'reload' }
  | { type: 'openFolder' }
  | { type: 'compareFolders' }
  | { type: 'detectTexts' }
  | { type: 'editGlossary' }
  | { type: 'reviewNames' }
  | { type: 'translateAI' }
  | { type: 'reviewAI' }
  | { type: 'configureAI' }
  | { type: 'setModel'; id: string }
  | { type: 'dirty'; dirty: boolean };

/** Mensajes de la extensión a la webview del editor. */
export type ExtensionToWebview =
  | { type: 'state'; state: EditorState }
  | { type: 'saved'; ok: boolean; message: string }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string };

// ---------------------------------------------------------------------------
// Comparación de carpetas
// ---------------------------------------------------------------------------

export interface CompararState {
  carpetaA: string;
  carpetaB: string;
  archivos: ArchivoDiff[];
  resumen: ResumenComparacion;
  idiomaUi: string;
}

export type CompararToWebview =
  | { type: 'compareState'; state: CompararState }
  | { type: 'compareError'; message: string };

export type CompararFromWebview =
  | { type: 'ready' }
  | { type: 'pickFolder'; side: 'a' | 'b' }
  | { type: 'swap' }
  | { type: 'recompare' };

// ---------------------------------------------------------------------------
// Detección de textos
// ---------------------------------------------------------------------------

export interface DeteccionState {
  folder: string;
  textos: TextoDetectado[];
  idiomaUi: string;
  escaneando: boolean;
}

export type DeteccionToWebview =
  | { type: 'detectState'; state: DeteccionState }
  | { type: 'detectError'; message: string }
  | { type: 'importDone' };

export type DeteccionFromWebview =
  | { type: 'ready' }
  | { type: 'pickFolder' }
  | { type: 'scan' }
  | { type: 'import'; textos: TextoDetectado[] };

// ---------------------------------------------------------------------------
// Configuración de IA (proveedor y clave API)
// ---------------------------------------------------------------------------

/** Estado del panel «Configurar IA». Nunca incluye la clave API. */
export interface IaConfigState {
  proveedor: string;
  modelo: string;
  urlBase: string;
  /** Si hay una clave guardada para el proveedor. */
  tieneClave: boolean;
  /** Proveedores que ya tienen una clave guardada. */
  claves: string[];
  idiomaUi: string;
}

export type IaConfigToWebview =
  | { type: 'iaState'; state: IaConfigState }
  | { type: 'iaInfo'; message: string }
  | { type: 'iaError'; message: string };

export type IaConfigFromWebview =
  | { type: 'ready' }
  | {
      type: 'save';
      proveedor: string;
      modelo: string;
      urlBase: string;
      /** Clave nueva; vacía = conservar la guardada. */
      clave?: string;
    }
  | { type: 'deleteKey'; proveedor: string }
  | {
      type: 'test';
      proveedor: string;
      modelo: string;
      urlBase: string;
      clave?: string;
    }
  | { type: 'openKeyUrl'; url: string };

export type { ArchivoDiff, ResumenComparacion, FuenteTexto, TextoDetectado };
