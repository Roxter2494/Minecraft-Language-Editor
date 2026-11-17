import { normalizarIdiomaUi, t } from '../src/core/i18n';
import type {
  ArchivoDiff,
  CompararFromWebview,
  CompararState,
  CompararToWebview,
} from '../src/core/types';

declare function acquireVsCodeApi(): {
  postMessage(message: CompararFromWebview): void;
};

const vscode = acquireVsCodeApi();

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No se encontró #${id}`);
  return found as T;
}

const rutaA = el<HTMLDivElement>('rutaA');
const rutaB = el<HTMLDivElement>('rutaB');
const btnA = el<HTMLButtonElement>('btnA');
const btnB = el<HTMLButtonElement>('btnB');
const btnSwap = el<HTMLButtonElement>('btnSwap');
const btnRecompare = el<HTMLButtonElement>('btnRecompare');
const filtro = el<HTMLInputElement>('filtro');
const selEstado = el<HTMLSelectElement>('selEstado');
const resumenEl = el<HTMLDivElement>('resumen');
const cuerpo = el<HTMLTableSectionElement>('cuerpo');
const vacioEl = el<HTMLDivElement>('vacio');
const detalleEl = el<HTMLDivElement>('detalle');
const estadoEl = el<HTMLSpanElement>('estado');

let state: CompararState | null = null;
let idioma = 'es';
let seleccionado = '';

window.addEventListener('message', (event: MessageEvent<CompararToWebview>) => {
  const msg = event.data;
  if (msg.type === 'compareState') {
    state = msg.state;
    idioma = normalizarIdiomaUi(state.idiomaUi);
    aplicarIdioma();
    render();
  } else if (msg.type === 'compareError') {
    setEstado(msg.message);
  }
});

btnA.addEventListener('click', () => vscode.postMessage({ type: 'pickFolder', side: 'a' }));
btnB.addEventListener('click', () => vscode.postMessage({ type: 'pickFolder', side: 'b' }));
btnSwap.addEventListener('click', () => vscode.postMessage({ type: 'swap' }));
btnRecompare.addEventListener('click', () => vscode.postMessage({ type: 'recompare' }));
filtro.addEventListener('input', render);
selEstado.addEventListener('change', render);

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

function render(): void {
  if (!state) return;

  rutaA.textContent = state.carpetaA || tr('folderA');
  rutaB.textContent = state.carpetaB || tr('folderB');
  rutaA.title = state.carpetaA;
  rutaB.title = state.carpetaB;

  const texto = filtro.value.trim().toLowerCase();
  const estado = selEstado.value;
  const archivos = state.archivos.filter((a) => {
    if (estado && a.estado !== estado) return false;
    return !texto || a.ruta.toLowerCase().includes(texto);
  });

  const r = state.resumen;
  resumenEl.textContent = tr('compareSummary', {
    equal: r.iguales,
    onlyA: r.soloA,
    onlyB: r.soloB,
    changed: r.cambiados,
  });

  cuerpo.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const archivo of archivos) {
    const trEl = document.createElement('tr');
    trEl.dataset.ruta = archivo.ruta;
    if (archivo.ruta === seleccionado) trEl.classList.add('seleccionada');

    const tdRuta = document.createElement('td');
    tdRuta.className = 'col-file';
    tdRuta.textContent = archivo.ruta;
    tdRuta.title = archivo.ruta;

    const tdEstado = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge estado-' + archivo.estado;
    badge.textContent = etiquetaEstado(archivo.estado);
    tdEstado.appendChild(badge);

    const tdAltas = document.createElement('td');
    tdAltas.className = 'num';
    tdAltas.textContent = String(archivo.altas);

    const tdBajas = document.createElement('td');
    tdBajas.className = 'num';
    tdBajas.textContent = String(archivo.bajas);

    const tdCambiadas = document.createElement('td');
    tdCambiadas.className = 'num';
    tdCambiadas.textContent = String(archivo.cambiadas);

    trEl.append(tdRuta, tdEstado, tdAltas, tdBajas, tdCambiadas);
    fragment.appendChild(trEl);
  }
  cuerpo.appendChild(fragment);

  if (archivos.length === 0) {
    vacioEl.style.display = 'block';
    vacioEl.textContent =
      state.archivos.length === 0 ? tr('noLangFiles') : tr('compareNoMatches');
  } else {
    vacioEl.style.display = 'none';
  }

  renderDetalle();

  if (state.carpetaA && state.carpetaB) {
    const conCambios = state.archivos.filter((a) => a.estado !== 'igual').length;
    setEstado(tr('compareDone', { n: conCambios }));
  }
}

function renderDetalle(): void {
  const archivo = state?.archivos.find((a) => a.ruta === seleccionado);
  if (!archivo) {
    detalleEl.textContent = tr('selectFile');
    return;
  }

  detalleEl.innerHTML = '';
  const titulo = document.createElement('div');
  titulo.className = 'detalle-titulo';
  titulo.textContent = archivo.ruta;
  detalleEl.appendChild(titulo);

  if (archivo.error) {
    const p = document.createElement('div');
    p.className = 'detalle-vacio';
    p.textContent = tr('compareReadError', { error: archivo.error });
    detalleEl.appendChild(p);
  }

  if (archivo.detalles.length === 0) {
    const p = document.createElement('div');
    p.className = 'detalle-vacio';
    p.textContent = tr('noDiff');
    detalleEl.appendChild(p);
    return;
  }

  const lista = document.createElement('div');
  lista.className = 'detalle-lista';
  for (const clave of archivo.detalles) {
    const item = document.createElement('div');
    item.className = 'detalle-item estado-' + clave.estado;

    const k = document.createElement('div');
    k.className = 'detalle-clave';
    k.textContent = clave.clave;

    const a = document.createElement('div');
    a.className = 'detalle-a';
    a.textContent = clave.a !== undefined ? `A: ${clave.a}` : 'A: —';

    const b = document.createElement('div');
    b.className = 'detalle-b';
    b.textContent = clave.b !== undefined ? `B: ${clave.b}` : 'B: —';

    item.append(k, a, b);
    lista.appendChild(item);
  }
  detalleEl.appendChild(lista);
}

function etiquetaEstado(estado: ArchivoDiff['estado']): string {
  switch (estado) {
    case 'soloA':
      return tr('stateOnlyA');
    case 'soloB':
      return tr('stateOnlyB');
    case 'cambiado':
      return tr('stateChanged');
    default:
      return tr('stateEqual');
  }
}

cuerpo.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const fila = target?.closest<HTMLTableRowElement>('tr');
  const ruta = fila?.dataset.ruta;
  if (!ruta) return;
  seleccionado = ruta;
  for (const trEl of cuerpo.querySelectorAll('tr')) {
    trEl.classList.toggle('seleccionada', (trEl as HTMLTableRowElement).dataset.ruta === ruta);
  }
  renderDetalle();
});

function setEstado(texto: string): void {
  estadoEl.textContent = texto;
}

vscode.postMessage({ type: 'ready' });
