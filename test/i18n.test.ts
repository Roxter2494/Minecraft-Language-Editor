import { describe, expect, it } from 'vitest';
import { clavesFaltantes, normalizarIdiomaUi, t } from '../src/core/i18n';

describe('i18n', () => {
  it('todas las traducciones tienen las mismas claves que el español', () => {
    const faltantes = clavesFaltantes().filter((x) => x.claves.length > 0);
    expect(faltantes).toEqual([]);
  });

  it('traduce las claves de estado de herencia', () => {
    for (const idioma of ['es', 'en', 'pt-BR'] as const) {
      for (const clave of ['stateHeredada', 'stateRevisar', 'stateNueva', 'stateVacia']) {
        const valor = t(idioma, clave);
        expect(valor).not.toBe(clave);
        expect(valor.length).toBeGreaterThan(0);
      }
    }
  });

  it('normaliza los códigos de idioma', () => {
    expect(normalizarIdiomaUi('en-US')).toBe('en');
    expect(normalizarIdiomaUi('pt_br')).toBe('pt-BR');
    expect(normalizarIdiomaUi('')).toBe('es');
    expect(normalizarIdiomaUi(undefined)).toBe('es');
  });

  it('interpola variables y conserva las desconocidas', () => {
    expect(t('es', 'countVisible', { n: 3 })).toContain('3');
    expect(t('es', 'claveInexistente')).toBe('claveInexistente');
  });
});
