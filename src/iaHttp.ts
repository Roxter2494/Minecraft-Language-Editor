import * as vscode from 'vscode';
import {
  construirPeticion,
  extraerTexto,
  mensajeDeErrorHttp,
  type ProveedorInfo,
} from './core/proveedoresIa';

/**
 * Envío de prompts a proveedores externos con la clave del usuario.
 * La clave nunca sale de `SecretStorage` ni se registra en los logs.
 */

const TIEMPO_LIMITE_MS = 120000;

export interface DestinoIa {
  proveedor: ProveedorInfo;
  modelo: string;
  urlBase: string;
  clave: string;
}

/** Envía un prompt y devuelve el texto de la respuesta. */
export async function enviarProveedor(
  destino: DestinoIa,
  prompt: string,
  token: vscode.CancellationToken,
  maxTokens?: number,
): Promise<string> {
  const peticion = construirPeticion(destino.proveedor, {
    modelo: destino.modelo,
    urlBase: destino.urlBase,
    clave: destino.clave,
    prompt,
    maxTokens,
  });

  const control = new AbortController();
  const cancelacion = token.onCancellationRequested(() => control.abort());
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const res = await fetch(peticion.url, {
      method: 'POST',
      headers: peticion.headers,
      body: JSON.stringify(peticion.body),
      signal: control.signal,
    });

    const cuerpo = await res.text();
    if (!res.ok) {
      throw new Error(mensajeDeErrorHttp(res.status, cuerpo));
    }

    let datos: unknown;
    try {
      datos = JSON.parse(cuerpo);
    } catch {
      throw new Error('La respuesta del proveedor no es JSON.');
    }

    const texto = extraerTexto(destino.proveedor.id, datos);
    if (!texto) throw new Error('El proveedor devolvió una respuesta vacía.');
    return texto;
  } catch (e) {
    if (token.isCancellationRequested) throw new Error('CANCELLED');
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado (120 s).');
    }
    throw e;
  } finally {
    clearTimeout(temporizador);
    cancelacion.dispose();
  }
}
