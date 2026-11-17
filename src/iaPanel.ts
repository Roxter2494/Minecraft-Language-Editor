import * as vscode from 'vscode';
import {
  PROVEEDORES,
  claveSecreto,
  buscarProveedor,
  type ProveedorInfo,
} from './core/proveedoresIa';
import type { IaConfigFromWebview, IaConfigState } from './core/types';
import { normalizarIdiomaUi, t } from './core/i18n';
import { diagnosticarModelo } from './ia';
import { enviarProveedor } from './iaHttp';

const CLAVE_PROMPT_PRUEBA = 'Responde únicamente con la palabra OK.';

/**
 * Panel «Configurar IA»: proveedor, modelo, URL base y clave API del usuario.
 *
 * La clave se guarda en `SecretStorage` y nunca se envía a la webview ni se
 * escribe en los logs.
 */
export class IaPanel {
  public static current: IaPanel | undefined;
  private static readonly viewType = 'minecraftLangEditor.configureAI';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(context: vscode.ExtensionContext): IaPanel {
    if (IaPanel.current) {
      IaPanel.current.panel.reveal(vscode.ViewColumn.One);
      void IaPanel.current.enviarEstado();
      return IaPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      IaPanel.viewType,
      t(contextoIdioma(), 'aiConfigTitle'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-interface-v5.png');

    IaPanel.current = new IaPanel(panel, context);
    return IaPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel = panel;

    this.panel.webview.onDidReceiveMessage(
      (msg: IaConfigFromWebview) => {
        void this.onMessage(msg);
      },
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(
      () => {
        IaPanel.current = undefined;
        for (const d of this.disposables) d.dispose();
      },
      null,
      this.disposables,
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('minecraftLangEditor')) void this.enviarEstado();
      },
      null,
      this.disposables,
    );
  }

  private async onMessage(msg: IaConfigFromWebview): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
          await this.enviarEstado();
          break;
        case 'save':
          await this.guardar(msg.proveedor, msg.modelo, msg.urlBase, msg.clave);
          break;
        case 'deleteKey':
          await this.borrarClave(msg.proveedor);
          break;
        case 'test':
          await this.probar(msg.proveedor, msg.modelo, msg.urlBase, msg.clave);
          break;
        case 'openKeyUrl':
          if (/^https?:\/\//i.test(msg.url)) {
            await vscode.env.openExternal(vscode.Uri.parse(msg.url));
          }
          break;
        default:
          break;
      }
    } catch (e) {
      this.error(mensajeDeError(e));
    }
  }

  private async guardar(
    proveedor: string,
    modelo: string,
    urlBase: string,
    clave?: string,
  ): Promise<void> {
    const info = buscarProveedor(proveedor);
    const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
    await cfg.update('proveedorIA', info.id, vscode.ConfigurationTarget.Global);
    await cfg.update('modeloApi', (modelo ?? '').trim(), vscode.ConfigurationTarget.Global);
    await cfg.update('urlBaseIA', (urlBase ?? '').trim(), vscode.ConfigurationTarget.Global);

    const nueva = (clave ?? '').trim();
    if (nueva) await this.context.secrets.store(claveSecreto(info.id), nueva);

    this.info(t(contextoIdioma(), 'aiConfigSaved'));
    await this.enviarEstado();
  }

  private async borrarClave(proveedor: string): Promise<void> {
    const info = buscarProveedor(proveedor);
    await this.context.secrets.delete(claveSecreto(info.id));
    this.info(t(contextoIdioma(), 'aiKeyDeleted'));
    await this.enviarEstado();
  }

  private async probar(
    proveedor: string,
    modelo: string,
    urlBase: string,
    clave?: string,
  ): Promise<void> {
    const idioma = contextoIdioma();
    const info = buscarProveedor(proveedor);

    if (info.id === 'vscode') {
      const diag = await diagnosticarModelo();
      if (diag.ok) this.info(t(idioma, 'aiTestOk', { texto: 'VS Code' }));
      else this.error(this.mensajeSinModelo(diag.motivo, idioma));
      return;
    }

    const nombreModelo = (modelo ?? '').trim() || info.modelo;
    if (!nombreModelo) {
      this.error(t(idioma, 'aiModelRequired'));
      return;
    }

    const base = (urlBase ?? '').trim() || info.urlBase;
    if (info.id === 'compatible' && !base) {
      this.error(t(idioma, 'aiBaseUrlRequired'));
      return;
    }

    const usada =
      (clave ?? '').trim() ||
      (await this.context.secrets.get(claveSecreto(info.id))) ||
      '';
    if (!usada) {
      this.error(t(idioma, 'aiKeyRequired'));
      return;
    }

    this.info(t(idioma, 'aiTesting'));
    const cts = new vscode.CancellationTokenSource();
    try {
      const texto = await enviarProveedor(
        {
          proveedor: info,
          modelo: nombreModelo,
          urlBase: base,
          clave: usada,
        },
        CLAVE_PROMPT_PRUEBA,
        cts.token,
        64,
      );
      this.info(
        t(idioma, 'aiTestOk', { texto: texto.replace(/\s+/g, ' ').trim().slice(0, 120) }),
      );
    } catch (e) {
      this.error(t(idioma, 'aiTestFail', { error: mensajeDeError(e) }));
    } finally {
      cts.dispose();
    }
  }

  private mensajeSinModelo(motivo: string | undefined, idioma: string): string {
    if (motivo === 'copilot-deshabilitado') return t(idioma, 'aiNoModelDisabled');
    if (motivo === 'sin-sesion') return t(idioma, 'aiNoModelNoSession');
    if (motivo === 'sin-clave') return t(idioma, 'aiKeyRequired');
    return t(idioma, 'aiNoModel');
  }

  private async enviarEstado(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
    const proveedor = buscarProveedor(cfg.get<string>('proveedorIA', 'vscode')).id;

    const claves: string[] = [];
    for (const p of PROVEEDORES) {
      if (p.id === 'vscode') continue;
      if (await this.context.secrets.get(claveSecreto(p.id))) claves.push(p.id);
    }

    const state: IaConfigState = {
      proveedor,
      modelo: cfg.get<string>('modeloApi', ''),
      urlBase: cfg.get<string>('urlBaseIA', ''),
      tieneClave: claves.includes(proveedor),
      claves,
      idiomaUi: contextoIdioma(),
    };
    this.post({ type: 'iaState', state });
  }

  private info(message: string): void {
    this.post({ type: 'iaInfo', message });
  }

  private error(message: string): void {
    this.post({ type: 'iaError', message });
  }

  private post(msg: Parameters<vscode.Webview['postMessage']>[0]): void {
    void this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'ia.js'),
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
  <title>${t(contextoIdioma(), 'aiConfigTitle')}</title>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="${iconUri}" alt="" />
        <div class="brand-text">
          <h1 data-i18n="aiConfigTitle">Configurar IA</h1>
          <div class="folder" data-i18n="aiConfigSubtitle">Usa tu propia clave de OpenAI, Anthropic o Google, o los modelos de VS Code.</div>
        </div>
      </div>
    </header>

    <main class="config-wrap">
      <form id="formIa" class="config-form" autocomplete="off">
        <label class="field">
          <span data-i18n="aiProvider">Proveedor</span>
          <select id="selProveedor"></select>
        </label>

        <label class="field">
          <span data-i18n="aiApiModel">Modelo</span>
          <input id="txtModelo" type="text" list="modelosSugeridos" data-i18n-placeholder="aiApiModelPlaceholder" placeholder="Nombre del modelo" />
          <datalist id="modelosSugeridos"></datalist>
        </label>

        <label class="field">
          <span data-i18n="aiBaseUrl">URL base</span>
          <input id="txtUrlBase" type="text" spellcheck="false" data-i18n-placeholder="aiBaseUrlPlaceholder" placeholder="Vacío = URL oficial del proveedor" />
        </label>

        <label class="field">
          <span data-i18n="aiApiKey">Clave API</span>
          <input id="txtClave" type="password" spellcheck="false" data-i18n-placeholder="aiApiKeyPlaceholder" placeholder="Pega aquí tu clave API" />
        </label>

        <div class="config-actions">
          <button id="btnGuardar" class="primary" type="submit" data-i18n="aiSaveConfig">Guardar</button>
          <button id="btnProbar" class="secondary" type="button" data-i18n="aiTestConnection">Probar</button>
          <button id="btnBorrar" class="secondary" type="button" data-i18n="aiDeleteKey">Borrar clave</button>
          <button id="btnObtener" class="link" type="button" data-i18n="aiGetKey">Obtener clave</button>
        </div>

        <p id="notaClave" class="config-note" data-i18n="aiKeyHint">La clave se guarda cifrada en VS Code (SecretStorage) y nunca se muestra ni se envía a la interfaz.</p>
        <p id="notaVscode" class="config-note" data-i18n="aiProviderVscode">Los modelos de VS Code (Copilot) no necesitan clave API.</p>
      </form>

      <div id="mensaje" class="config-message" role="status"></div>
    </main>
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
