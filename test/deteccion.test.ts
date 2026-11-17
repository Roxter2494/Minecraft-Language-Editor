import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cadenasDeJson,
  claveSintetica,
  detectarTextos,
  esTextoCandidato,
  extraerCadenasDeScript,
} from '../src/core/deteccion';

const temporales: string[] = [];

function dirTemporal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'det-'));
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

describe('extracción de cadenas de script', () => {
  it('lee comillas simples, dobles y plantillas sin interpolación', () => {
    const codigo = [
      "const a = 'Hello world';",
      'const b = "Second text";',
      'const c = `Third text`;',
      'const d = `Hola ${nombre}`;',
      '// "comentario"',
      '/* "bloque" */',
    ].join('\n');

    const textos = extraerCadenasDeScript(codigo).map((x) => x.texto);
    expect(textos).toContain('Hello world');
    expect(textos).toContain('Second text');
    expect(textos).toContain('Third text');
    expect(textos.some((x) => x.includes('Hola'))).toBe(false);
    expect(textos).not.toContain('comentario');
    expect(textos).not.toContain('bloque');
  });

  it('conserva la línea de cada literal', () => {
    const codigo = 'const a = 1;\nconst b = "Texto";\n';
    const [hallazgo] = extraerCadenasDeScript(codigo);
    expect(hallazgo.linea).toBe(2);
  });
});

describe('filtro de candidatos', () => {
  it('acepta textos de interfaz y descarta ruido técnico', () => {
    expect(esTextoCandidato('Diamond Sword')).toBe(true);
    expect(esTextoCandidato('Guardar cambios')).toBe(true);
    expect(esTextoCandidato('https://example.com')).toBe(false);
    expect(esTextoCandidato('user@example.com')).toBe(false);
    expect(esTextoCandidato('12345')).toBe(false);
    expect(esTextoCandidato('require', 'script')).toBe(false);
    expect(esTextoCandidato('minecraft:stone', 'script')).toBe(false);
  });
});

describe('claves sintéticas', () => {
  it('genera una clave estable y evita duplicados', () => {
    const usadas = new Set<string>();
    const a = claveSintetica('ui/hud.json', 'Hello world!', usadas);
    expect(a).toBe('hud.hello_world');
    usadas.add(a.toLowerCase());
    const b = claveSintetica('ui/hud.json', 'Hello world!', usadas);
    expect(b).toBe('hud.hello_world_2');
  });
});

describe('detección en carpetas', () => {
  it('encuentra textos en .lang, .json y scripts', () => {
    const dir = dirTemporal();
    escribir(dir, 'texts/en_US.lang', 'greeting=Hello there\r\n');
    escribir(dir, 'ui/menu.json', JSON.stringify({ title: 'Main menu', nested: ['Play now'] }));
    escribir(dir, 'scripts/main.js', 'const msg = "Welcome back";\n');

    const textos = detectarTextos(dir);
    const valores = textos.map((x) => x.texto);

    expect(valores).toContain('Hello there');
    expect(valores).toContain('Main menu');
    expect(valores).toContain('Play now');
    expect(valores).toContain('Welcome back');

    const fuentes = new Set(textos.map((x) => x.fuente));
    expect(fuentes).toEqual(new Set(['lang', 'json', 'script']));
  });

  it('ignora node_modules y archivos no traducibles', () => {
    const dir = dirTemporal();
    escribir(dir, 'node_modules/pkg/menu.json', JSON.stringify({ t: 'Do not read' }));
    escribir(dir, 'ui/menu.json', JSON.stringify({ t: 'Read me' }));

    const textos = detectarTextos(dir);
    expect(textos.map((x) => x.texto)).toEqual(['Read me']);
  });
});

describe('cadenas de JSON', () => {
  it('recorre objetos y arreglos anidados', () => {
    const valores = cadenasDeJson({ a: 'uno', b: ['dos', { c: 'tres' }], d: 4 });
    expect(valores).toEqual(['uno', 'dos', 'tres']);
  });
});
