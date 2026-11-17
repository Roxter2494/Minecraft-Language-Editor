import { describe, expect, it } from 'vitest';
import { detectarNombresPropios } from '../src/core/nombresPropios';

describe('detección de nombres propios', () => {
  it('detecta nombres en medio de la frase y marcas internas', () => {
    const candidatos = detectarNombresPropios([
      'Give the sword to Steve.',
      'Steve lives in Minecraft.',
      'Use the iPhone to call.',
    ]);
    const palabras = candidatos.map((c) => c.palabra);

    expect(palabras).toContain('Steve');
    expect(palabras).toContain('Minecraft');
    expect(palabras).toContain('iPhone');
  });

  it('no marca palabras comunes al inicio de la frase', () => {
    const candidatos = detectarNombresPropios([
      'The world is open.',
      'Open the menu now.',
      'This is the end.',
    ]);
    const palabras = candidatos.map((c) => c.palabra.toLowerCase());

    expect(palabras).not.toContain('the');
    expect(palabras).not.toContain('open');
    expect(palabras).not.toContain('this');
  });

  it('cuenta ocurrencias y guarda ejemplos', () => {
    const candidatos = detectarNombresPropios([
      'Talk to Alex.',
      'Alex gives you a map.',
      'Alex is here.',
    ]);
    const alex = candidatos.find((c) => c.palabra === 'Alex');
    expect(alex?.ocurrencias).toBe(3);
    expect(alex?.ejemplos.length).toBeGreaterThan(0);
  });

  it('detecta honoríficos como nombres', () => {
    const candidatos = detectarNombresPropios(['Good morning, Sir.']);
    expect(candidatos.map((c) => c.palabra)).toContain('Sir');
  });

  it('respeta el máximo de candidatos', () => {
    const nombres = [
      'Alice', 'Bruno', 'Carla', 'Diego', 'Elena', 'Farid', 'Greta', 'Hugo',
      'Irene', 'Jonas', 'Klara', 'Lucas', 'Marta', 'Nadia', 'Oscar', 'Paula',
    ];
    const textos = nombres.map((n) => `Text with ${n} inside.`);
    const candidatos = detectarNombresPropios(textos, 10);
    expect(candidatos).toHaveLength(10);
  });
});
