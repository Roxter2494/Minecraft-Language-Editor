import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  actualizarLanguagesJson,
  combinarConDestino,
  crearBackupObligatorio,
  detectarCodigos,
  diccionario,
  escribir,
  leer,
  limpiarBackups,
} from '../src/core/langFileIo';

const temporales: string[] = [];

function dirTemporal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'langtest-'));
  temporales.push(dir);
  return dir;
}

function escribirArchivo(dir: string, nombre: string, contenido: string): string {
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, contenido, { encoding: 'utf8' });
  return ruta;
}

afterEach(() => {
  for (const dir of temporales.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('lectura de .lang', () => {
  it('conserva orden y comentarios', () => {
    const dir = dirTemporal();
    const ruta = escribirArchivo(
      dir,
      'es_ES.lang',
      '# comentario\nitem.a=Hola\n\n## otro\nitem.b=Mundo\n',
    );

    const archivo = leer(ruta);
    expect(archivo.lineas).toHaveLength(5);
    expect(archivo.lineas[0].esPar).toBe(false);
    expect(archivo.lineas[1].esPar).toBe(true);
    expect(archivo.lineas[1].clave).toBe('item.a');
    expect(archivo.lineas[1].texto).toBe('Hola');
  });

  it('elimina el BOM y no añade una línea vacía por el salto final', () => {
    const dir = dirTemporal();
    const ruta = escribirArchivo(dir, 'en_US.lang', '\uFEFFitem.a=Hello\r\n');
    const archivo = leer(ruta);
    expect(archivo.lineas).toHaveLength(1);
    expect(archivo.lineas[0].clave).toBe('item.a');
  });

  it('un archivo vacío no tiene líneas', () => {
    const dir = dirTemporal();
    const ruta = escribirArchivo(dir, 'en_US.lang', '');
    expect(leer(ruta).lineas).toHaveLength(0);
  });
});

describe('escritura de .lang', () => {
  it('conserva la estructura y usa CRLF', () => {
    const dir = dirTemporal();
    const rutaOrigen = escribirArchivo(
      dir,
      'en_US.lang',
      '# header\r\nitem.a=Hello\r\n\r\nitem.b=World\r\n',
    );
    const rutaDestino = path.join(dir, 'es_ES.lang');
    const origen = leer(rutaOrigen);
    const traducciones = new Map([['item.a', 'Hola']]);

    const res = escribir(rutaDestino, origen, traducciones);
    expect(res.ok).toBe(true);

    const crudo = fs.readFileSync(rutaDestino, 'utf8');
    expect(crudo).toContain('\r\n');
    expect(crudo).toContain('item.a=Hola');
    expect(crudo).toContain('item.b=World');
    expect(crudo).not.toContain('\n\n');
  });

  it('round trip sin cambios conserva el contenido', () => {
    const dir = dirTemporal();
    const contenido = '# test\r\nitem.a=Hello\r\nitem.b=World\r\n';
    const rutaOrigen = escribirArchivo(dir, 'en_US.lang', contenido);
    const rutaDestino = path.join(dir, 'es_ES.lang');

    const origen = leer(rutaOrigen);
    const res = escribir(rutaDestino, origen, diccionario(origen));
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(rutaDestino, 'utf8')).toBe(contenido);
  });

  it('escribe UTF-8 sin BOM', () => {
    const dir = dirTemporal();
    const rutaOrigen = escribirArchivo(dir, 'en_US.lang', 'item.a=Hola\r\n');
    const rutaDestino = path.join(dir, 'es_ES.lang');
    escribir(rutaDestino, leer(rutaOrigen), new Map());
    const bytes = fs.readFileSync(rutaDestino);
    expect(bytes[0]).not.toBe(0xef);
  });
});

describe('combinarConDestino', () => {
  it('conserva traducciones existentes y añade claves nuevas', () => {
    const dir = dirTemporal();
    const rutaDestino = escribirArchivo(
      dir,
      'es_ES.lang',
      '# cabecera\r\nitem.a=Hola\r\nitem.b=Traduccion previa\r\n',
    );
    const existente = leer(rutaDestino);
    const origen = leer(
      escribirArchivo(
        dir,
        'en_US.lang',
        '# cabecera\r\nitem.a=Hello\r\nitem.b=Previous\r\nitem.c=New\r\n',
      ),
    );

    const traducciones = new Map<string, string>();
    const { plantilla, final } = combinarConDestino(origen, existente, traducciones);

    const pares = plantilla.lineas.filter((l) => l.esPar);
    expect(pares).toHaveLength(3);
    expect(pares.some((p) => p.clave === 'item.c' && p.texto === 'New')).toBe(true);
    expect(final.get('item.a')).toBe('Hola');
    expect(final.get('item.b')).toBe('Traduccion previa');
    expect(final.get('item.c')).toBe('New');
    expect(traducciones.get('item.a')).toBe('Hola');
    expect(traducciones.get('item.b')).toBe('Traduccion previa');
  });

  it('respeta la traducción editada sobre la existente', () => {
    const dir = dirTemporal();
    const existente = leer(
      escribirArchivo(dir, 'es_ES.lang', 'item.a=Hola\r\nitem.b=Viejo\r\n'),
    );
    const origen = leer(
      escribirArchivo(dir, 'en_US.lang', 'item.a=Hello\r\nitem.b=Old\r\n'),
    );

    const traducciones = new Map([['item.b', 'Editado']]);
    const { final } = combinarConDestino(origen, existente, traducciones);
    expect(final.get('item.b')).toBe('Editado');
    expect(final.get('item.a')).toBe('Hola');
  });
});

describe('languages.json', () => {
  it('se crea con todos los .lang y no duplica', () => {
    const dir = dirTemporal();
    escribirArchivo(dir, 'en_US.lang', 'item.a=Hello\n');

    expect(actualizarLanguagesJson(dir, 'es_ES').ok).toBe(true);
    expect(actualizarLanguagesJson(dir, 'es_ES').ok).toBe(true);

    const json = fs.readFileSync(path.join(dir, 'languages.json'), 'utf8');
    expect(json).toContain('"en_US"');
    expect(json).toContain('"es_ES"');
    expect(json.split('"es_ES"').length - 1).toBe(1);
  });

  it('queda ordenado por código', () => {
    const dir = dirTemporal();
    escribirArchivo(dir, 'en_US.lang', 'item.a=Hello\n');
    actualizarLanguagesJson(dir, 'pt_BR');
    actualizarLanguagesJson(dir, 'es_ES');

    const json = fs.readFileSync(path.join(dir, 'languages.json'), 'utf8');
    expect(json.indexOf('es_ES')).toBeLessThan(json.indexOf('pt_BR'));
  });

  it('no sobrescribe un languages.json con formato inválido', () => {
    const dir = dirTemporal();
    const ruta = path.join(dir, 'languages.json');
    fs.writeFileSync(ruta, '{"no":"es-un-array"}', 'utf8');

    const res = actualizarLanguagesJson(dir, 'es_ES');
    expect(res.ok).toBe(false);
    expect(fs.readFileSync(ruta, 'utf8')).toBe('{"no":"es-un-array"}');
  });
});

describe('utilidades', () => {
  it('detecta códigos ordenados', () => {
    const dir = dirTemporal();
    escribirArchivo(dir, 'pt_BR.lang', 'a=b\n');
    escribirArchivo(dir, 'en_US.lang', 'a=b\n');
    escribirArchivo(dir, 'notas.txt', 'x');
    expect(detectarCodigos(dir)).toEqual(['en_US', 'pt_BR']);
  });

  it('crea backups .bak_ y conserva los últimos N', () => {
    const dir = dirTemporal();
    const ruta = escribirArchivo(dir, 'es_ES.lang', 'item.a=Hola\r\n');

    const primero = crearBackupObligatorio(ruta);
    expect(primero).toContain('.bak_');
    expect(fs.existsSync(primero)).toBe(true);

    // Crea copias con sellos distintos y comprueba la rotación.
    for (let i = 0; i < 4; i++) {
      const copia = ruta + '.bak_20260101_00000' + i + '_000_aaaaaaaa';
      fs.writeFileSync(copia, 'x');
    }
    const borradas = limpiarBackups(ruta, 2);
    expect(borradas).toBe(3);

    const restantes = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('es_ES.lang.bak_'));
    expect(restantes).toHaveLength(2);
  });
});
