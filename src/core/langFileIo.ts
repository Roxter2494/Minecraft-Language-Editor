import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { ArchivoLang, LineaLang } from './types';

/**
 * Núcleo de lectura/escritura de archivos .lang de Minecraft Bedrock.
 *
 * Reglas:
 * - Conserva comentarios (#), líneas vacías y el orden del origen.
 * - Escribe siempre UTF-8 sin BOM y con finales de línea CRLF.
 * - `languages.json` contiene solo códigos, ordenados y sin duplicados.
 */

/** Códigos de idioma (.lang) presentes en la carpeta, ordenados. */
export function detectarCodigos(carpeta: string): string[] {
  const codigos: string[] = [];
  try {
    if (!carpeta || !fs.existsSync(carpeta)) return codigos;
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      if (!entrada.isFile()) continue;
      if (!entrada.name.toLowerCase().endsWith('.lang')) continue;
      const codigo = path.basename(entrada.name, path.extname(entrada.name));
      if (codigo.trim()) codigos.push(codigo);
    }
  } catch {
    return [];
  }
  return codigos.sort((a, b) => compararOrdinalIgnoreCase(a, b));
}

/** Lee un .lang conservando su estructura. */
export function leer(ruta: string): ArchivoLang {
  let texto = fs.readFileSync(ruta, 'utf8');
  // File.ReadAllLines con Encoding.UTF8 detecta y elimina el BOM.
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const lineas: LineaLang[] = [];
  if (texto.length === 0) {
    return { ruta, codigo: path.basename(ruta, path.extname(ruta)), lineas };
  }

  const partes = texto.split(/\r\n|\n|\r/);
  // Un salto final no crea una línea vacía extra (igual que File.ReadAllLines).
  if (/(?:\r\n|\n|\r)$/.test(texto)) partes.pop();

  for (const linea of partes) {
    const idx = linea.indexOf('=');
    const esPar = idx > 0 && !linea.trimStart().startsWith('#');
    if (esPar) {
      lineas.push({
        esPar: true,
        clave: linea.slice(0, idx).trim(),
        texto: linea.slice(idx + 1),
        cruda: '',
      });
    } else {
      lineas.push({ esPar: false, clave: '', texto: '', cruda: linea });
    }
  }

  return { ruta, codigo: path.basename(ruta, path.extname(ruta)), lineas };
}

/** Clave → texto de un archivo ya leído (la última aparición manda). */
export function diccionario(archivo: ArchivoLang | null | undefined): Map<string, string> {
  const pares = new Map<string, string>();
  if (!archivo) return pares;
  for (const par of archivo.lineas) {
    if (!par.esPar) continue;
    if (!par.clave || !par.clave.trim()) continue;
    pares.set(par.clave, par.texto ?? '');
  }
  return pares;
}

/** Clave → texto de un .lang del disco; vacío si no existe o no se puede leer. */
export function diccionarioDe(ruta: string): Map<string, string> {
  if (!ruta) return new Map();
  if (!fs.existsSync(ruta)) return new Map();
  try {
    return diccionario(leer(ruta));
  } catch {
    return new Map();
  }
}

/**
 * Escribe el idioma nuevo tomando la estructura del origen. Las claves sin
 * traducción se escriben con el texto original como respaldo.
 */
export function escribir(
  destino: string,
  origen: ArchivoLang,
  traducciones: Map<string, string>,
): { ok: boolean; error?: string } {
  try {
    const sb: string[] = [];
    for (const linea of origen.lineas) {
      if (!linea.esPar) {
        sb.push(linea.cruda);
      } else {
        let valor = linea.texto;
        const t = traducciones.get(linea.clave);
        if (t !== undefined && t !== '') valor = t;
        sb.push(linea.clave + '=' + valor);
      }
      sb.push('\r\n');
    }
    escribirAtomico(destino, sb.join(''));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Combina las claves nuevas del origen con un destino ya existente, conservando
 * las líneas y traducciones del destino. Las claves nuevas sin traducción usan
 * el texto origen.
 */
export function combinarConDestino(
  origen: ArchivoLang,
  existente: ArchivoLang,
  traducciones: Map<string, string>,
): { plantilla: ArchivoLang; final: Map<string, string> } {
  const final = new Map<string, string>();
  const claves = new Set<string>();
  for (const linea of existente.lineas) if (linea.esPar) claves.add(linea.clave);

  const combinada: ArchivoLang = {
    ruta: existente.ruta,
    codigo: existente.codigo,
    lineas: [...existente.lineas],
  };

  for (const par of origen.lineas) {
    if (!par.esPar) continue;
    if (!par.clave || !par.clave.trim()) continue;
    if (claves.has(par.clave)) continue;
    claves.add(par.clave);
    combinada.lineas.push({
      esPar: true,
      clave: par.clave,
      texto: par.texto ?? '',
      cruda: '',
    });
  }

  // Lo ya traducido en el destino tiene prioridad sobre el texto origen.
  for (const [clave, valor] of diccionario(existente)) {
    if (clave && clave.trim() && !traducciones.has(clave) && valor !== '') {
      traducciones.set(clave, valor);
    }
  }

  for (const par of origen.lineas) {
    if (!par.esPar) continue;
    if (!par.clave || !par.clave.trim()) continue;
    let valor = par.texto ?? '';
    const t = traducciones.get(par.clave);
    if (t !== undefined && t !== '') valor = t;
    final.set(par.clave, valor);
  }

  return { plantilla: combinada, final };
}

export function rutaLanguagesJson(carpeta: string): string {
  return path.join(carpeta, 'languages.json');
}

/**
 * Añade el código a texts/languages.json. Si no existe, lo crea con todos los
 * idiomas (.lang) presentes en la carpeta. En el archivo solo van códigos.
 */
export function actualizarLanguagesJson(
  carpeta: string,
  codigo: string,
): { ok: boolean; error?: string } {
  try {
    const ruta = rutaLanguagesJson(carpeta);
    let codigos: string[] = [];

    if (fs.existsSync(ruta)) {
      const crudo = fs.readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
      if (crudo.trim()) {
        const parsed: unknown = JSON.parse(crudo);
        if (parsed === null) {
          codigos = detectarCodigos(carpeta);
        } else if (!Array.isArray(parsed)) {
          throw new Error('languages.json debe ser un arreglo de códigos.');
        } else if (parsed.some((c) => typeof c !== 'string')) {
          throw new Error('languages.json contiene valores que no son códigos.');
        } else {
          codigos = parsed as string[];
        }
      } else {
        // Un archivo vacío no debe hacer perder los .lang que ya existen.
        codigos = detectarCodigos(carpeta);
      }
    } else {
      codigos = detectarCodigos(carpeta);
    }

    if (!codigos.some((c) => c.toLowerCase() === codigo.toLowerCase())) {
      codigos.push(codigo);
    }

    // Distinct(OrdinalIgnoreCase) conserva la primera aparición.
    const vistos = new Set<string>();
    const unicos: string[] = [];
    for (const c of codigos) {
      if (!c || !c.trim()) continue;
      const k = c.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      unicos.push(c);
    }
    unicos.sort(compararOrdinalIgnoreCase);

    const json = JSON.stringify(unicos, null, 2);
    JSON.parse(json); // validación
    escribirAtomico(ruta, json);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/**
 * Crea una copia de seguridad única junto al original. Si el archivo no existe
 * no hace nada. Si falla, lanza la excepción para que el guardado se cancele.
 */
export function crearBackupObligatorio(ruta: string): string {
  if (!ruta || !fs.existsSync(ruta)) return '';
  const sello = selloFecha(new Date()) + '_' + randomBytes(4).toString('hex');
  const backup = ruta + '.bak_' + sello;
  fs.copyFileSync(ruta, backup, fs.constants.COPYFILE_EXCL);
  return backup;
}

/**
 * Borra las copias .bak más antiguas de un archivo, conservando las últimas
 * indicadas. El sello (yyyyMMdd_HHmmss_fff) ordena igual que el nombre.
 */
export function limpiarBackups(destinoRuta: string, conservar: number): number {
  let borradas = 0;
  try {
    if (!destinoRuta || conservar < 1) return 0;
    const dir = path.dirname(destinoRuta);
    if (!dir || !fs.existsSync(dir)) return 0;

    const base = path.basename(destinoRuta) + '.bak_';
    const copias = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(base))
      .sort((a, b) => compararOrdinalIgnoreCase(b, a));

    for (const copia of copias.slice(conservar)) {
      try {
        fs.unlinkSync(path.join(dir, copia));
        borradas++;
      } catch {
        // Se ignora: igual que la app original.
      }
    }
  } catch {
    // Se ignora: igual que la app original.
  }
  return borradas;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/** Escritura atómica: archivo temporal + rename. UTF-8 sin BOM. */
function escribirAtomico(destino: string, contenido: string): void {
  const dir = path.dirname(destino);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const temp = path.join(
    dir || '.',
    path.basename(destino) + '.tmp_' + randomBytes(8).toString('hex'),
  );
  try {
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, contenido, { encoding: 'utf8' });
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(temp, destino);
    } catch {
      // Fallback para destinos bloqueados o en otro volumen.
      fs.copyFileSync(temp, destino);
      fs.unlinkSync(temp);
    }
  } finally {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
      // Ignorado.
    }
  }
}

/** Comparación ordinal sin distinguir mayúsculas (equivalente a OrdinalIgnoreCase). */
export function compararOrdinalIgnoreCase(a: string, b: string): number {
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}

/** yyyyMMdd_HHmmss_fff */
function selloFecha(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
    `_${p(d.getMilliseconds(), 3)}`
  );
}

function mensajeDeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
