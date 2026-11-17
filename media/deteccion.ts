import { normalizarIdiomaUi, t } from '../src/core/i18n';
import type {
  DeteccionFromWebview,
  DeteccionState,
  DeteccionToWebview,
  FuenteTexto,
  TextoDetectado,
} from '../src/core/types';

declare function acquireVsCodeApi(): {
  postMessage(message: DeteccionFromWebview): void;
};

const vscode = acquireVsCodeApi();

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No se encontró #${id}`);
  return found as T;
}

const rutaEl = el<HTMLDivElement>('ruta');
const btnFolder = el<HTMLButtonElement>('btnFolder');
const btnScan = el<HTMLButtonElement>('btnScan');
const btnImport = el<HTMLButtonElement>('btnImport');
const filtro = el<HTMLInputElement>('filtro');
const selFuente = el<HTMLSelectElement>('selFuente');
const btnSelectAll = el<HTMLButtonElement>('btnSelectAll');
const btnClear = el<HTMLButtonElement>('btnClear');
const contadorEl = el<HTMLDivElement>('contador');
const cuerpo = el<HTMLTableSectionElement>('cuerpo');
const vacioEl = el<HTMLDivElement>('vacio');
const estadoEl = el<HTMLSpanElement>('estado');

let state: DeteccionState | null = null;
let idioma = 'es';
const seleccionados = new Set<string>();

window.addEventListener('message', (event: MessageEvent<DeteccionToWebview>) => {
  const msg = event.data;
  if (msg.type === 'detectState') {
    state = msg.state;
    idioma = normalizarIdiomaUi(state.idiomaUi);
    const ids = new Set(state.textos.map((x) => x.id));
    for (const id of [...seleccionados]) if (!ids.has(id)) seleccionados.delete(id);
    aplicarIdioma();
    render();
  } else if (msg.type === 'detectError') {
    setEstado(msg.message);
  } else if (msg.type === 'importDone') {
    // Las claves ya se añadieron al editor: no tiene sentido volver a importarlas.
    seleccionados.clear();
    render();
  }
});

btnFolder.addEventListener('click', () => vscode.postMessage({ type: 'pickFolder' }));
btnScan.addEventListener('click', () => vscode.postMessage({ type: 'scan' }));
btnImport.addEventListener('click', importar);
filtro.addEventListener('input', render);
selFuente.addEventListener('change', render);
btnSelectAll.addEventListener('click', () => {
  for (const texto of visibles()) seleccionados.add(texto.id);
  render();
});
btnClear.addEventListener('click', () => {
  seleccionados.clear();
  render();
});

function tr(clave: string, vars?: Record<string, string | number>): string {
  return t(idioma, clave, vars);
}

function aplicarIdioma(): void {
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
}

function visibles(): TextoDetectado[] {
  if (!state) return [];
  const texto = filtro.value.trim().toLowerCase();
  const fuente = selFuente.value as FuenteTexto | '';
  return state.textos.filter((x) => {
    if (fuente && x.fuente !== fuente) return false;
    if (!texto) return true;
    return (
      x.texto.toLowerCase().includes(texto) || x.archivo.toLowerCase().includes(texto)
    );
  });
}

function render(): void {
  if (!state) return;

  rutaEl.textContent = state.folder || tr('detectFolder');
  rutaEl.title = state.folder;

  const lista = visibles();
  cuerpo.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (const texto of lista) {
    const trEl = document.createElement('tr');
    trEl.dataset.id = texto.id;

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = seleccionados.has(texto.id);
    check.dataset.id = texto.id;
    tdCheck.appendChild(check);

    const tdArchivo = document.createElement('td');
    tdArchivo.className = 'col-file';
    tdArchivo.textContent = texto.archivo;
    tdArchivo.title = texto.archivo;

    const tdLinea = document.createElement('td');
    tdLinea.className = 'col-line';
    tdLinea.textContent = texto.linea > 0 ? String(texto.linea) : '—';

    const tdFuente = document.createElement('td');
    tdFuente.className = 'col-source-kind';
    const badge = document.createElement('span');
    badge.className = 'badge fuente-' + texto.fuente;
    badge.textContent = etiquetaFuente(texto.fuente);
    tdFuente.appendChild(badge);

    const tdTexto = document.createElement('td');
    tdTexto.textContent = texto.texto;
    tdTexto.title = texto.texto;

    const tdClave = document.createElement('td');
    tdClave.className = 'col-key';
    tdClave.textContent = texto.clave;
    tdClave.title = texto.clave;

    trEl.append(tdCheck, tdArchivo, tdLinea, tdFuente, tdTexto, tdClave);
    fragment.appendChild(trEl);
  }
  cuerpo.appendChild(fragment);

  if (state.textos.length === 0) {
    vacioEl.style.display = 'block';
    vacioEl.textContent = state.escaneando ? tr('scanning') : tr('noResults');
  } else if (lista.length === 0) {
    vacioEl.style.display = 'block';
    vacioEl.textContent = tr('detectNoMatches');
  } else {
    vacioEl.style.display = 'none';
  }

  contadorEl.textContent =
    `${tr('foundCount', { n: state.textos.length })} · ` +
    `${tr('selectedCount', { n: seleccionados.size })}`;
  btnImport.disabled = seleccionados.size === 0;
  btnScan.disabled = state.escaneando || !state.folder;
  btnSelectAll.disabled = lista.length === 0;
  btnClear.disabled = seleccionados.size === 0;

  if (state.escaneando) setEstado(tr('scanning'));
  else if (state.folder) setEstado(tr('foundCount', { n: state.textos.length }));
}

function etiquetaFuente(fuente: FuenteTexto): string {
  if (fuente === 'json') return tr('sourceJson');
  if (fuente === 'script') return tr('sourceScript');
  return tr('sourceLang');
}

cuerpo.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target || target.type !== 'checkbox' || !target.dataset.id) return;
  if (target.checked) seleccionados.add(target.dataset.id);
  else seleccionados.delete(target.dataset.id);
  render();
});

function importar(): void {
  if (!state || seleccionados.size === 0) {
    setEstado(tr('nothingSelected'));
    return;
  }
  const textos = state.textos.filter((x) => seleccionados.has(x.id));
  vscode.postMessage({ type: 'import', textos });
}

function setEstado(texto: string): void {
  estadoEl.textContent = texto;
}

vscode.postMessage({ type: 'ready' });
