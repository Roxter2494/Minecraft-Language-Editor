import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  actualizarLanguagesJson,
  crearBackupObligatorio,
  diccionarioDe,
  escribir,
  leer,
  limpiarBackups,
} from '../src/core/langFileIo';

const temporales: string[] = [];

function carpetaTexts(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'langsave-'));
  temporales.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporales.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Simula el flujo de guardado del panel: lee el origen, aplica traducciones
 * (con respaldo del texto original) y actualiza languages.json.
 */
function guardar(origenRuta: string, destinoRuta: string, traducciones: Map<string, string>) {
  const origen = leer(origenRuta);
  const final = new Map<string, string>();
  for (const par of origen.lineas) {
    if (!par.esPar || !par.clave.trim()) continue;
    let valor = par.texto ?? '';
    const t = traducciones.get(par.clave);
    if (t !== undefined && t !== '') valor = t;
    final.set(par.clave, valor);
  }
  return { origen, final, res: escribir(destinoRuta, origen, final) };
}

describe('flujo de guardado', () => {
  it('crea el destino conservando estructura y actualiza languages.json', () => {
    const dir = carpetaTexts();
    const origenRuta = path.join(dir, 'en_US.lang');
    fs.writeFileSync(
      origenRuta,
      '# cabecera\r\n\r\nitem.a=Hello\r\nitem.b=World\r\nitem.c=World\r\n',
      'utf8',
    );
    fs.writeFileSync(path.join(dir, 'languages.json'), '[\r\n  "en_US"\r\n]', 'utf8');

    const destinoRuta = path.join(dir, 'es_ES.lang');
    const traducciones = new Map([['item.a', 'Hola']]);
    const { res } = guardar(origenRuta, destinoRuta, traducciones);
    expect(res.ok).toBe(true);

    const crudo = fs.readFileSync(destinoRuta, 'utf8');
    expect(crudo).toBe(
      '# cabecera\r\n\r\nitem.a=Hola\r\nitem.b=World\r\nitem.c=World\r\n',
    );

    expect(actualizarLanguagesJson(dir, 'es_ES').ok).toBe(true);
    const json = fs.readFileSync(path.join(dir, 'languages.json'), 'utf8');
    expect(json).toContain('"en_US"');
    expect(json).toContain('"es_ES"');
  });

  it('crea backup antes de sobrescribir y rota las copias', () => {
    const dir = carpetaTexts();
    const origenRuta = path.join(dir, 'en_US.lang');
    const destinoRuta = path.join(dir, 'es_ES.lang');
    fs.writeFileSync(origenRuta, 'item.a=Hello\r\n', 'utf8');
    fs.writeFileSync(destinoRuta, 'item.a=Hola\r\n', 'utf8');

    const backup = crearBackupObligatorio(destinoRuta);
    expect(backup).toContain('es_ES.lang.bak_');
    expect(fs.readFileSync(backup, 'utf8')).toBe('item.a=Hola\r\n');

    const { res } = guardar(origenRuta, destinoRuta, new Map([['item.a', 'Hola!']]));
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(destinoRuta, 'utf8')).toBe('item.a=Hola!\r\n');
  });

  it('el destino existente conserva traducciones y siembra duplicados', () => {
    const dir = carpetaTexts();
    const origenRuta = path.join(dir, 'en_US.lang');
    const destinoRuta = path.join(dir, 'es_ES.lang');
    fs.writeFileSync(
      origenRuta,
      'item.a=Hello\r\nitem.b=World\r\nitem.c=World\r\n',
      'utf8',
    );
    fs.writeFileSync(destinoRuta, 'item.a=Hola\r\nitem.b=Mundo\r\n', 'utf8');

    const existentes = diccionarioDe(destinoRuta);
    const origen = leer(origenRuta);
    const traducciones = new Map(existentes);

    // Siembra: item.c tiene el mismo origen que item.b (ya traducido).
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      const actual = traducciones.get(par.clave);
      if (actual && actual.length > 0) continue;
      for (const otro of origen.lineas) {
        if (!otro.esPar) continue;
        if (otro.texto !== par.texto) continue;
        const t = traducciones.get(otro.clave);
        if (t && t.length > 0) {
          traducciones.set(par.clave, t);
          break;
        }
      }
    }
    expect(traducciones.get('item.c')).toBe('Mundo');

    const { res } = guardar(origenRuta, destinoRuta, traducciones);
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(destinoRuta, 'utf8')).toBe(
      'item.a=Hola\r\nitem.b=Mundo\r\nitem.c=Mundo\r\n',
    );
  });

  it('conserva los últimos backups indicados', () => {
    const dir = carpetaTexts();
    const destinoRuta = path.join(dir, 'es_ES.lang');
    fs.writeFileSync(destinoRuta, 'x', 'utf8');
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(destinoRuta + '.bak_20260101_00000' + i + '_000_aaaaaaaa', 'x');
    }
    const borradas = limpiarBackups(destinoRuta, 3);
    expect(borradas).toBe(2);
    const restantes = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('es_ES.lang.bak_'));
    expect(restantes).toHaveLength(3);
  });
});
