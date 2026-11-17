import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compararCarpetas, listarArchivosLang } from '../src/core/comparar';

const temporales: string[] = [];

function dirTemporal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  temporales.push(dir);
  return dir;
}

function escribir(dir: string, nombre: string, contenido: string): void {
  const ruta = path.join(dir, nombre);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, contenido, 'utf8');
}

afterEach(() => {
  for (const dir of temporales.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('comparación de carpetas', () => {
  it('detecta archivos solo en A, solo en B y claves cambiadas', () => {
    const a = dirTemporal();
    const b = dirTemporal();

    escribir(a, 'en_US.lang', '# comentario\r\na=Hello\r\nb=World!\r\nc=New\r\n');
    escribir(a, 'sub/es_ES.lang', 'x=Hola\r\n');
    escribir(b, 'en_US.lang', '# viejo\r\na=Hello\r\nb=World\r\nd=Old\r\n');
    escribir(b, 'fr_FR.lang', 'y=Bonjour\r\n');

    const res = compararCarpetas(a, b);
    const porRuta = new Map(res.archivos.map((f) => [f.ruta, f]));

    expect(porRuta.get('en_US.lang')?.estado).toBe('cambiado');
    expect(porRuta.get('en_US.lang')?.altas).toBe(1); // c
    expect(porRuta.get('en_US.lang')?.bajas).toBe(1); // d
    expect(porRuta.get('en_US.lang')?.cambiadas).toBe(1); // b
    expect(porRuta.get('sub/es_ES.lang')?.estado).toBe('soloA');
    expect(porRuta.get('fr_FR.lang')?.estado).toBe('soloB');

    expect(res.resumen.archivos).toBe(3);
    expect(res.resumen.soloA).toBe(1);
    expect(res.resumen.soloB).toBe(1);
    expect(res.resumen.cambiados).toBe(1);
  });

  it('marca como iguales los archivos idénticos', () => {
    const a = dirTemporal();
    const b = dirTemporal();
    escribir(a, 'en_US.lang', 'a=Hello\r\n');
    escribir(b, 'en_US.lang', 'a=Hello\r\n');

    const res = compararCarpetas(a, b);
    expect(res.archivos).toHaveLength(1);
    expect(res.archivos[0].estado).toBe('igual');
    expect(res.resumen.iguales).toBe(1);
  });

  it('lista solo archivos .lang ignorando otras extensiones', () => {
    const dir = dirTemporal();
    escribir(dir, 'en_US.lang', 'a=Hello\r\n');
    escribir(dir, 'notes.txt', 'hola');
    escribir(dir, 'languages.json', '[]');

    const archivos = listarArchivosLang(dir);
    expect(archivos.map((a) => a.rel)).toEqual(['en_US.lang']);
  });

  it('devuelve un resultado vacío si la carpeta no existe', () => {
    const res = compararCarpetas(path.join(os.tmpdir(), 'no-existe-xyz'), '');
    expect(res.archivos).toEqual([]);
    expect(res.resumen.archivos).toBe(0);
  });
});
