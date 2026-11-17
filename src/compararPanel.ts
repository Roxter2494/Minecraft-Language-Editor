import * as vscode from 'vscode';
import * as path from 'path';
import { compararCarpetas } from './core/comparar';
import type { CompararFromWebview, CompararState } from './core/types';
import { normalizarCarpeta } from './core/rutas';
import { normalizarIdiomaUi, t } from './core/i18n';

/** Panel independiente para comparar dos carpetas `texts` completas. */
export class CompararPanel {
  public static current: CompararPanel | undefined;
  private static readonly viewType = 'minecraftLangEditor.compare';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private carpetaA: string;
  private carpetaB: string;
  private estado: CompararState | null = null;

  public static createOrShow(
    context: vscode.ExtensionContext,
    carpetaA?: string,
    carpetaB?: string,
  ): CompararPanel {
    if (CompararPanel.current) {
      CompararPanel.current.panel.reveal(vscode.ViewColumn.One);
      if (carpetaA !== undefined) CompararPanel.current.carpetaA = carpetaA;
      if (carpetaB !== undefined) CompararPanel.current.carpetaB = carpetaB;
      void CompararPanel.current.comparar();
      return CompararPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      CompararPanel.viewType,
      t(contextoIdioma(), 'compareTitle'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-interface-v5.png');

    CompararPanel.current = new CompararPanel(panel, context, carpetaA ?? '', carpetaB ?? '');
    return CompararPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    carpetaA: string,
    carpetaB: string,
  ) {
    this.panel = panel;
    this.carpetaA = carpetaA;
    this.carpetaB = carpetaB;

    this.panel.webview.onDidReceiveMessage(
      (msg: CompararFromWebview) => {
        void this.onMessage(msg);
      },
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(
      () => {
        CompararPanel.current = undefined;
        for (const d of this.disposables) d.dispose();
      },
      null,
      this.disposables,
    );

    // Reenvía el estado al cambiar el idioma de la interfaz.
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (!e.affectsConfiguration('minecraftLangEditor.idiomaUi')) return;
        if (this.estado) {
          this.estado = { ...this.estado, idiomaUi: contextoIdioma() };
          this.post({ type: 'compareState', state: this.estado });
        } else if (this.carpetaA || this.carpetaB) {
          this.enviarEstadoVacio();
        }
      },
      null,
      this.disposables,
    );
  }

  private async onMessage(msg: CompararFromWebview): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (!this.carpetaA || !this.carpetaB) await this.pedirFaltantes();
        else await this.comparar();
        break;
      case 'pickFolder':
        await this.elegirCarpeta(msg.side);
        break;
      case 'swap': {
        const a = this.carpetaA;
        this.carpetaA = this.carpetaB;
        this.carpetaB = a;
        await this.comparar();
        break;
      }
      case 'recompare':
        await this.comparar();
        break;
      default:
        break;
    }
  }

  private async pedirFaltantes(): Promise<void> {
    if (!this.carpetaA) await this.elegirCarpeta('a');
    if (!this.carpetaB) await this.elegirCarpeta('b');
    if (this.carpetaA && this.carpetaB) await this.comparar();
    else this.enviarEstadoVacio();
  }

  private async elegirCarpeta(side: 'a' | 'b'): Promise<void> {
    const idioma = contextoIdioma();
    const actual = side === 'a' ? this.carpetaA : this.carpetaB;
    const sel = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t(idioma, side === 'a' ? 'pickA' : 'pickB'),
      title: t(idioma, side === 'a' ? 'folderA' : 'folderB'),
      defaultUri: actual ? vscode.Uri.file(actual) : undefined,
    });
    if (!sel || sel.length === 0) return;

    const carpeta = normalizarCarpeta(sel[0].fsPath);
    if (side === 'a') this.carpetaA = carpeta;
    else this.carpetaB = carpeta;
    await this.comparar();
  }

  private async comparar(): Promise<void> {
    if (!this.carpetaA || !this.carpetaB) {
      this.enviarEstadoVacio();
      return;
    }
    try {
      const resultado = compararCarpetas(this.carpetaA, this.carpetaB);
      this.estado = {
        carpetaA: resultado.carpetaA,
        carpetaB: resultado.carpetaB,
        archivos: resultado.archivos,
        resumen: resultado.resumen,
        idiomaUi: contextoIdioma(),
      };
      this.post({ type: 'compareState', state: this.estado });
    } catch (e) {
      this.post({
        type: 'compareError',
        message: t(contextoIdioma(), 'compareError', { error: mensajeDeError(e) }),
      });
    }
  }

  private enviarEstadoVacio(): void {
    this.estado = {
      carpetaA: this.carpetaA,
      carpetaB: this.carpetaB,
      archivos: [],
      resumen: {
        archivos: 0,
        iguales: 0,
        soloA: 0,
        soloB: 0,
        cambiados: 0,
        altas: 0,
        bajas: 0,
        cambiadas: 0,
      },
      idiomaUi: contextoIdioma(),
    };
    this.post({ type: 'compareState', state: this.estado });
  }

  private post(msg: Parameters<vscode.Webview['postMessage']>[0]): void {
    void this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'comparar.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'),
    );
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon-interface-v5.png'),
    );

    return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>${t(contextoIdioma(), 'compareTitle')}</title>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="${iconUri}" alt="" />
        <div class="brand-text">
          <h1 data-i18n="compareTitle">Comparar carpetas texts</h1>
          <div class="folder" id="rutaA"></div>
          <div class="folder" id="rutaB"></div>
        </div>
      </div>
      <div class="top-actions">
        <button id="btnA" class="secondary" data-i18n="pickA">Elegir A</button>
        <button id="btnB" class="secondary" data-i18n="pickB">Elegir B</button>
        <button id="btnSwap" class="secondary" data-i18n="swap">Intercambiar</button>
        <button id="btnRecompare" class="primary" data-i18n="recompare">Comparar de nuevo</button>
      </div>
    </header>

    <section class="toolbar">
      <label class="search">
        <span data-i18n="search">Buscar</span>
        <input id="filtro" type="search" data-i18n-placeholder="filterPath" placeholder="Filtrar por ruta…" autocomplete="off" />
      </label>
      <label class="field">
        <span data-i18n="state">Estado</span>
        <select id="selEstado">
          <option value="" data-i18n="allStates">Todos los estados</option>
          <option value="cambiado" data-i18n="stateChanged">Cambiado</option>
          <option value="soloA" data-i18n="stateOnlyA">Solo en A</option>
          <option value="soloB" data-i18n="stateOnlyB">Solo en B</option>
          <option value="igual" data-i18n="stateEqual">Igual</option>
        </select>
      </label>
      <div id="resumen" class="contador"></div>
    </section>

    <main class="compare-wrap">
      <div class="compare-table">
        <table>
          <thead>
            <tr>
              <th data-i18n="file">Archivo</th>
              <th data-i18n="state">Estado</th>
              <th data-i18n="added">Altas</th>
              <th data-i18n="removed">Bajas</th>
              <th data-i18n="changed">Cambiadas</th>
            </tr>
          </thead>
          <tbody id="cuerpo"></tbody>
        </table>
        <div id="vacio" class="vacio"></div>
      </div>
      <aside class="compare-detail">
        <h2 data-i18n="details">Detalle</h2>
        <div id="detalle" class="detalle"></div>
      </aside>
    </main>

    <footer class="statusbar">
      <span id="estado" data-i18n="statusReady">Listo.</span>
      <span class="hint" data-i18n="compareSubtitle">Carpeta A (actual) frente a carpeta B (anterior)</span>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function contextoIdioma(): string {
  return normalizarIdiomaUi(
    vscode.workspace.getConfiguration('minecraftLangEditor').get<string>('idiomaUi', 'es'),
  );
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
