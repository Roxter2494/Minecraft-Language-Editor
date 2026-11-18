import { colorDeClave } from '../src/core/coloresClaves';
import { nombreDe } from '../src/core/langLocales';
import { normalizarIdiomaUi, t } from '../src/core/i18n';
import type {
  EditorState,
  EstadoHerencia,
  ExtensionToWebview,
  FilaLang,
  WebviewToExtension,
} from '../src/core/types';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const PAGE = 1000;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No se encontró #${id}`);
  return found as T;
}

const folderEl = el<HTMLDivElement>('folder');
const selOrigen = el<HTMLSelectElement>('selOrigen');
const selDestino = el<HTMLSelectElement>('selDestino');
const txtBuscar = el<HTMLInputElement>('txtBuscar');
const chkSinTraducir = el<HTMLInputElement>('chkSinTraducir');
const chkRevisar = el<HTMLInputElement>('chkRevisar');
const contadorEl = el<HTMLDivElement>('contador');
const btnFolder = el<HTMLButtonElement>('btnFolder');
const btnHeredar = el<HTMLButtonElement>('btnHeredar');
const btnReveal = el<HTMLButtonElement>('btnReveal');
const btnReload = el<HTMLButtonElement>('btnReload');
const btnSave = el<HTMLButtonElement>('btnSave');
const btnMore = el<HTMLButtonElement>('btnMore');
const btnUndo = el<HTMLButtonElement>('btnUndo');
const btnRedo = el<HTMLButtonElement>('btnRedo');
const btnComparar = el<HTMLButtonElement>('btnComparar');
const btnDetectar = el<HTMLButtonElement>('btnDetectar');
const btnGlosario = el<HTMLButtonElement>('btnGlosario');
const btnNombres = el<HTMLButtonElement>('btnNombres');
const btnIaTraducir = el<HTMLButtonElement>('btnIaTraducir');
const btnIaRevisar = el<HTMLButtonElement>('btnIaRevisar');
const btnConfigIa = el<HTMLButtonElement>('btnConfigIa');
const selModelo = el<HTMLSelectElement>('selModelo');
const tbody = el<HTMLTableSectionElement>('cuerpo');
const vacioEl = el<HTMLDivElement>('vacio');
const estadoEl = el<HTMLSpanElement>('estado');
const thOrigen = document.querySelector<HTMLTableCellElement>('th.col-source')!;
const thNuevo = document.querySelector<HTMLTableCellElement>('th.col-value')!;

let state: EditorState | null = null;
let rows: FilaLang[] = [];
let visibles: FilaLang[] = [];
let values = new Map<string, string>();
let filaPorClave = new Map<string, FilaLang>();
let inputPorClave = new Map<string, HTMLTextAreaElement>();
let renderLimit = PAGE;
let dirty = false;
let ultimaClave = '';
let idioma = 'es';
let temporizadorBorrador: number | null = null;

/** Instantánea para deshacer/rehacer (valores y estados de las filas). */
interface Snapshot {
  values: Map<string, string>;
  estados: Map<string, EstadoHerencia | undefined>;
}

const MAX_HISTORIAL = 100;
let historial: Snapshot[] = [];
let indiceHistorial = -1;
let baseLimpia = true;
let temporizadorHistorial: number | null = null;

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<ExtensionToWebview>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'state':
      aplicarEstado(msg.state);
      break;
    case 'saved':
      btnSave.disabled = !state?.canSave;
      if (msg.ok) {
        setDirty(false);
        setEstado(msg.message);
      } else {
        // Si el guardado falló o fue parcial, los cambios siguen sin guardar:
        // vuelve a programar el borrador para no perderlos.
        if (dirty) programarBorrador();
        setEstado(msg.message);
      }
      break;
    case 'error':
      btnSave.disabled = !state?.canSave;
      if (dirty) programarBorrador();
      setEstado(msg.message);
      break;
    case 'info':
      setEstado(msg.message);
      break;
    default:
      break;
  }
});

btnFolder.addEventListener('click', () => vscode.postMessage({ type: 'pickFolder' }));
btnHeredar.addEventListener('click', () => vscode.postMessage({ type: 'inheritPrevious' }));
btnReveal.addEventListener('click', () => vscode.postMessage({ type: 'openFolder' }));
btnReload.addEventListener('click', () => vscode.postMessage({ type: 'reload' }));
btnSave.addEventListener('click', () => guardar());
btnMore.addEventListener('click', () => {
  renderLimit += PAGE;
  render();
});
btnUndo.addEventListener('click', () => deshacer());
btnRedo.addEventListener('click', () => rehacer());
btnComparar.addEventListener('click', () => vscode.postMessage({ type: 'compareFolders' }));
btnDetectar.addEventListener('click', () => vscode.postMessage({ type: 'detectTexts' }));
btnGlosario.addEventListener('click', () => vscode.postMessage({ type: 'editGlossary' }));
btnNombres.addEventListener('click', () => vscode.postMessage({ type: 'reviewNames' }));
btnIaTraducir.addEventListener('click', () => vscode.postMessage({ type: 'translateAI' }));
btnIaRevisar.addEventListener('click', () => vscode.postMessage({ type: 'reviewAI' }));
btnConfigIa.addEventListener('click', () => vscode.postMessage({ type: 'configureAI' }));

selOrigen.addEventListener('change', () => {
  const code = selOrigen.value;
  // Se revierte de inmediato; la extensión enviará el estado si acepta el cambio.
  selOrigen.value = state?.sourceCode ?? code;
  vscode.postMessage({ type: 'changeSource', code });
});

selDestino.addEventListener('change', () => {
  const code = selDestino.value;
  selDestino.value = state?.targetCode ?? code;
  if (code === '__custom__') {
    vscode.postMessage({ type: 'customTarget' });
    return;
  }
  vscode.postMessage({ type: 'changeTarget', code });
});

selModelo.addEventListener('change', () => {
  vscode.postMessage({ type: 'setModel', id: selModelo.value });
});

let temporizadorBusqueda: number | null = null;
txtBuscar.addEventListener('input', () => {
  // Con tablas grandes, filtrar en cada tecla bloquea la interfaz: se agrupa.
  if (temporizadorBusqueda !== null) window.clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = window.setTimeout(() => {
    temporizadorBusqueda = null;
    renderLimit = PAGE;
    render();
  }, 150);
});
chkSinTraducir.addEventListener('change', () => {
  renderLimit = PAGE;
  render();
});
chkRevisar.addEventListener('change', () => {
  renderLimit = PAGE;
  render();
});

// Atajos globales (elegidos para no chocar con los de VS Code).
document.addEventListener('keydown', (event) => {
  const ctrl = event.ctrlKey || event.metaKey;
  const alt = event.altKey;
  const enBuscador = document.activeElement === txtBuscar;

  if (ctrl && event.key.toLowerCase() === 's') {
    event.preventDefault();
    guardar();
    return;
  }
  if (ctrl && !event.shiftKey && event.key.toLowerCase() === 'z' && !enBuscador) {
    event.preventDefault();
    deshacer();
    return;
  }
  if (
    ((ctrl && event.key.toLowerCase() === 'y') ||
      (ctrl && event.shiftKey && event.key.toLowerCase() === 'z')) &&
    !enBuscador
  ) {
    event.preventDefault();
    rehacer();
    return;
  }
  if (ctrl && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    txtBuscar.focus();
    txtBuscar.select();
    return;
  }
  if (alt && !ctrl && event.code === 'KeyO') {
    event.preventDefault();
    vscode.postMessage({ type: 'pickFolder' });
    return;
  }
  if (alt && !ctrl && event.code === 'KeyD') {
    event.preventDefault();
    const key = claveEnfocada();
    if (key) copiarFila(key);
    return;
  }
  if (alt && !ctrl && event.code === 'KeyN') {
    event.preventDefault();
    siguienteSinTraducir();
    return;
  }
  if (alt && !ctrl && event.code === 'KeyH') {
    event.preventDefault();
    vscode.postMessage({ type: 'inheritPrevious' });
    return;
  }
  if (ctrl && alt) {
    const atajos: Record<string, WebviewToExtension> = {
      KeyC: { type: 'compareFolders' },
      KeyT: { type: 'detectTexts' },
      KeyG: { type: 'editGlossary' },
      KeyN: { type: 'reviewNames' },
      KeyI: { type: 'translateAI' },
      KeyR: { type: 'reviewAI' },
    };
    const msg = atajos[event.code];
    if (msg) {
      event.preventDefault();
      vscode.postMessage(msg);
      return;
    }
  }
  if (event.key === 'Escape') {
    const activo = document.activeElement as HTMLElement | null;
    if (activo && activo !== document.body) activo.blur();
  }
});

// Delegación de eventos de la tabla.
tbody.addEventListener('input', (event) => {
  const target = event.target as HTMLTextAreaElement | null;
  if (!target || !target.classList.contains('valor')) return;
  const key = target.dataset.key;
  if (!key) return;
  values.set(key, target.value);
  autoajustarArea(target);
  const row = rows.find((r) => r.key === key);
  if (row) {
    row.value = target.value;
    if (target.value) {
      row.estado = 'traducida';
    } else if (row.estado !== 'revisar') {
      row.estado = 'vacia';
    }
    const tr = target.closest('tr');
    if (tr) {
      tr.classList.remove(
        'estado-traducida',
        'estado-heredada',
        'estado-revisar',
        'estado-nueva',
        'estado-vacia',
      );
      if (row.estado) tr.classList.add('estado-' + row.estado);
      tr.title = row.estado ? tituloEstado(row.estado) : '';
    }
  }
  setDirty(true);
  registrarCambioDiferido();
  programarBorrador();
  actualizarContador();
});

tbody.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const tr = target?.closest<HTMLTableRowElement>('tr');
  if (tr?.dataset.key) ultimaClave = tr.dataset.key;
  const btn = target?.closest<HTMLButtonElement>('button.copiar');
  if (!btn) return;
  const key = btn.dataset.key;
  if (key) copiarFila(key);
});

tbody.addEventListener('focusin', (event) => {
  const target = event.target as HTMLTextAreaElement | null;
  if (target?.dataset?.key) ultimaClave = target.dataset.key;
});

tbody.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const target = event.target as HTMLTextAreaElement | null;
  if (!target || !target.classList.contains('valor')) return;
  event.preventDefault();
  enfocarSiguiente(target.dataset.key ?? '');
});

vscode.postMessage({ type: 'ready' });

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

function aplicarEstado(nuevo: EditorState): void {
  state = nuevo;
  rows = nuevo.rows;
  if (!rows.some((r) => r.key === ultimaClave)) ultimaClave = '';
  values = new Map(rows.map((r) => [r.key, r.value]));
  filaPorClave = new Map(rows.map((r) => [r.key, r]));
  renderLimit = PAGE;

  aplicarIdioma(nuevo);

  folderEl.textContent = nuevo.folder || tr('noFolder');
  folderEl.title = nuevo.folder;

  poblarSelects(nuevo);
  poblarModelos(nuevo);
  render();
  baseLimpia = !nuevo.dirty;
  resetHistorial();
  setDirty(nuevo.dirty);
  // Los estados sucios que llegan de la extensión (IA, herencia, importación o
  // restauración de borrador) también deben persistirse como borrador.
  if (nuevo.dirty) programarBorrador();
  btnSave.disabled = !nuevo.canSave;
  btnHeredar.disabled = !nuevo.canSave;
  btnReload.disabled = !nuevo.folder;
  btnDetectar.disabled = !nuevo.folder;
  btnNombres.disabled = !nuevo.canSave;
  btnIaTraducir.disabled = !nuevo.canSave;
  btnIaRevisar.disabled = !nuevo.canSave;

  if (!nuevo.folder) {
    setEstado(tr('statusChooseFolder'));
  } else if (!nuevo.sourceCode) {
    setEstado(tr('statusNoLangs'));
  } else if (!nuevo.targetCode) {
    setEstado(tr('statusChooseTarget'));
  } else {
    setEstado(tr('statusLoaded', { source: nuevo.sourceCode, target: nuevo.targetCode }));
  }
}

/** Aplica el idioma de la interfaz y las opciones de presentación. */
function aplicarIdioma(s: EditorState): void {
  idioma = normalizarIdiomaUi(s.idiomaUi);
  document.documentElement.lang = idioma;

  for (const nodo of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const clave = nodo.dataset.i18n;
    if (clave) nodo.textContent = tr(clave);
  }
  for (const nodo of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const clave = nodo.dataset.i18nTitle;
    if (clave) nodo.title = tr(clave);
  }
  for (const nodo of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const clave = nodo.dataset.i18nPlaceholder;
    if (clave) nodo.placeholder = tr(clave);
  }

  document.documentElement.style.setProperty('--table-font-size', `${s.fontSize}px`);
  document.documentElement.style.setProperty('--table-row-height', `${s.rowHeight}px`);
}

function tr(clave: string, vars?: Record<string, string | number>): string {
  return t(idioma, clave, vars);
}

function poblarSelects(s: EditorState): void {
  selOrigen.innerHTML = '';
  if (s.sourceCodes.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = tr('sinArchivosLang');
    selOrigen.appendChild(opt);
  } else {
    for (const code of s.sourceCodes) {
      const opt = document.createElement('option');
      opt.value = code;
      const nombre = nombreDe(code);
      opt.textContent = nombre && nombre !== code ? `${nombre} (${code})` : code;
      selOrigen.appendChild(opt);
    }
  }
  selOrigen.value = s.sourceCode;

  selDestino.innerHTML = '';
  const existentes = new Set(s.existingCodes.map((c) => c.toLowerCase()));
  for (const idioma of s.languages) {
    const opt = document.createElement('option');
    opt.value = idioma.codigo;
    const nuevo = !existentes.has(idioma.codigo.toLowerCase());
    opt.textContent = `${nuevo ? tr('nuevoPrefijo') : ''}${idioma.nombre} (${idioma.codigo})`;
    selDestino.appendChild(opt);
  }
  if (s.targetCode && !s.languages.some((i) => i.codigo === s.targetCode)) {
    const opt = document.createElement('option');
    opt.value = s.targetCode;
    opt.textContent = s.targetCode;
    selDestino.appendChild(opt);
  }
  const personalizado = document.createElement('option');
  personalizado.value = '__custom__';
  personalizado.textContent = tr('otroCodigo');
  selDestino.appendChild(personalizado);
  selDestino.value = s.targetCode;
}

/** Rellena el desplegable de modelos de IA disponibles. */
function poblarModelos(s: EditorState): void {
  selModelo.innerHTML = '';

  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = s.modelos.length === 0 ? tr('aiModelNone') : tr('aiModelAuto');
  selModelo.appendChild(auto);

  for (const modelo of s.modelos) {
    const opt = document.createElement('option');
    opt.value = modelo.id;
    opt.textContent = modelo.nombre;
    selModelo.appendChild(opt);
  }

  // Si el modelo guardado ya no está disponible, se usa el automático.
  const existe = s.modelos.some((m) => m.id === s.modeloIa);
  selModelo.value = existe ? s.modeloIa : '';
  // Con un proveedor externo el modelo se elige en «Configurar IA».
  const usaVscode = (s.proveedorIa ?? 'vscode') === 'vscode';
  selModelo.disabled = !usaVscode || s.modelos.length === 0;
  selModelo.title = usaVscode ? tr('aiModelTip') : tr('aiModelExternal');
}

// ---------------------------------------------------------------------------
// Tabla
// ---------------------------------------------------------------------------

function render(): void {
  if (!state) return;

  const busqueda = txtBuscar.value.trim().toLowerCase();
  const soloSinTraducir = chkSinTraducir.checked;
  const soloRevisar = chkRevisar.checked;

  visibles = rows.filter((r) => {
    const valor = valorDe(r.key);
    if (soloSinTraducir && valor) return false;
    if (soloRevisar && r.estado !== 'revisar' && r.estado !== 'nueva') return false;
    if (!busqueda) return true;
    return (
      r.key.toLowerCase().includes(busqueda) ||
      r.source.toLowerCase().includes(busqueda) ||
      valor.toLowerCase().includes(busqueda)
    );
  });

  thOrigen.textContent = state.sourceCode
    ? `${tr('original')} (${state.sourceCode})`
    : tr('original');
  thNuevo.textContent = state.targetCode ? `${tr('newValue')} (${state.targetCode})` : tr('newValue');

  tbody.innerHTML = '';
  inputPorClave.clear();

  const fragment = document.createDocumentFragment();
  const limite = Math.min(visibles.length, renderLimit);

  for (let i = 0; i < limite; i++) {
    const row = visibles[i];
    const trEl = document.createElement('tr');
    trEl.dataset.key = row.key;
    if (row.estado) {
      trEl.classList.add('estado-' + row.estado);
      trEl.title = tituloEstado(row.estado);
    }

    const tdClave = document.createElement('td');
    tdClave.className = 'col-key';
    tdClave.textContent = row.key;
    tdClave.title = row.key;
    if (state.coloresClaves) {
      const color = colorDeClave(row.key);
      if (color) tdClave.style.color = color;
    }

    const tdOrigen = document.createElement('td');
    tdOrigen.className = 'col-source';
    tdOrigen.textContent = row.source;
    tdOrigen.title = row.source;

    const tdValor = document.createElement('td');
    tdValor.className = 'col-value';
    const area = document.createElement('textarea');
    area.className = 'valor';
    area.rows = 1;
    area.dataset.key = row.key;
    area.value = valorDe(row.key);
    area.spellcheck = false;
    area.dir = 'auto';
    area.title = row.key;
    tdValor.appendChild(area);
    inputPorClave.set(row.key, area);

    const tdCopiar = document.createElement('td');
    tdCopiar.className = 'col-copy';
    const btn = document.createElement('button');
    btn.className = 'copiar';
    btn.dataset.key = row.key;
    btn.textContent = tr('copy');
    btn.title = tr('copyTip');
    tdCopiar.appendChild(btn);

    trEl.appendChild(tdClave);
    trEl.appendChild(tdOrigen);
    trEl.appendChild(tdValor);
    trEl.appendChild(tdCopiar);
    fragment.appendChild(trEl);
  }

  tbody.appendChild(fragment);

  // Ajusta la altura de los textareas con un solo cálculo de layout.
  autoajustarAreas(inputPorClave.values());

  if (rows.length === 0) {
    vacioEl.style.display = 'block';
    vacioEl.textContent = state.folder ? tr('noKeys') : tr('statusChooseFolder');
  } else if (visibles.length === 0) {
    vacioEl.style.display = 'block';
    vacioEl.textContent = tr('noMatch');
  } else {
    vacioEl.style.display = 'none';
  }

  btnMore.style.display = visibles.length > renderLimit ? 'inline-block' : 'none';
  actualizarContador();
}

function actualizarContador(): void {
  if (!state) {
    contadorEl.textContent = '';
    return;
  }
  const sinTraducir = rows.reduce((n, r) => n + (valorDe(r.key) ? 0 : 1), 0);
  const porRevisar = rows.reduce(
    (n, r) => n + (r.estado === 'revisar' || r.estado === 'nueva' ? 1 : 0),
    0,
  );
  contadorEl.textContent =
    `${tr('countVisible', { n: visibles.length })} · ` +
    `${tr('countUntranslated', { n: sinTraducir })}` +
    (porRevisar > 0 ? ` · ${tr('countReview', { n: porRevisar })}` : '') +
    ` · ${tr('countTotal', { n: rows.length })}`;
}

function valorDe(key: string): string {
  return values.get(key) ?? '';
}

/**
 * Ajusta la altura de varios textareas con un solo cálculo de layout.
 * Medir uno por uno fuerza un reflow por fila y bloquea la interfaz con
 * archivos grandes (miles de entradas).
 */
function autoajustarAreas(areas: Iterable<HTMLTextAreaElement>): void {
  const lista = Array.from(areas);
  if (lista.length === 0) return;
  for (const area of lista) area.style.height = 'auto';

  // Altura de una sola línea con la fuente y el padding actuales (la fuente es
  // configurable desde los ajustes de la extensión).
  const estilo = window.getComputedStyle(lista[0]);
  const altoLinea = parseFloat(estilo.lineHeight);
  const relleno = parseFloat(estilo.paddingTop) + parseFloat(estilo.paddingBottom);
  const unaLinea = Number.isFinite(altoLinea) ? Math.ceil(altoLinea + relleno) : 26;

  const alturas = lista.map((area) => {
    const contenido = area.scrollHeight;
    // Si el texto se parte en varias líneas se añaden 3 px: con la altura
    // exacta puede aparecer la barra vertical aunque se vea todo el texto.
    const extra = contenido > unaLinea + 1 ? 3 : 0;
    return Math.max(contenido, 26) + extra;
  });
  for (let i = 0; i < lista.length; i++) {
    lista[i].style.height = `${alturas[i]}px`;
  }
}

/** Ajusta la altura de un textarea al texto que contiene. */
function autoajustarArea(area: HTMLTextAreaElement): void {
  autoajustarAreas([area]);
}

function setValor(key: string, valor: string, afectadas?: HTMLTextAreaElement[]): void {
  values.set(key, valor);
  const row = filaPorClave.get(key);
  if (row) {
    row.value = valor;
    if (valor) row.estado = 'traducida';
  }
  const input = inputPorClave.get(key);
  if (input) {
    input.value = valor;
    // En operaciones masivas se ajusta la altura una sola vez al final.
    if (afectadas) afectadas.push(input);
    else autoajustarArea(input);
    const tr = input.closest('tr');
    if (tr && row) {
      tr.classList.remove(
        'estado-traducida',
        'estado-heredada',
        'estado-revisar',
        'estado-nueva',
        'estado-vacia',
      );
      if (row.estado) tr.classList.add('estado-' + row.estado);
      tr.title = row.estado ? tituloEstado(row.estado) : '';
    }
  }
}

// ---------------------------------------------------------------------------
// Deshacer / rehacer
// ---------------------------------------------------------------------------

function tomarSnapshot(): Snapshot {
  return {
    values: new Map(values),
    estados: new Map(rows.map((r) => [r.key, r.estado])),
  };
}

function mismoSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a.values.size !== b.values.size) return false;
  for (const [clave, valor] of a.values) {
    if (b.values.get(clave) !== valor) return false;
  }
  if (a.estados.size !== b.estados.size) return false;
  for (const [clave, estado] of a.estados) {
    if (b.estados.get(clave) !== estado) return false;
  }
  return true;
}

function resetHistorial(): void {
  cancelarPendiente();
  historial = [tomarSnapshot()];
  indiceHistorial = 0;
  actualizarBotonesHistorial();
}

function registrarCambio(): void {
  cancelarPendiente();
  if (indiceHistorial < 0) {
    resetHistorial();
    return;
  }
  const snap = tomarSnapshot();
  if (mismoSnapshot(historial[indiceHistorial], snap)) return;
  historial = historial.slice(0, indiceHistorial + 1);
  historial.push(snap);
  if (historial.length > MAX_HISTORIAL) historial.shift();
  indiceHistorial = historial.length - 1;
  actualizarBotonesHistorial();
}

/** Agrupa las pulsaciones seguidas en un solo paso de deshacer. */
function registrarCambioDiferido(): void {
  cancelarPendiente();
  temporizadorHistorial = window.setTimeout(() => {
    temporizadorHistorial = null;
    registrarCambio();
  }, 400);
}

function cancelarPendiente(): void {
  if (temporizadorHistorial !== null) {
    window.clearTimeout(temporizadorHistorial);
    temporizadorHistorial = null;
  }
}

function actualizarBotonesHistorial(): void {
  btnUndo.disabled = indiceHistorial <= 0;
  btnRedo.disabled = indiceHistorial < 0 || indiceHistorial >= historial.length - 1;
}

function deshacer(): void {
  const actual = tomarSnapshot();
  if (indiceHistorial >= 0 && !mismoSnapshot(historial[indiceHistorial], actual)) {
    registrarCambio();
  } else {
    cancelarPendiente();
  }
  if (indiceHistorial <= 0) {
    setEstado(tr('noUndo'));
    return;
  }
  indiceHistorial--;
  restaurar(historial[indiceHistorial]);
  setEstado(tr('undone'));
}

function rehacer(): void {
  cancelarPendiente();
  if (indiceHistorial < 0 || indiceHistorial >= historial.length - 1) {
    setEstado(tr('noRedo'));
    return;
  }
  indiceHistorial++;
  restaurar(historial[indiceHistorial]);
  setEstado(tr('redone'));
}

function restaurar(snap: Snapshot): void {
  const enfocada = claveEnfocada();
  values = new Map(snap.values);
  for (const row of rows) {
    row.value = values.get(row.key) ?? '';
    row.estado = snap.estados.get(row.key);
  }
  render();
  if (enfocada) enfocarFila(enfocada);
  setDirty(!(indiceHistorial === 0 && baseLimpia));
  actualizarBotonesHistorial();
  programarBorrador();
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function guardar(): void {
  if (!state?.canSave) {
    setEstado(tr('noValidSave'));
    return;
  }
  // Evita un doble guardado si se pulsa Ctrl+S mientras el anterior sigue en curso.
  if (btnSave.disabled) return;
  cancelarPendiente();
  cancelarBorrador();
  registrarCambio();
  btnSave.disabled = true;
  setEstado(tr('saving'));
  vscode.postMessage({ type: 'save', translations: Object.fromEntries(values) });
}

function copiarFila(key: string): void {
  const row = filaPorClave.get(key);
  if (!row) return;

  const texto = row.source;
  const afectadas: HTMLTextAreaElement[] = [];
  setValor(key, texto, afectadas);
  for (const r of rows) {
    if (r.source === texto && !valorDe(r.key)) setValor(r.key, texto, afectadas);
  }
  autoajustarAreas(afectadas);

  setDirty(true);
  registrarCambio();
  programarBorrador();
  actualizarContador();
  setEstado(tr('copied', { key }));
}

function siguienteSinTraducir(): void {
  if (visibles.length === 0) {
    setEstado(tr('noViewKeys'));
    return;
  }
  const actual = claveEnfocada();
  const inicio = actual ? visibles.findIndex((r) => r.key === actual) : -1;
  for (let i = 1; i <= visibles.length; i++) {
    const row = visibles[(inicio + i) % visibles.length];
    if (!valorDe(row.key)) {
      enfocarFila(row.key);
      setEstado(tr('nextUntranslated', { key: row.key }));
      return;
    }
  }
  setEstado(tr('noUntranslated'));
}

function enfocarSiguiente(actual: string): void {
  if (visibles.length === 0) return;
  const inicio = visibles.findIndex((r) => r.key === actual);
  const row = visibles[(inicio + 1) % visibles.length];
  enfocarFila(row.key);
}

function enfocarFila(key: string): void {
  let input = inputPorClave.get(key);
  if (!input) {
    const idx = visibles.findIndex((r) => r.key === key);
    if (idx >= renderLimit) {
      renderLimit = Math.ceil((idx + 1) / PAGE) * PAGE;
      render();
      input = inputPorClave.get(key);
    }
  }
  if (input) {
    input.focus();
    input.select();
    input.scrollIntoView({ block: 'center' });
  }
}

function claveEnfocada(): string {
  const activo = document.activeElement as HTMLElement | null;
  return activo?.dataset?.key ?? ultimaClave;
}

function setDirty(valor: boolean): void {
  if (!valor) cancelarBorrador();
  if (dirty === valor) return;
  const estabaSucio = dirty;
  dirty = valor;
  // Al volver al estado limpio el borrador guardado ya no representa cambios
  // pendientes. No se envía durante la carga inicial (dirty ya era false).
  if (!valor && estabaSucio) vscode.postMessage({ type: 'clearDraft' });
  vscode.postMessage({ type: 'dirty', dirty: valor });
  btnSave.classList.toggle('dirty', valor);
}

// ---------------------------------------------------------------------------
// Borrador persistente
// ---------------------------------------------------------------------------

/** Envía una instantánea del borrador tras una pausa de edición. */
function programarBorrador(): void {
  if (!dirty) return;
  if (temporizadorBorrador !== null) window.clearTimeout(temporizadorBorrador);
  temporizadorBorrador = window.setTimeout(() => {
    temporizadorBorrador = null;
    if (!dirty) return;
    vscode.postMessage({
      type: 'draft',
      translations: Object.fromEntries(values),
    });
  }, 900);
}

function cancelarBorrador(): void {
  if (temporizadorBorrador !== null) {
    window.clearTimeout(temporizadorBorrador);
    temporizadorBorrador = null;
  }
}

// Al cerrar o recargar la ventana, envía el borrador pendiente sin esperar.
window.addEventListener('pagehide', () => {
  if (!dirty) return;
  cancelarBorrador();
  vscode.postMessage({ type: 'draft', translations: Object.fromEntries(values) });
});

// Al cambiar el ancho de la ventana, el texto se reajusta a nuevas líneas.
let temporizadorResize: number | null = null;
window.addEventListener('resize', () => {
  // Redimensionar dispara muchos eventos: se agrupan en un solo ajuste.
  if (temporizadorResize !== null) window.clearTimeout(temporizadorResize);
  temporizadorResize = window.setTimeout(() => {
    temporizadorResize = null;
    autoajustarAreas(inputPorClave.values());
  }, 150);
});

function setEstado(texto: string): void {
  estadoEl.textContent = texto;
}

function tituloEstado(estado: EstadoHerencia): string {
  switch (estado) {
    case 'heredada':
      return tr('stateHeredada');
    case 'revisar':
      return tr('stateRevisar');
    case 'nueva':
      return tr('stateNueva');
    case 'vacia':
      return tr('stateVacia');
    default:
      return '';
  }
}
