import * as vscode from 'vscode';
import * as path from 'path';
import { LangEditorPanel } from './panel';
import { CompararPanel } from './compararPanel';
import { DeteccionPanel } from './deteccionPanel';
import { IaPanel } from './iaPanel';
import { usarSecretosIa } from './ia';
import { claveSecreto } from './core/proveedoresIa';

/** Carpeta y código del .lang activo, si hay uno. */
function archivoLangActivo(): { carpeta: string; codigo: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const uri = editor.document.uri;
  if (uri.scheme !== 'file') return undefined;
  const nombre = path.basename(uri.fsPath);
  if (!nombre.toLowerCase().endsWith('.lang')) return undefined;
  return {
    carpeta: path.dirname(uri.fsPath),
    codigo: nombre.slice(0, -'.lang'.length),
  };
}

/** Carpeta del editor si ya está abierto; si no, la del archivo activo. */
function carpetaActual(): string {
  return LangEditorPanel.current?.carpeta() || archivoLangActivo()?.carpeta || '';
}

export function activate(context: vscode.ExtensionContext): void {
  // Las claves API viven en SecretStorage; la IA las pide bajo demanda.
  usarSecretosIa(async (proveedor) => context.secrets.get(claveSecreto(proveedor)));

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.open', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      const activo = archivoLangActivo();
      if (activo) await panel.abrirEnCarpeta(activo.carpeta, activo.codigo);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.openFolder', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.elegirCarpeta();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.inheritPrevious', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.heredarVersionAnterior();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'minecraftLangEditor.compareFolders',
      async (carpetaA?: string) => {
        CompararPanel.createOrShow(context, carpetaA ?? carpetaActual());
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'minecraftLangEditor.detectTexts',
      async (folder?: string) => {
        DeteccionPanel.createOrShow(context, folder ?? carpetaActual());
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.editGlossary', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.editarGlosario();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.reviewNames', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.revisarNombresPropios();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.translateAI', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.traducirConIa();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.reviewAI', async () => {
      const panel = LangEditorPanel.createOrShow(context);
      await panel.revisarConIa();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('minecraftLangEditor.configureAI', () => {
      IaPanel.createOrShow(context);
    }),
  );
}

export function deactivate(): void {
  // El panel se encarga de sus suscripciones.
}
