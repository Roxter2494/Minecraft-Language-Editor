import { describe, expect, it } from 'vitest';
import {
  PROVEEDORES,
  buscarProveedor,
  claveSecreto,
  construirPeticion,
  extraerTexto,
  mensajeDeErrorHttp,
  urlBaseDe,
} from '../src/core/proveedoresIa';

describe('proveedores de IA', () => {
  it('encuentra el proveedor por id y cae en VS Code', () => {
    expect(buscarProveedor('openai').id).toBe('openai');
    expect(buscarProveedor('anthropic').id).toBe('anthropic');
    expect(buscarProveedor('google').id).toBe('google');
    expect(buscarProveedor('compatible').id).toBe('compatible');
    expect(buscarProveedor('no-existe').id).toBe('vscode');
    expect(buscarProveedor(undefined).id).toBe('vscode');
  });

  it('usa un nombre de secreto estable por proveedor', () => {
    expect(claveSecreto('openai')).toBe('minecraftLangEditor.apiKey.openai');
    expect(claveSecreto('google')).toBe('minecraftLangEditor.apiKey.google');
  });

  it('solo los proveedores externos necesitan clave', () => {
    for (const p of PROVEEDORES) {
      expect(p.clave).toBe(p.id !== 'vscode');
    }
  });

  it('quita las barras finales de la URL base', () => {
    const openai = buscarProveedor('openai');
    expect(urlBaseDe(openai, '')).toBe('https://api.openai.com/v1');
    expect(urlBaseDe(openai, 'https://proxy.local/v1///')).toBe('https://proxy.local/v1');
    expect(urlBaseDe(openai, 'https://proxy.local/v1/')).toBe('https://proxy.local/v1');
  });

  it('construye la petición de OpenAI y compatibles', () => {
    const peticion = construirPeticion(buscarProveedor('openai'), {
      modelo: 'gpt-4o-mini',
      urlBase: '',
      clave: 'sk-prueba',
      prompt: 'hola',
    });

    expect(peticion.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(peticion.headers.authorization).toBe('Bearer sk-prueba');
    expect(peticion.body).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hola' }],
    });

    const compatible = construirPeticion(buscarProveedor('compatible'), {
      modelo: 'llama3',
      urlBase: 'http://localhost:11434/v1/',
      clave: 'x',
      prompt: 'hola',
    });
    expect(compatible.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(compatible.body).toMatchObject({ model: 'llama3' });

    // Los modelos de razonamiento no aceptan `temperature`.
    const razonamiento = construirPeticion(buscarProveedor('openai'), {
      modelo: 'o4-mini',
      urlBase: '',
      clave: 'sk-prueba',
      prompt: 'hola',
    });
    expect(razonamiento.body).not.toHaveProperty('temperature');
  });

  it('construye la petición de Anthropic', () => {
    const peticion = construirPeticion(buscarProveedor('anthropic'), {
      modelo: 'claude-sonnet-4-5',
      urlBase: '',
      clave: 'sk-ant',
      prompt: 'hola',
      maxTokens: 123,
    });

    expect(peticion.url).toBe('https://api.anthropic.com/v1/messages');
    expect(peticion.headers['x-api-key']).toBe('sk-ant');
    expect(peticion.headers['anthropic-version']).toBe('2023-06-01');
    expect(peticion.body).toMatchObject({
      model: 'claude-sonnet-4-5',
      max_tokens: 123,
      messages: [{ role: 'user', content: 'hola' }],
    });
  });

  it('construye la petición de Google', () => {
    const peticion = construirPeticion(buscarProveedor('google'), {
      modelo: 'gemini-2.5-flash',
      urlBase: '',
      clave: 'clave-google',
      prompt: 'hola',
    });

    expect(peticion.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(peticion.headers['x-goog-api-key']).toBe('clave-google');
    expect(peticion.body).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
    });
  });

  it('extrae el texto de cada formato de respuesta', () => {
    expect(
      extraerTexto('openai', { choices: [{ message: { content: '  hola  ' } }] }),
    ).toBe('hola');
    expect(
      extraerTexto('compatible', { choices: [{ message: { content: 'ok' } }] }),
    ).toBe('ok');
    expect(
      extraerTexto('anthropic', {
        content: [
          { type: 'text', text: 'hola ' },
          { type: 'tool_use', text: 'ignorar' },
          { type: 'text', text: 'mundo' },
        ],
      }),
    ).toBe('hola mundo');
    expect(
      extraerTexto('google', {
        candidates: [{ content: { parts: [{ text: 'hola ' }, { text: 'mundo' }] } }],
      }),
    ).toBe('hola mundo');
    expect(extraerTexto('openai', {})).toBe('');
  });

  it('resume los errores HTTP con el mensaje del proveedor', () => {
    expect(mensajeDeErrorHttp(401, JSON.stringify({ error: { message: 'clave inválida' } }))).toBe(
      '401: clave inválida',
    );
    expect(mensajeDeErrorHttp(429, JSON.stringify({ message: 'sin cuota' }))).toBe('429: sin cuota');
    expect(mensajeDeErrorHttp(500, 'texto plano')).toBe('500: texto plano');
    expect(mensajeDeErrorHttp(500, '')).toBe('500: sin detalle');
  });
});
