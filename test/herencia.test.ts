import { describe, expect, it } from 'vitest';
import { compararVersiones, heredarTraducciones } from '../src/core/herencia';
import type { ArchivoLang } from '../src/core/types';

/** Construye un ArchivoLang en memoria a partir de pares clave/texto. */
function archivo(pares: Array<[string, string]>): ArchivoLang {
  return {
    ruta: '',
    codigo: '',
    lineas: pares.map(([clave, texto]) => ({ esPar: true, clave, texto, cruda: '' })),
  };
}

describe('comparación de versiones', () => {
  it('detecta altas, bajas y textos cambiados', () => {
    const actual = archivo([
      ['a', 'Hello'],
      ['b', 'World!'],
      ['c', 'New'],
    ]);
    const anterior = archivo([
      ['a', 'Hello'],
      ['b', 'World'],
      ['d', 'Old'],
    ]);

    const cambios = compararVersiones(actual, anterior);
    expect(cambios.nuevas).toEqual(['c']);
    expect(cambios.eliminadas).toEqual(['d']);
    expect(cambios.cambiadas).toEqual(['b']);
  });
});

describe('herencia de traducciones', () => {
  it('hereda las claves que no cambiaron', () => {
    const actual = archivo([
      ['a', 'Hello'],
      ['b', 'World'],
    ]);
    const anteriorOrigen = archivo([
      ['a', 'Hello'],
      ['b', 'World'],
    ]);
    const anteriorDestino = archivo([
      ['a', 'Hola'],
      ['b', 'Mundo'],
    ]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('a')).toBe('Hola');
    expect(r.traducciones.get('b')).toBe('Mundo');
    expect(r.estados.get('a')).toBe('heredada');
    expect(r.heredadas).toBe(2);
    expect(r.revisar).toBe(0);
  });

  it('marca por revisar cuando cambió el texto original', () => {
    const actual = archivo([['b', 'World!']]);
    const anteriorOrigen = archivo([['b', 'World']]);
    const anteriorDestino = archivo([['b', 'Mundo']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('b')).toBe('Mundo');
    expect(r.estados.get('b')).toBe('revisar');
    expect(r.revisar).toBe(1);
  });

  it('deja vacías y marca como nuevas las claves que no existían', () => {
    const actual = archivo([
      ['a', 'Hello'],
      ['c', 'New'],
    ]);
    const anteriorOrigen = archivo([['a', 'Hello']]);
    const anteriorDestino = archivo([['a', 'Hola']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('c')).toBe('');
    expect(r.estados.get('c')).toBe('nueva');
    expect(r.nuevas).toBe(1);
  });

  it('respeta las traducciones actuales no vacías', () => {
    const actual = archivo([['a', 'Hello']]);
    const anteriorOrigen = archivo([['a', 'Hello']]);
    const anteriorDestino = archivo([['a', 'Hola']]);
    const actuales = new Map([['a', 'Holi']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, actuales);
    expect(r.traducciones.get('a')).toBe('Holi');
    expect(r.estados.get('a')).toBe('traducida');
  });

  it('hereda una copia del inglés que en realidad estaba sin traducir', () => {
    const actual = archivo([['a', 'Hello']]);
    const anteriorOrigen = archivo([['a', 'Hello']]);
    const anteriorDestino = archivo([['a', 'Hola']]);
    const actuales = new Map([['a', 'Hello']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, actuales);
    expect(r.traducciones.get('a')).toBe('Hola');
    expect(r.estados.get('a')).toBe('heredada');
  });

  it('hereda por renombre cuando el texto original es idéntico y único', () => {
    const actual = archivo([['item.new', 'Diamond Sword']]);
    const anteriorOrigen = archivo([['item.old', 'Diamond Sword']]);
    const anteriorDestino = archivo([['item.old', 'Espada de diamante']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('item.new')).toBe('Espada de diamante');
    expect(r.estados.get('item.new')).toBe('heredada');
    expect(r.renombradas).toBe(1);
  });

  it('no renombra textos demasiado cortos o comunes', () => {
    const actual = archivo([['item.new', 'Yes']]);
    const anteriorOrigen = archivo([['item.old', 'Yes']]);
    const anteriorDestino = archivo([['item.old', 'Sí']]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('item.new')).toBe('');
    expect(r.estados.get('item.new')).toBe('nueva');
    expect(r.renombradas).toBe(0);
  });

  it('no renombra si hay varias claves viejas con el mismo texto', () => {
    const actual = archivo([['item.new', 'Diamond Sword']]);
    const anteriorOrigen = archivo([
      ['item.old1', 'Diamond Sword'],
      ['item.old2', 'Diamond Sword'],
    ]);
    const anteriorDestino = archivo([
      ['item.old1', 'Espada de diamante'],
      ['item.old2', 'Espada de diamante'],
    ]);

    const r = heredarTraducciones(actual, anteriorOrigen, anteriorDestino, new Map());
    expect(r.traducciones.get('item.new')).toBe('');
    expect(r.renombradas).toBe(0);
  });
});
