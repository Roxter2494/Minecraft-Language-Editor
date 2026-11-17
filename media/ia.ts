import { normalizarIdiomaUi, t } from '../src/core/i18n';
import {
  PROVEEDORES,
  buscarProveedor,
  type ProveedorInfo,
} from '../src/core/proveedoresIa';
import type {
  IaConfigFromWebview,
  IaConfigState,
  IaConfigToWebview,
} from '../src/core/types';

declare function acquireVsCodeApi(): {
  postMessage(message: IaConfigFromWebview): void;
};

const vscode = acquireVsCodeApi();

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No se encontró #${id}`);
  return found as T;
}

const form = el<HTMLFormElement>('formIa');
const selProveedor = el<HTMLSelectElement>('selProveedor');
const txtModelo = el<HTMLInputElement>('txtModelo');
const txtUrlBase = el<HTMLInputElement>('txtUrlBase');
const txtClave = el<HTMLInputElement>('txtClave');
const modelosSugeridos = el<HTMLDataListElement>('modelosSugeridos');
const btnGuardar = el<HTMLButtonElement>('btnGuardar');
const btnProbar = el<HTMLButtonElement>('btnProbar');
const btnBorrar = el<HTMLButtonElement>('btnBorrar');
const btnObtener = el<HTMLButtonElement>('btnObtener');
const notaClave = el<HTMLParagraphElement>('notaClave');
const notaVscode = el<HTMLParagraphElement>('notaVscode');
const mensajeEl = el<HTMLDivElement>('mensaje');

let state: IaConfigState | null = null;
let idioma = 'es';

window.addEventListener('message', (event: MessageEvent<IaConfigToWebview>) => {
  const msg = event.data;
  if (msg.type === 'iaState') {
    state = msg.state;
    idioma = normalizarIdiomaUi(state.idiomaUi);
    aplicarIdioma();
    aplicarEstado();
  } else if (msg.type === 'iaInfo') {
    mostrarMensaje(msg.message, false);
  } else if (msg.type === 'iaError') {
    mostrarMensaje(msg.message, true);
  }
});

selProveedor.addEventListener('change', () => {
  const info = buscarProveedor(selProveedor.value);
  txtModelo.value = info.modelo;
  txtUrlBase.value = info.urlBase;
  txtClave.value = '';
  aplicarProveedor(info);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  vscode.postMessage({
    type: 'save',
    proveedor: selProveedor.value,
    modelo: txtModelo.value,
    urlBase: txtUrlBase.value,
    clave: txtClave.value,
  });
});

btnProbar.addEventListener('click', () => {
  vscode.postMessage({
    type: 'test',
    proveedor: selProveedor.value,
    modelo: txtModelo.value,
    urlBase: txtUrlBase.value,
    clave: txtClave.value,
  });
});

btnBorrar.addEventListener('click', () => {
  vscode.postMessage({ type: 'deleteKey', proveedor: selProveedor.value });
});

btnObtener.addEventListener('click', () => {
  const info = buscarProveedor(selProveedor.value);
  if (info.claveUrl) vscode.postMessage({ type: 'openKeyUrl', url: info.claveUrl });
});

/** Rellena el desplegable de proveedores (una sola vez). */
function poblarProveedores(): void {
  if (selProveedor.options.length > 0) return;
  for (const p of PROVEEDORES) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.nombre;
    selProveedor.appendChild(opt);
  }
}

/** Traduce los textos fijos del panel. */
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

function aplicarEstado(): void {
  if (!state) return;
  poblarProveedores();

  const info = buscarProveedor(state.proveedor);
  selProveedor.value = info.id;
  txtModelo.value = state.modelo || info.modelo;
  txtUrlBase.value = state.urlBase || info.urlBase;
  txtClave.value = '';

  aplicarProveedor(info);
}

/** Si el proveedor tiene una clave guardada. */
function tieneClave(proveedor: string): boolean {
  return state?.claves?.includes(proveedor) ?? false;
}

/** Ajusta la interfaz al proveedor elegido. */
function aplicarProveedor(info: ProveedorInfo): void {
  const externo = info.id !== 'vscode';
  const guardada = tieneClave(info.id);

  txtModelo.disabled = !externo;
  txtUrlBase.disabled = !externo;
  txtClave.disabled = !externo;
  txtClave.placeholder = guardada ? tr('aiApiKeySaved') : tr('aiApiKeyPlaceholder');
  btnProbar.disabled = false;
  btnBorrar.disabled = !externo || !guardada;
  btnObtener.hidden = !info.claveUrl;

  notaClave.hidden = !externo;
  notaVscode.hidden = externo;

  modelosSugeridos.innerHTML = '';
  for (const modelo of info.sugeridos) {
    const opt = document.createElement('option');
    opt.value = modelo;
    modelosSugeridos.appendChild(opt);
  }
}

function mostrarMensaje(texto: string, esError: boolean): void {
  mensajeEl.textContent = texto;
  mensajeEl.classList.toggle('error', esError);
  mensajeEl.classList.toggle('ok', !esError);
}

function tr(clave: string, vars?: Record<string, string | number>): string {
  return t(idioma, clave, vars);
}

// El panel puede abrirse antes de que la extensión envíe el estado.
poblarProveedores();
vscode.postMessage({ type: 'ready' });
