import { describe, expect, it } from 'vitest';
import {
  agregarEntrada,
  contextoGlosario,
  equivalenciaPreferida,
  parseGlosario,
  serializarGlosario,
} from '../src/core/glosario';

describe('glosario', () => {
  it('parsea líneas, equivalencias y comentarios', () => {
    const entradas = parseGlosario(
      ['# comentario', 'Diamond = Diamante | Diamante brillante', '', 'Creeper = Creeper'].join(
        '\r\n',
      ),
    );

    expect(entradas).toEqual([
      { original: 'Diamond', equivalencias: ['Diamante', 'Diamante brillante'] },
      { original: 'Creeper', equivalencias: ['Creeper'] },
    ]);
  });

  it('ignora líneas inválidas y duplicados', () => {
    const entradas = parseGlosario('sin igual\notra = Uno\notra = Dos\n= vacío');
    expect(entradas).toEqual([{ original: 'otra', equivalencias: ['Uno'] }]);
  });

  it('serializa con el formato canónico', () => {
    const texto = serializarGlosario([
      { original: 'Diamond', equivalencias: ['Diamante', 'Diamante brillante'] },
    ]);
    expect(texto).toBe('Diamond = Diamante | Diamante brillante\r\n');
  });

  it('devuelve la equivalencia preferida sin distinguir mayúsculas', () => {
    const entradas = parseGlosario('Diamond = Diamante');
    expect(equivalenciaPreferida(entradas, ' diamond ')).toBe('Diamante');
    expect(equivalenciaPreferida(entradas, 'Gold')).toBe('');
  });

  it('añade términos nuevos y completa equivalencias existentes', () => {
    let entradas = agregarEntrada([], 'Diamond', ['Diamante']);
    entradas = agregarEntrada(entradas, 'diamond', ['Diamante', 'Diamante brillante']);
    entradas = agregarEntrada(entradas, 'Creeper', ['Creeper']);

    expect(entradas).toHaveLength(2);
    expect(entradas[0].equivalencias).toEqual(['Diamante', 'Diamante brillante']);
  });

  it('genera contexto compacto para la IA', () => {
    const entradas = parseGlosario('Diamond = Diamante\nCreeper = Creeper');
    const contexto = contextoGlosario(entradas);
    expect(contexto).toContain('- Diamond = Diamante');
    expect(contexto).toContain('- Creeper = Creeper');
  });
});
