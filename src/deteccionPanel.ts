import * as vscode from 'vscode';
import { detectarTextos } from './core/deteccion';
import type { DeteccionFromWebview, DeteccionState } from './core/types';
import { normalizarIdiomaUi, t } from './core/i18n';
import { LangEditorPanel } from './panel';

/** Panel independiente para detectar textos traducibles en el pack. */
export class DeteccionPanel {
  public static current: DeteccionPanel | undefined;
  private static readonly viewType = 'minecraftLangEditor.detect';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private folder: string;
  private textos: DeteccionState['textos'] = [];
  private escaneando = false;

  public static createOrShow(
    context: vscode.ExtensionContext,
    folder?: string,
  ): DeteccionPanel {
    if (DeteccionPanel.current) {
      DeteccionPanel.current.panel.reveal(vscode.ViewColumn.One);
      if (folder) {
        DeteccionPanel.current.folder = folder;
        void DeteccionPanel.current.escanear();
      }
      return DeteccionPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      DeteccionPanel.viewType,
      t(contextoIdioma(), 'detectTitle'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-interface-v5.png');

    DeteccionPanel.current = new DeteccionPanel(panel, context, folder ?? '');
    return DeteccionPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    folder: string,
  ) {
    this.panel = panel;
    this.folder = folder;

    this.panel.webview.onDidReceiveMessage(
      (msg: DeteccionFromWebview) => {
        void this.onMessage(msg);
      },
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(
      () => {
        DeteccionPanel.current = undefined;
        for (const d of this.disposables) d.dispose();
      },
      null,
      this.disposables,
    );

    // Si cambia el idioma de la interfaz, reenvía el estado para retraducirla.
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('minecraftLangEditor.idiomaUi')) this.enviarEstado();
      },
      null,
      this.disposables,
    );
  }

  private async onMessage(msg: DeteccionFromWebview): Promise<void> {
    switch (msg.type) {
      case 'ready':
        if (this.folder) await this.escanear();
        else await this.elegirCarpeta();
        break;
      case 'pickFolder':
        await this.elegirCarpeta();
        break;
      case 'scan':
        await this.escanear();
        break;
      case 'import':
        await this.importar(msg.textos);
        break;
      default:
        break;
    }
  }

  private async elegirCarpeta(): Promise<void> {
    const sel = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t(contextoIdioma(), 'pickDetectFolder'),
      defaultUri: this.folder ? vscode.Uri.file(this.folder) : undefined,
    });
    if (!sel || sel.length === 0) {
      this.enviarEstado();
      return;
    }
    this.folder = sel[0].fsPath;
    await this.escanear();
  }

  private async escanear(): Promise<void> {
    if (!this.folder) {
      this.enviarEstado();
      return;
    }
    this.escaneando = true;
    this.enviarEstado();
    try {
      this.textos = detectarTextos(this.folder);
    } catch (e) {
      this.post({
        type: 'detectError',
        message: t(contextoIdioma(), 'detectError', { error: mensajeDeError(e) }),
      });
      this.textos = [];
    } finally {
      this.escaneando = false;
      this.enviarEstado();
    }
  }

  private async importar(textos: DeteccionState['textos']): Promise<void> {
    const idioma = contextoIdioma();
    if (textos.length === 0) {
      this.post({ type: 'detectError', message: t(idioma, 'nothingSelected') });
      return;
    }
    const panel = LangEditorPanel.createOrShow(this.context);
    const res = await panel.importarTextos(
      textos.map((t) => ({ clave: t.clave, texto: t.texto })),
    );
    if (res.sinOrigen) {
      this.post({ type: 'detectError', message: t(idioma, 'noEditor') });
      void vscode.window.showWarningMessage(t(idioma, 'noEditor'));
      return;
    }
    if (res.importados > 0) {
      this.post({ type: 'importDone' });
      this.enviarEstado();
      void vscode.window.showInformationMessage(
        t(idioma, 'importedTexts', { n: res.importados }),
      );
    } else {
      this.post({ type: 'detectError', message: t(idioma, 'importAllExist') });
      void vscode.window.showWarningMessage(t(idioma, 'importAllExist'));
    }
  }

  private enviarEstado(): void {
    this.post({
      type: 'detectState',
      state: {
        folder: this.folder,
        textos: this.textos,
        idiomaUi: contextoIdioma(),
        escaneando: this.escaneando,
      },
    });
  }

  private post(msg: Parameters<vscode.Webview['postMessage']>[0]): void {
    void this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'deteccion.js'),
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
  <title>${t(contextoIdioma(), 'detectTitle')}</title>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="${iconUri}" alt="" />
        <div class="brand-text">
          <h1 data-i18n="detectTitle">Detectar textos traducibles</h1>
          <div class="folder" id="ruta"></div>
        </div>
      </div>
      <div class="top-actions">
        <button id="btnFolder" class="secondary" data-i18n="pickDetectFolder">Elegir carpeta</button>
        <button id="btnScan" class="secondary" data-i18n="scan">Escanear</button>
        <button id="btnImport" class="primary" data-i18n="importSelected">Importar al editor</button>
      </div>
    </header>

    <section class="toolbar">
      <label class="search">
        <span data-i18n="search">Buscar</span>
        <input id="filtro" type="search" data-i18n-placeholder="filterText" placeholder="Filtrar texto o archivo…" autocomplete="off" />
      </label>
      <label class="field">
        <span data-i18n="sourceColumn">Fuente</span>
        <select id="selFuente">
          <option value="" data-i18n="sourceAll">Todas</option>
          <option value="lang" data-i18n="sourceLang">LANG</option>
          <option value="json" data-i18n="sourceJson">JSON</option>
          <option value="script" data-i18n="sourceScript">Script</option>
        </select>
      </label>
      <button id="btnSelectAll" class="secondary" data-i18n="selectAll">Seleccionar todo</button>
      <button id="btnClear" class="secondary" data-i18n="clearSelection">Quitar selección</button>
      <div id="contador" class="contador"></div>
    </section>

    <main class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-check"></th>
            <th class="col-file" data-i18n="file">Archivo</th>
            <th class="col-line" data-i18n="line">Línea</th>
            <th class="col-source-kind" data-i18n="sourceColumn">Fuente</th>
            <th data-i18n="text">Texto</th>
            <th data-i18n="key">Clave</th>
          </tr>
        </thead>
        <tbody id="cuerpo"></tbody>
      </table>
      <div id="vacio" class="vacio"></div>
    </main>

    <footer class="statusbar">
      <span id="estado" data-i18n="statusReady">Listo.</span>
      <span class="hint" data-i18n="detectSubtitle">Textos de .lang, catálogos JSON y cadenas de scripts</span>
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
