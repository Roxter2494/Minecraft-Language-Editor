import * as fs from 'fs';
import * as path from 'path';

/** Si la carpeta contiene una subcarpeta `texts`, se usa esa. */
export function normalizarCarpeta(folder: string): string {
  try {
    const texts = path.join(folder, 'texts');
    if (fs.existsSync(texts) && fs.statSync(texts).isDirectory()) return texts;
  } catch {
    // Se mantiene la carpeta elegida.
  }
  return folder;
}

/** Nombre corto de una ruta para mostrarla en la interfaz. */
export function nombreCarpeta(folder: string): string {
  if (!folder) return '';
  const partes = folder.split(/[\\/]/).filter(Boolean);
  return partes.slice(-2).join('/') || folder;
}
