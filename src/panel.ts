import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  actualizarLanguagesJson,
  crearBackupObligatorio,
  detectarCodigos,
  diccionarioDe,
  escribir,
  leer,
  limpiarBackups,
} from './core/langFileIo';
import {
  CATALOGO,
  catalogoDestino,
  esCodigoValido,
  hermanoEspanol,
  normalizarCodigo,
} from './core/langLocales';
import { heredarTraducciones, resumenHerencia } from './core/herencia';
import { normalizarCarpeta } from './core/rutas';
import { normalizarIdiomaUi, t } from './core/i18n';
import { detectarNombresPropios } from './core/nombresPropios';
import {
  agregarEntrada,
  contextoGlosario,
  parseGlosario,
  serializarGlosario,
  type EntradaGlosario,
} from './core/glosario';
import { diagnosticarModelo, ejecutarIA, leerConfiguracionIa, listarModelos } from './ia';
import { buscarProveedor } from './core/proveedoresIa';
import type {
  ArchivoLang,
  EditorState,
  EstadoHerencia,
  ExtensionToWebview,
  FilaLang,
  ModeloIa,
  WebviewToExtension,
} from './core/types';

interface Sesion {
  folder: string;
  sourceCode: string;
  targetCode: string;
  origen: ArchivoLang | null;
  traducciones: Map<string, string>;
  /** Estados de la última herencia, para colorear y filtrar la tabla. */
  estados: Map<string, EstadoHerencia>;
}

const ESTADO_CARPETA = 'minecraftLangEditor.folder';
const ESTADO_ORIGEN = 'minecraftLangEditor.sourceCode';
const ESTADO_DESTINO = 'minecraftLangEditor.targetCode';
const CLAVE_BORRADOR = 'minecraftLangEditor.borrador';
const CLAVE_NOMBRES = 'minecraftLangEditor.nombresPropios';

interface Borrador {
  key: string;
  translations: Record<string, string>;
  /** Estados de herencia para conservar los colores al restaurar. */
  estados?: Record<string, EstadoHerencia>;
  /** Claves importadas desde la detección que no están en el .lang del disco. */
  extras?: Array<{ clave: string; texto: string }>;
  savedAt: number;
}

export class LangEditorPanel {
  public static current: LangEditorPanel | undefined;
  private static readonly viewType = 'minecraftLangEditor.panel';

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly sesion: Sesion;
  private dirty = false;
  private borradorPreguntado = false;
  /** Cola para procesar los mensajes de la webview en orden. */
  private cola: Promise<void> = Promise.resolve();
  /** Claves añadidas desde la detección que aún no están en el .lang del disco. */
  private importados: Array<{ clave: string; texto: string }> = [];
  /** Modelos de IA disponibles (caché para no consultarlos en cada estado). */
  private modelosIa: ModeloIa[] = [];

  public static createOrShow(context: vscode.ExtensionContext): LangEditorPanel {
    if (LangEditorPanel.current) {
      LangEditorPanel.current.panel.reveal(vscode.ViewColumn.One);
      return LangEditorPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      LangEditorPanel.viewType,
      'Minecraft Bedrock Language Editor',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon-interface-v5.png');

    LangEditorPanel.current = new LangEditorPanel(panel, context);
    return LangEditorPanel.current;
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.context = context;

    this.sesion = {
      folder: context.globalState.get<string>(ESTADO_CARPETA, ''),
      sourceCode: context.globalState.get<string>(ESTADO_ORIGEN, ''),
      targetCode: context.globalState.get<string>(ESTADO_DESTINO, ''),
      origen: null,
      traducciones: new Map(),
      estados: new Map(),
    };

    // Registrar el receptor antes de cargar el HTML evita perder el «ready».
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtension) => {
        // Serializa los mensajes: guardar, borrador y cambios de idioma no se
        // pisan entre sí aunque lleguen muy seguidos.
        this.cola = this.cola
          .then(() => this.onMessage(msg))
          .catch((e) => this.post({ type: 'error', message: mensajeDeError(e) }));
      },
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(
      () => {
        LangEditorPanel.current = undefined;
        for (const d of this.disposables) d.dispose();
      },
      null,
      this.disposables,
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('minecraftLangEditor')) this.enviarEstado();
      },
      null,
      this.disposables,
    );

    // Al habilitar Copilot Chat o iniciar sesión aparecen modelos nuevos.
    vscode.extensions.onDidChange(() => this.refrescarModelosIa(), null, this.disposables);
    vscode.authentication.onDidChangeSessions(
      () => this.refrescarModelosIa(),
      null,
      this.disposables,
    );

    // Carga inicial (la webview avisará con «ready»; también cargamos aquí).
    this.cargarDesdeDisco();
    this.refrescarModelosIa();
  }

  // -------------------------------------------------------------------------
  // Mensajes de la webview
  // -------------------------------------------------------------------------

  private async onMessage(msg: WebviewToExtension): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
          // Si la webview se recargó, los cambios sin guardar se perdieron.
          this.dirty = false;
          this.actualizarTitulo();
          this.enviarEstado();
          this.refrescarModelosIa();
          void this.ofrecerBorrador();
          break;
        case 'pickFolder':
          await this.elegirCarpeta();
          break;
        case 'changeSource':
          await this.cambiarOrigen(msg.code);
          break;
        case 'changeTarget':
          await this.cambiarDestino(msg.code);
          break;
        case 'customTarget':
          await this.pedirDestinoPersonalizado();
          break;
        case 'save':
          await this.guardar(msg.translations);
          break;
        case 'inheritPrevious':
          await this.heredarVersionAnterior();
          break;
        case 'reload':
          await this.recargarDesdeDisco();
          break;
        case 'openFolder':
          await this.abrirCarpeta();
          break;
        case 'draft':
          await this.guardarBorrador(msg.translations);
          break;
        case 'clearDraft':
          await this.limpiarBorrador();
          break;
        case 'compareFolders':
          await vscode.commands.executeCommand(
            'minecraftLangEditor.compareFolders',
            this.sesion.folder,
          );
          break;
        case 'detectTexts':
          await vscode.commands.executeCommand(
            'minecraftLangEditor.detectTexts',
            this.sesion.folder,
          );
          break;
        case 'editGlossary':
          await this.editarGlosario();
          break;
        case 'reviewNames':
          await this.revisarNombresPropios();
          break;
        case 'translateAI':
          await this.traducirConIa();
          break;
        case 'reviewAI':
          await this.revisarConIa();
          break;
        case 'configureAI':
          await vscode.commands.executeCommand('minecraftLangEditor.configureAI');
          break;
        case 'setModel':
          await this.cambiarModeloIa(msg.id);
          break;
        case 'dirty':
          this.dirty = msg.dirty;
          this.actualizarTitulo();
          break;
        default:
          break;
      }
    } catch (e) {
      this.post({ type: 'error', message: mensajeDeError(e) });
    }
  }

  /** Carpeta texts actualmente cargada en el editor. */
  public carpeta(): string {
    return this.sesion.folder;
  }

  public async elegirCarpeta(): Promise<void> {
    const sel = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t(this.idiomaUi(), 'chooseTextsFolder'),
      defaultUri: this.sesion.folder ? vscode.Uri.file(this.sesion.folder) : undefined,
    });
    if (!sel || sel.length === 0) return;
    if (!(await this.confirmarDescartar())) return;

    const folder = normalizarCarpeta(sel[0].fsPath);
    this.sesion.folder = folder;
    this.sesion.sourceCode = '';
    this.sesion.targetCode = '';
    this.borradorPreguntado = false;
    await this.limpiarBorrador();
    await this.persistir();
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
  }

  /** Abre el editor apuntando a la carpeta de un .lang (o a su subcarpeta texts). */
  public async abrirEnCarpeta(folder: string, code?: string): Promise<void> {
    const normalizada = normalizarCarpeta(folder);
    const codigo = normalizarCodigo(code);
    // Misma carpeta y mismo idioma: no recargar ni reenviar estado, para no
    // perder ediciones sin guardar.
    if (
      normalizada === this.sesion.folder &&
      (!codigo || codigo === this.sesion.sourceCode || codigo === this.sesion.targetCode)
    ) {
      return;
    }
    if (!this.dirty && normalizada === this.sesion.folder && codigo) {
      // Cambiar solo el idioma activo no requiere descartar nada.
      await this.aplicarCodigoActivo(codigo);
      return;
    }
    if (!(await this.confirmarDescartar())) return;

    this.sesion.folder = normalizada;
    this.sesion.sourceCode = '';
    this.sesion.targetCode = '';
    this.borradorPreguntado = false;
    await this.limpiarBorrador();
    if (codigo) this.asignarCodigoActivo(codigo);
    await this.persistir();
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
  }

  /** Aplica el código del .lang abierto como origen (inglés) o destino. */
  private asignarCodigoActivo(code: string): void {
    if (/^en([-_]|$)/i.test(code)) {
      this.sesion.sourceCode = code;
      if (!this.sesion.targetCode) this.sesion.targetCode = 'es_ES';
    } else {
      this.sesion.targetCode = code;
    }
  }

  private async aplicarCodigoActivo(code: string): Promise<void> {
    this.asignarCodigoActivo(code);
    await this.persistir();
    this.cargarDesdeDisco();
    this.enviarEstado();
  }

  private async cambiarOrigen(code: string): Promise<void> {
    if (!code || code === this.sesion.sourceCode) return;
    if (!(await this.confirmarDescartar())) return;
    this.sesion.sourceCode = code;
    this.borradorPreguntado = false;
    await this.limpiarBorrador();
    await this.persistir();
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
  }

  private async cambiarDestino(code: string): Promise<void> {
    const normalizado = normalizarCodigo(code);
    if (!normalizado || normalizado === this.sesion.targetCode) return;
    if (!(await this.confirmarDescartar())) return;
    this.sesion.targetCode = normalizado;
    this.borradorPreguntado = false;
    await this.limpiarBorrador();
    await this.persistir();
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
  }

  private async pedirDestinoPersonalizado(): Promise<void> {
    const idioma = this.idiomaUi();
    const code = await vscode.window.showInputBox({
      title: t(idioma, 'customTargetTitle'),
      prompt: t(idioma, 'customTargetPrompt'),
      value: this.sesion.targetCode,
      validateInput: (v) => (esCodigoValido(v) ? undefined : t(idioma, 'customTargetInvalid')),
    });
    if (!code) return;
    const limpio = normalizarCodigo(code);
    if (!esCodigoValido(limpio)) return;
    if (limpio === this.sesion.targetCode) return;
    if (!(await this.confirmarDescartar())) return;
    this.sesion.targetCode = limpio;
    this.borradorPreguntado = false;
    await this.limpiarBorrador();
    await this.persistir();
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
  }

  /**
   * Hereda traducciones desde una carpeta con la versión anterior del pack.
   * No escribe nada: carga el resultado en el panel para revisarlo y guardar.
   */
  public async heredarVersionAnterior(): Promise<void> {
    const { folder, origen, sourceCode, targetCode } = this.sesion;
    const idioma = this.idiomaUi();
    if (!folder || !origen || !sourceCode || !targetCode) {
      this.post({ type: 'error', message: t(idioma, 'inheritNeedsSetup') });
      return;
    }

    const sel = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t(idioma, 'inheritPickFolder'),
      title: t(idioma, 'inheritPickTitle', { source: sourceCode, target: targetCode }),
      defaultUri: vscode.Uri.file(folder),
    });
    if (!sel || sel.length === 0) return;

    const vieja = normalizarCarpeta(sel[0].fsPath);
    const rutaViejoOrigen = path.join(vieja, sourceCode + '.lang');
    let rutaViejoDestino = path.join(vieja, targetCode + '.lang');
    let codigoViejoDestino = targetCode;

    if (!fs.existsSync(rutaViejoOrigen)) {
      this.post({
        type: 'error',
        message: t(idioma, 'inheritMissingSource', { source: sourceCode }),
      });
      return;
    }

    // Si el destino anterior no existe, probar con el hermano español.
    if (!fs.existsSync(rutaViejoDestino)) {
      const hermano = hermanoEspanol(targetCode);
      const rutaHermano = hermano ? path.join(vieja, hermano + '.lang') : '';
      if (rutaHermano && fs.existsSync(rutaHermano)) {
        rutaViejoDestino = rutaHermano;
        codigoViejoDestino = hermano;
      }
    }

    if (!fs.existsSync(rutaViejoDestino)) {
      const hermano = hermanoEspanol(targetCode);
      this.post({
        type: 'error',
        message: hermano
          ? t(idioma, 'inheritMissingTargetSibling', { target: targetCode, sibling: hermano })
          : t(idioma, 'inheritMissingTarget', { target: targetCode }),
      });
      return;
    }

    let anteriorOrigen: ArchivoLang;
    let anteriorDestino: ArchivoLang;
    try {
      anteriorOrigen = leer(rutaViejoOrigen);
      anteriorDestino = leer(rutaViejoDestino);
    } catch (e) {
      this.post({
        type: 'error',
        message: t(idioma, 'inheritReadError', { error: mensajeDeError(e) }),
      });
      return;
    }

    const resultado = heredarTraducciones(
      origen,
      anteriorOrigen,
      anteriorDestino,
      this.sesion.traducciones,
    );

    this.sesion.traducciones = resultado.traducciones;
    this.sesion.estados = resultado.estados;
    this.dirty = true;
    this.actualizarTitulo();
    this.enviarEstado();

    const resumen = resumenHerencia(resultado, idioma);
    const origenViejo =
      codigoViejoDestino.toLowerCase() === targetCode.toLowerCase()
        ? ''
        : t(idioma, 'inheritFromSibling', { sibling: codigoViejoDestino });
    this.post({ type: 'info', message: resumen + origenViejo });
    void vscode.window.showInformationMessage(resumen + origenViejo);
  }

  public async recargarDesdeDisco(): Promise<void> {
    if (!(await this.confirmarDescartar())) return;
    this.cargarDesdeDisco();
    this.marcarLimpio();
    this.enviarEstado();
    this.post({ type: 'info', message: t(this.idiomaUi(), 'cargandoArchivos') });
  }

  private async abrirCarpeta(): Promise<void> {
    if (!this.sesion.folder) {
      this.post({ type: 'info', message: t(this.idiomaUi(), 'noFolderYet') });
      return;
    }
    await vscode.env.openExternal(vscode.Uri.file(this.sesion.folder));
  }

  // -------------------------------------------------------------------------
  // Carga y guardado
  // -------------------------------------------------------------------------

  private async persistir(): Promise<void> {
    await this.context.globalState.update(ESTADO_CARPETA, this.sesion.folder);
    await this.context.globalState.update(ESTADO_ORIGEN, this.sesion.sourceCode);
    await this.context.globalState.update(ESTADO_DESTINO, this.sesion.targetCode);
  }

  /** Lee origen y destino del disco, siembra duplicados y deja la sesión lista. */
  private cargarDesdeDisco(): void {
    const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
    const folder = this.sesion.folder;
    const existentes = folder ? detectarCodigos(folder) : [];

    // Origen válido: debe existir un .lang; si no, elegir en_US o el primero.
    let origenCode = this.sesion.sourceCode;
    const existeOrigen = (c: string) =>
      existentes.some((e) => e.toLowerCase() === c.toLowerCase());
    if (!origenCode || !existeOrigen(origenCode)) {
      origenCode =
        existentes.find((c) => c.toLowerCase() === 'en_us') ?? existentes[0] ?? '';
    }
    this.sesion.sourceCode = origenCode;

    // Destino válido: si está vacío, usar la preferencia (es_ES por defecto).
    if (this.sesion.targetCode) {
      this.sesion.targetCode = normalizarCodigo(this.sesion.targetCode);
    }
    if (!this.sesion.targetCode) {
      this.sesion.targetCode = normalizarCodigo(
        cfg.get<string>('idiomaDestino', 'es_ES').trim() || 'es_ES',
      );
    }

    this.sesion.origen = null;
    if (folder && origenCode) {
      const ruta = path.join(folder, origenCode + '.lang');
      try {
        if (fs.existsSync(ruta)) this.sesion.origen = leer(ruta);
      } catch {
        this.sesion.origen = null;
      }
    }

    this.sesion.traducciones = new Map();
    this.sesion.estados = new Map();
    this.importados = [];
    if (folder && this.sesion.targetCode) {
      const ruta = path.join(folder, this.sesion.targetCode + '.lang');
      this.sesion.traducciones = diccionarioDe(ruta);
    }

    this.sembrarDuplicados();
  }

  /**
   * Rellena claves vacías cuyo texto origen coincide con otra ya traducida.
   */
  private sembrarDuplicados(): number {
    const origen = this.sesion.origen;
    if (!origen) return 0;

    const porTexto = new Map<string, string>();
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      const texto = par.texto ?? '';
      if (texto.length === 0) continue;
      const actual = this.sesion.traducciones.get(par.clave);
      if (actual && actual.length > 0 && !porTexto.has(texto)) {
        porTexto.set(texto, actual);
      }
    }
    if (porTexto.size === 0) return 0;

    let sembradas = 0;
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      const texto = par.texto ?? '';
      if (texto.length === 0) continue;
      const actual = this.sesion.traducciones.get(par.clave);
      if (actual && actual.length > 0) continue;
      const valor = porTexto.get(texto);
      if (valor === undefined) continue;
      this.sesion.traducciones.set(par.clave, valor);
      sembradas++;
    }
    return sembradas;
  }

  private construirFilas(): FilaLang[] {
    const origen = this.sesion.origen;
    const rows: FilaLang[] = [];
    if (!origen) return rows;

    const vistos = new Set<string>();
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      if (!par.clave || !par.clave.trim()) continue;
      if (vistos.has(par.clave)) continue;
      vistos.add(par.clave);
      rows.push({
        key: par.clave,
        source: par.texto ?? '',
        value: this.sesion.traducciones.get(par.clave) ?? '',
        estado: this.sesion.estados.get(par.clave),
      });
    }
    return rows;
  }

  private enviarEstado(): void {
    const folder = this.sesion.folder;
    const existentes = folder ? detectarCodigos(folder) : [];
    const origen = this.sesion.origen;
    const rows = this.construirFilas();

    const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
    const state: EditorState = {
      folder,
      sourceCode: this.sesion.sourceCode,
      targetCode: this.sesion.targetCode,
      sourceCodes: existentes,
      existingCodes: existentes,
      languages: catalogoDestino([
        ...existentes,
        ...(this.sesion.targetCode ? [this.sesion.targetCode] : []),
      ]),
      rows,
      canSave: !!origen && !!folder && !!this.sesion.targetCode,
      coloresClaves: cfg.get<boolean>('coloresClaves', true),
      dirty: this.dirty,
      fontSize: Math.max(8, Math.min(40, cfg.get<number>('fontSize', 13))),
      rowHeight: Math.max(18, Math.min(100, cfg.get<number>('rowHeight', 27))),
      idiomaUi: normalizarIdiomaUi(cfg.get<string>('idiomaUi', 'es')),
      modelos: this.modelosIa,
      modeloIa: this.modeloIaConfig(),
      proveedorIa: cfg.get<string>('proveedorIA', 'vscode'),
    };

    this.post({ type: 'state', state });
  }

  private async guardar(translations: Record<string, string>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('minecraftLangEditor');
    const crearBackups = cfg.get<boolean>('crearBackups', true);
    const conservar = Math.max(1, cfg.get<number>('conservarBackups', 10));
    const preguntarHermano = cfg.get<boolean>('preguntarIdiomaHermano', true);
    const idioma = this.idiomaUi();

    const { folder, origen, sourceCode } = this.sesion;
    const targetCode = normalizarCodigo(this.sesion.targetCode);
    if (!origen) {
      this.post({ type: 'error', message: t(idioma, 'saveNoSource') });
      return;
    }
    if (!folder || !targetCode) {
      this.post({ type: 'error', message: t(idioma, 'saveNeedsFolderTarget') });
      return;
    }
    this.sesion.targetCode = targetCode;

    if (targetCode.toLowerCase() === sourceCode.toLowerCase()) {
      const resp = await vscode.window.showWarningMessage(
        t(idioma, 'saveSameLanguage', { target: targetCode }),
        { modal: true },
        t(idioma, 'overwrite'),
        t(idioma, 'cancel'),
      );
      if (resp !== t(idioma, 'overwrite')) {
        // La webview deshabilitó Guardar al pedir el guardado: hay que avisar
        // de que se canceló para que el botón vuelva a estar disponible.
        this.post({ type: 'saved', ok: false, message: t(idioma, 'saveCancelled') });
        return;
      }
    }

    // Mapa final: traducción si no está vacía; si no, texto original de respaldo.
    const final = new Map<string, string>();
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      if (!par.clave || !par.clave.trim()) continue;
      let valor = par.texto ?? '';
      const traducido = translations[par.clave];
      if (traducido !== undefined && traducido !== '') valor = traducido;
      final.set(par.clave, valor);
    }

    const destinoRuta = path.join(folder, targetCode + '.lang');
    let parcial = false;

    try {
      // Nunca sobrescribir si se pidió backup y no pudo crearse.
      if (crearBackups && fs.existsSync(destinoRuta)) {
        crearBackupObligatorio(destinoRuta);
      }

      const res = escribir(destinoRuta, origen, final);
      if (!res.ok) {
        this.post({
          type: 'error',
          message: t(idioma, 'saveWriteError', {
            file: `${targetCode}.lang`,
            error: res.error ?? '',
          }),
        });
        return;
      }
      if (crearBackups) limpiarBackups(destinoRuta, conservar);

      const resLang = actualizarLanguagesJson(folder, targetCode);
      if (!resLang.ok) {
        parcial = true;
        void vscode.window.showWarningMessage(
          t(idioma, 'saveLanguagesJsonError', { error: resLang.error ?? '' }),
        );
      }

      // Idioma hermano español: solo se toca si YA existe en la carpeta.
      // Si no existe, no se pregunta ni se crea (se detecta su ausencia).
      const hermano = hermanoEspanol(targetCode);
      if (hermano && hermano.toLowerCase() !== sourceCode.toLowerCase()) {
        const rutaHermano = path.join(folder, hermano + '.lang');
        if (fs.existsSync(rutaHermano)) {
          let sincronizar = !preguntarHermano;
          if (preguntarHermano) {
            const resp = await vscode.window.showWarningMessage(
              t(idioma, 'saveSiblingPrompt', { sibling: hermano }),
              { modal: true },
              t(idioma, 'update'),
              t(idioma, 'dontUpdate'),
            );
            sincronizar = resp === t(idioma, 'update');
          }

          if (sincronizar) {
            let backupOk = true;
            if (crearBackups) {
              try {
                crearBackupObligatorio(rutaHermano);
              } catch (e) {
                backupOk = false;
                parcial = true;
                void vscode.window.showWarningMessage(
                  t(idioma, 'saveSiblingBackupError', {
                    sibling: hermano,
                    error: mensajeDeError(e),
                  }),
                );
              }
            }

            if (backupOk) {
              const resH = escribir(rutaHermano, origen, final);
              if (!resH.ok) {
                parcial = true;
                void vscode.window.showWarningMessage(
                  t(idioma, 'saveWriteError', {
                    file: `${hermano}.lang`,
                    error: resH.error ?? '',
                  }),
                );
              } else {
                if (crearBackups) limpiarBackups(rutaHermano, conservar);
                const resH2 = actualizarLanguagesJson(folder, hermano);
                if (!resH2.ok) {
                  parcial = true;
                  void vscode.window.showWarningMessage(
                    t(idioma, 'saveSiblingLanguagesJsonError', { error: resH2.error ?? '' }),
                  );
                }
              }
            }
          }
        }
      }
    } catch (e) {
      this.post({ type: 'error', message: t(idioma, 'saveError', { error: mensajeDeError(e) }) });
      return;
    }

    if (parcial) {
      this.post({ type: 'saved', ok: false, message: t(idioma, 'savePartial') });
      return;
    }

    // La UI conserva el mapa del usuario (las claves vacías siguen vacías aunque
    // el archivo tenga el texto original como respaldo), igual que la app original.
    const nuevas = new Map<string, string>();
    for (const par of origen.lineas) {
      if (!par.esPar) continue;
      if (!par.clave || !par.clave.trim()) continue;
      const traducido = translations[par.clave];
      nuevas.set(par.clave, traducido !== undefined && traducido !== '' ? traducido : '');
    }
    this.sesion.traducciones = nuevas;
    this.importados = [];

    this.marcarLimpio();
    await this.limpiarBorrador();
    this.enviarEstado();
    this.post({
      type: 'saved',
      ok: true,
      message: t(idioma, 'saveDone', { target: targetCode, n: final.size }),
    });
  }

  // -------------------------------------------------------------------------
  // Borrador persistente
  // -------------------------------------------------------------------------

  /** Identifica el borrador por carpeta + idiomas, para no mezclar sesiones. */
  private claveBorrador(): string {
    const { folder, sourceCode, targetCode } = this.sesion;
    if (!folder || !sourceCode || !targetCode) return '';
    return `${folder}|${sourceCode}|${targetCode}`;
  }

  private async guardarBorrador(translations: Record<string, string>): Promise<void> {
    const key = this.claveBorrador();
    if (!key) return;
    const borrador: Borrador = {
      key,
      translations,
      estados: Object.fromEntries(this.sesion.estados),
      extras: [...this.importados],
      savedAt: Date.now(),
    };
    await this.context.globalState.update(CLAVE_BORRADOR, borrador);
  }

  private async limpiarBorrador(): Promise<void> {
    await this.context.globalState.update(CLAVE_BORRADOR, undefined);
  }

  /** Ofrece restaurar los cambios sin guardar de la sesión anterior. */
  private async ofrecerBorrador(): Promise<void> {
    if (this.borradorPreguntado) return;
    const guardado = this.context.globalState.get<Borrador>(CLAVE_BORRADOR);
    if (!guardado || guardado.key !== this.claveBorrador()) return;
    this.borradorPreguntado = true;

    const idioma = this.idiomaUi();
    const restaurar = t(idioma, 'borradorRestaurar');
    const descartar = t(idioma, 'borradorDescartar');
    const resp = await vscode.window.showInformationMessage(
      t(idioma, 'borradorPregunta'),
      restaurar,
      descartar,
    );

    if (resp !== restaurar) {
      await this.limpiarBorrador();
      return;
    }

    let aplicadas = 0;
    for (const [clave, valor] of Object.entries(guardado.translations)) {
      if (typeof valor !== 'string') continue;
      this.sesion.traducciones.set(clave, valor);
      aplicadas++;
    }

    // Restaura también las claves importadas desde la detección, que no están
    // en el .lang del disco, y los estados de herencia (colores de la tabla).
    const origen = this.sesion.origen;
    if (origen && Array.isArray(guardado.extras)) {
      const existentes = new Set(
        origen.lineas.filter((l) => l.esPar && l.clave?.trim()).map((l) => l.clave),
      );
      this.importados = [];
      for (const extra of guardado.extras) {
        if (!extra || typeof extra.clave !== 'string' || typeof extra.texto !== 'string') continue;
        const k = extra.clave.trim();
        if (!k) continue;
        this.importados.push({ clave: k, texto: extra.texto });
        if (existentes.has(k)) continue;
        existentes.add(k);
        origen.lineas.push({ esPar: true, clave: k, texto: extra.texto, cruda: '' });
      }
    }
    if (guardado.estados && typeof guardado.estados === 'object') {
      this.sesion.estados = new Map(
        Object.entries(guardado.estados).filter(([, v]) => typeof v === 'string'),
      ) as Map<string, EstadoHerencia>;
    }

    if (aplicadas > 0 || this.importados.length > 0) {
      this.dirty = true;
      this.actualizarTitulo();
      this.enviarEstado();
      this.post({ type: 'info', message: t(idioma, 'borradorTitulo') });
    }
  }

  private idiomaUi(): string {
    return normalizarIdiomaUi(
      vscode.workspace.getConfiguration('minecraftLangEditor').get<string>('idiomaUi', 'es'),
    );
  }

  // -------------------------------------------------------------------------
  // Glosario y nombres propios
  // -------------------------------------------------------------------------

  private rutaGlosario(): string {
    const dir = this.context.globalStorageUri.fsPath;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Si no se puede crear, la escritura fallará y se avisará.
    }
    return path.join(dir, 'glosario.txt');
  }

  private leerGlosario(): EntradaGlosario[] {
    const ruta = this.rutaGlosario();
    try {
      if (!fs.existsSync(ruta)) return [];
      return parseGlosario(fs.readFileSync(ruta, 'utf8'));
    } catch {
      return [];
    }
  }

  private escribirGlosario(entradas: readonly EntradaGlosario[]): void {
    fs.writeFileSync(this.rutaGlosario(), serializarGlosario(entradas), 'utf8');
  }

  /** Abre el glosario como archivo de texto editable. */
  public async editarGlosario(): Promise<void> {
    const idioma = this.idiomaUi();
    const ruta = this.rutaGlosario();
    if (!fs.existsSync(ruta)) {
      const cabecera =
        '# Glosario de Minecraft Bedrock Language Editor\r\n' +
        '# Formato: original = equivalencia1 | equivalencia2\r\n';
      try {
        fs.writeFileSync(ruta, cabecera, 'utf8');
      } catch (e) {
        this.post({
          type: 'error',
          message: t(idioma, 'glossaryWriteError', { error: mensajeDeError(e) }),
        });
        return;
      }
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ruta));
    await vscode.window.showTextDocument(doc, { preview: false });
    this.post({ type: 'info', message: t(idioma, 'glossaryHint') });
  }

  private nombresPropiosGuardados(): string[] {
    return this.context.globalState.get<string[]>(CLAVE_NOMBRES, []);
  }

  /** Detecta nombres propios en el origen y permite añadirlos al glosario. */
  public async revisarNombresPropios(): Promise<void> {
    const idioma = this.idiomaUi();
    const origen = this.sesion.origen;
    if (!origen) {
      this.post({ type: 'error', message: t(idioma, 'noEditor') });
      return;
    }

    const textos = origen.lineas.filter((l) => l.esPar).map((l) => l.texto ?? '');
    const candidatos = detectarNombresPropios(textos);
    const glosario = this.leerGlosario();
    const existentes = new Set(glosario.map((e) => e.original.trim().toLowerCase()));
    const nuevos = candidatos.filter((c) => !existentes.has(c.palabra.toLowerCase()));

    if (nuevos.length === 0) {
      void vscode.window.showInformationMessage(t(idioma, 'namesNone'));
      return;
    }

    const items = nuevos.map((c) => ({
      label: c.palabra,
      description: `${c.ocurrencias}×`,
      detail: c.ejemplos[0] ?? '',
    }));

    const sel = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: t(idioma, 'namesTitle'),
      placeHolder: t(idioma, 'namesPrompt'),
    });
    if (!sel || sel.length === 0) return;

    let entradas = glosario;
    for (const item of sel) entradas = agregarEntrada(entradas, item.label, [item.label]);
    try {
      this.escribirGlosario(entradas);
      const guardados = new Set(this.nombresPropiosGuardados());
      for (const item of sel) guardados.add(item.label);
      await this.context.globalState.update(CLAVE_NOMBRES, [...guardados]);
    } catch (e) {
      this.post({
        type: 'error',
        message: t(idioma, 'glossaryWriteError', { error: mensajeDeError(e) }),
      });
      return;
    }

    void vscode.window.showInformationMessage(
      t(idioma, 'namesAdded', { n: sel.length }),
    );
  }

  // -------------------------------------------------------------------------
  // Traducción y revisión con IA
  // -------------------------------------------------------------------------

  /** Modelo elegido en la configuración; vacío = automático. */
  private modeloIaConfig(): string {
    return vscode.workspace
      .getConfiguration('minecraftLangEditor')
      .get<string>('modeloIA', '')
      .trim();
  }

  /** Relee los modelos disponibles y avisa a la webview si cambió la lista. */
  private refrescarModelosIa(): void {
    void listarModelos().then((modelos) => {
      const antes = JSON.stringify(this.modelosIa);
      const ahora = JSON.stringify(modelos);
      if (antes === ahora) return;
      this.modelosIa = modelos;
      this.enviarEstado();
    });
  }

  /** Guarda el modelo elegido en el desplegable (vacío = automático). */
  private async cambiarModeloIa(id: string): Promise<void> {
    const limpio = (id ?? '').trim();
    await vscode.workspace
      .getConfiguration('minecraftLangEditor')
      .update('modeloIA', limpio, vscode.ConfigurationTarget.Global);
    this.enviarEstado();
  }

  /** Claves presentes en el origen, para no aceptar propuestas inventadas. */
  private clavesOrigen(): Set<string> {
    const claves = new Set<string>();
    for (const par of this.sesion.origen?.lineas ?? []) {
      if (par.esPar && par.clave?.trim()) claves.add(par.clave);
    }
    return claves;
  }

  public async traducirConIa(): Promise<void> {
    const { origen, sourceCode, targetCode } = this.sesion;
    const idioma = this.idiomaUi();
    if (!origen || !targetCode) {
      this.post({ type: 'error', message: t(idioma, 'noEditor') });
      return;
    }

    const filas = this.construirFilas();
    if (filas.length === 0) {
      this.post({ type: 'info', message: t(idioma, 'aiNoPending') });
      return;
    }

    const pendientes = filas.filter((f) => !f.value || !f.value.trim());
    if (pendientes.length === 0) {
      this.post({ type: 'info', message: t(idioma, 'aiNoPending') });
      return;
    }

    let elegidas = pendientes;
    if (filas.length > pendientes.length) {
      const opcion = await vscode.window.showQuickPick(
        [
          {
            label: t(idioma, 'aiPendingScope', { n: pendientes.length }),
            value: 'pending' as const,
          },
          { label: t(idioma, 'aiAllScope', { n: filas.length }), value: 'all' as const },
        ],
        { title: t(idioma, 'aiChooseScope') },
      );
      if (!opcion) return;
      if (opcion.value === 'all') elegidas = filas;
    }

    const entradas = elegidas.map((f) => ({ key: f.key, source: f.source }));
    const glosario = this.leerGlosario();
    const nombres = this.nombresPropiosGuardados();
    const protegidos = [...nombres];

    const res = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t(idioma, 'translateAI'),
        cancellable: true,
      },
      async (progress, token) =>
        ejecutarIA(
          {
            idiomaOrigen: sourceCode,
            idiomaDestino: targetCode,
            entradas,
            glosario: contextoGlosario(glosario),
            nombres,
            protegidos,
            modelo: this.modeloIaConfig(),
          },
          token,
          (p) =>
            progress.report({
              message: t(idioma, 'aiProgress', { done: p.hechos, total: p.total }),
              increment: 100 / Math.max(1, p.total),
            }),
        ),
    );

    if (!res.ok) {
      await this.avisarErrorIa(res.error ?? 'UNKNOWN');
      return;
    }

    const validas = this.clavesOrigen();
    let aplicadas = 0;
    for (const r of res.resultados) {
      if (!validas.has(r.key)) continue;
      this.sesion.traducciones.set(r.key, r.texto);
      aplicadas++;
    }

    if (aplicadas > 0) {
      this.dirty = true;
      this.actualizarTitulo();
      this.enviarEstado();
    }

    let mensaje = t(idioma, 'aiDone', { n: aplicadas });
    if (res.omitidas > 0) mensaje += ' ' + t(idioma, 'aiOmitted', { n: res.omitidas });
    if (res.fallidos > 0) mensaje += ' ' + t(idioma, 'aiPartial', { n: res.fallidos });
    this.post({ type: 'info', message: mensaje });
    void vscode.window.showInformationMessage(mensaje);
  }

  public async revisarConIa(): Promise<void> {
    const { origen, sourceCode, targetCode } = this.sesion;
    const idioma = this.idiomaUi();
    if (!origen || !targetCode) {
      this.post({ type: 'error', message: t(idioma, 'noEditor') });
      return;
    }

    const filas = this.construirFilas().filter((f) => f.value && f.value.trim());
    if (filas.length === 0) {
      this.post({ type: 'info', message: t(idioma, 'aiNoTranslated') });
      return;
    }

    const entradas = filas.map((f) => ({ key: f.key, source: f.source, actual: f.value }));
    const glosario = this.leerGlosario();
    const nombres = this.nombresPropiosGuardados();
    const protegidos = [...nombres];

    const res = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t(idioma, 'reviewAI'),
        cancellable: true,
      },
      async (progress, token) =>
        ejecutarIA(
          {
            idiomaOrigen: sourceCode,
            idiomaDestino: targetCode,
            entradas,
            glosario: contextoGlosario(glosario),
            nombres,
            protegidos,
            revisar: true,
            modelo: this.modeloIaConfig(),
          },
          token,
          (p) =>
            progress.report({
              message: t(idioma, 'aiReviewProgress', { done: p.hechos, total: p.total }),
              increment: 100 / Math.max(1, p.total),
            }),
        ),
    );

    if (!res.ok) {
      await this.avisarErrorIa(res.error ?? 'UNKNOWN');
      return;
    }

    const validas = this.clavesOrigen();
    let aplicadas = 0;
    for (const r of res.resultados) {
      if (!validas.has(r.key)) continue;
      if (r.texto.trim() === '') continue;
      this.sesion.traducciones.set(r.key, r.texto);
      aplicadas++;
    }

    if (aplicadas > 0) {
      this.dirty = true;
      this.actualizarTitulo();
      this.enviarEstado();
    }

    let mensaje = t(idioma, 'aiReviewDone', { n: aplicadas });
    if (res.omitidas > 0) mensaje += ' ' + t(idioma, 'aiOmitted', { n: res.omitidas });
    if (res.fallidos > 0) mensaje += ' ' + t(idioma, 'aiPartial', { n: res.fallidos });
    this.post({ type: 'info', message: mensaje });
    void vscode.window.showInformationMessage(mensaje);
  }

  private async avisarErrorIa(codigo: string): Promise<void> {
    const idioma = this.idiomaUi();

    if (codigo === 'NO_MODEL') {
      await this.ayudarConModeloIa();
      return;
    }

    if (codigo === 'NO_KEY' || codigo === 'NO_URL' || codigo === 'NO_MODEL_NAME') {
      await this.avisarConfigIa(codigo);
      return;
    }

    const mensaje =
      codigo === 'CANCELLED'
        ? t(idioma, 'aiCancelled')
        : codigo.startsWith('NoPermissions') || codigo === 'ConsentRequired'
          ? t(idioma, 'aiNoPermission')
          : t(idioma, 'aiError', { error: codigo });
    this.post({ type: 'error', message: mensaje });
    void vscode.window.showErrorMessage(mensaje);
  }

  /** Falta configuración de IA: ofrece abrir «Configurar IA». */
  private async avisarConfigIa(codigo: string): Promise<void> {
    const idioma = this.idiomaUi();
    const info = buscarProveedor(leerConfiguracionIa().proveedor);
    const mensaje =
      codigo === 'NO_URL'
        ? t(idioma, 'aiBaseUrlRequired')
        : codigo === 'NO_MODEL_NAME'
          ? t(idioma, 'aiModelRequired')
          : t(idioma, 'aiNoKey', { proveedor: info.nombre });
    this.post({ type: 'error', message: mensaje });

    const abrir = t(idioma, 'aiOpenConfig');
    const resp = await vscode.window.showErrorMessage(mensaje, abrir);
    if (resp === abrir) {
      await vscode.commands.executeCommand('minecraftLangEditor.configureAI');
    }
  }

  /**
   * No hay modelos: explica el motivo y ofrece activar Copilot Chat o iniciar
   * sesión en GitHub, en lugar de dejar al usuario sin salida.
   */
  private async ayudarConModeloIa(): Promise<void> {
    const idioma = this.idiomaUi();
    const diag = await diagnosticarModelo();

    if (diag.motivo === 'sin-clave') {
      await this.avisarConfigIa('NO_KEY');
      return;
    }

    const mensaje =
      diag.motivo === 'copilot-deshabilitado'
        ? t(idioma, 'aiNoModelDisabled')
        : diag.motivo === 'sin-sesion'
          ? t(idioma, 'aiNoModelNoSession')
          : t(idioma, 'aiNoModel');
    this.post({ type: 'error', message: mensaje });

    const abrir = t(idioma, 'openExtensions');
    const entrar = t(idioma, 'signIn');
    const acciones = diag.motivo === 'sin-sesion' ? [entrar, abrir] : [abrir];
    const resp = await vscode.window.showErrorMessage(mensaje, ...acciones);

    if (resp === abrir) {
      // Muestra Copilot Chat (incluido si está deshabilitado) en Extensiones.
      await vscode.commands.executeCommand('workbench.extensions.search', '@builtin copilot');
      return;
    }

    if (resp === entrar) {
      try {
        await vscode.authentication.getSession('github', ['copilot'], { createIfNone: true });
      } catch (e) {
        void vscode.window.showWarningMessage(t(idioma, 'aiError', { error: mensajeDeError(e) }));
        return;
      }
      const despues = await diagnosticarModelo();
      void vscode.window.showInformationMessage(
        despues.ok ? t(idioma, 'aiModelReady') : t(idioma, 'aiNoModel'),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Importación desde la detección de textos
  // -------------------------------------------------------------------------

  /**
   * Añade textos detectados como claves nuevas del origen actual.
   * Devuelve cuántas se importaron y si no hay un editor válido abierto.
   */
  public async importarTextos(
    textos: Array<{ clave: string; texto: string }>,
  ): Promise<{ importados: number; sinOrigen: boolean }> {
    const origen = this.sesion.origen;
    if (!origen || !this.sesion.folder) return { importados: 0, sinOrigen: true };

    const existentes = new Set(
      origen.lineas.filter((l) => l.esPar && l.clave?.trim()).map((l) => l.clave),
    );

    let importados = 0;
    for (const { clave, texto } of textos) {
      const k = (clave ?? '').trim();
      if (!k || existentes.has(k)) continue;
      existentes.add(k);
      origen.lineas.push({ esPar: true, clave: k, texto, cruda: '' });
      this.sesion.traducciones.set(k, '');
      this.importados.push({ clave: k, texto });
      importados++;
    }

    if (importados > 0) {
      this.dirty = true;
      this.actualizarTitulo();
      this.enviarEstado();
    }
    return { importados, sinOrigen: false };
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  private async confirmarDescartar(): Promise<boolean> {
    if (!this.dirty) return true;
    const idioma = this.idiomaUi();
    const descartar = t(idioma, 'discard');
    const resp = await vscode.window.showWarningMessage(
      t(idioma, 'unsavedChanges'),
      { modal: true },
      descartar,
      t(idioma, 'cancel'),
    );
    return resp === descartar;
  }

  private marcarLimpio(): void {
    this.dirty = false;
    this.actualizarTitulo();
  }

  private actualizarTitulo(): void {
    this.panel.title = this.dirty ? '● Minecraft Bedrock Language Editor' : 'Minecraft Bedrock Language Editor';
  }

  private post(msg: ExtensionToWebview): void {
    void this.panel.webview.postMessage(msg);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'),
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
  <title>Minecraft Bedrock Language Editor</title>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <img class="logo" src="${iconUri}" alt="" />
        <div class="brand-text">
          <h1>Minecraft Bedrock Language Editor</h1>
          <div id="folder" class="folder" data-i18n="noFolder">Sin carpeta seleccionada</div>
        </div>
      </div>
      <div class="top-actions">
        <button id="btnFolder" class="secondary" data-i18n="chooseFolder" data-i18n-title="chooseFolderTip" title="Elegir carpeta texts (Alt+O)">Elegir carpeta</button>
        <button id="btnHeredar" class="secondary" data-i18n="inherit" data-i18n-title="inheritTip" title="Traer traducciones de una versión anterior del pack (Alt+H)">Heredar versión anterior</button>
        <button id="btnReload" class="secondary" data-i18n="reload" data-i18n-title="reloadTip" title="Volver a leer los archivos del disco">Recargar</button>
        <button id="btnReveal" class="secondary" data-i18n="openFolder" data-i18n-title="openFolderTip" title="Abrir la carpeta en el explorador">Abrir carpeta</button>
        <button id="btnSave" class="primary" data-i18n="save" data-i18n-title="saveTip" title="Guardar y exportar (Ctrl+S)">Guardar</button>
      </div>
    </header>

    <section class="toolbar">
      <label class="field">
        <span data-i18n="source">Origen</span>
        <select id="selOrigen"></select>
      </label>
      <label class="field">
        <span data-i18n="target">Destino</span>
        <select id="selDestino"></select>
      </label>
      <label class="search">
        <span data-i18n="search">Buscar</span>
        <input id="txtBuscar" type="search" data-i18n-placeholder="searchPlaceholder" placeholder="Buscar clave o texto…" autocomplete="off" />
      </label>
      <label class="check">
        <input id="chkSinTraducir" type="checkbox" />
        <span data-i18n="onlyUntranslated">Solo sin traducir</span>
      </label>
      <label class="check">
        <input id="chkRevisar" type="checkbox" />
        <span data-i18n="onlyReview">Solo nuevas/por revisar</span>
      </label>
      <div class="history">
        <button id="btnUndo" class="secondary icon" data-i18n-title="undoTip" title="Deshacer (Ctrl+Z)" disabled>↶</button>
        <button id="btnRedo" class="secondary icon" data-i18n-title="redoTip" title="Rehacer (Ctrl+Y / Ctrl+Shift+Z)" disabled>↷</button>
      </div>
      <div id="contador" class="contador"></div>
    </section>

    <section class="toolbar tools">
      <span class="tools-label" data-i18n="tools">Herramientas</span>
      <button id="btnComparar" class="secondary" data-i18n="compare" data-i18n-title="compareTip" title="Comparar dos carpetas texts (Ctrl+Alt+C)">Comparar carpetas</button>
      <button id="btnDetectar" class="secondary" data-i18n="detect" data-i18n-title="detectTip" title="Buscar textos traducibles (Ctrl+Alt+T)">Detectar textos</button>
      <button id="btnGlosario" class="secondary" data-i18n="glossary" data-i18n-title="glossaryTip" title="Editar el glosario (Ctrl+Alt+G)">Glosario</button>
      <button id="btnNombres" class="secondary" data-i18n="names" data-i18n-title="namesTip" title="Revisar nombres propios (Ctrl+Alt+N)">Nombres propios</button>
      <button id="btnIaTraducir" class="secondary" data-i18n="translateAI" data-i18n-title="translateAITip" title="Traducir con el modelo de VS Code (Ctrl+Alt+I)">Traducir con IA</button>
      <button id="btnIaRevisar" class="secondary" data-i18n="reviewAI" data-i18n-title="reviewAITip" title="Revisar traducciones con el modelo de VS Code (Ctrl+Alt+R)">Revisar con IA</button>
      <button id="btnConfigIa" class="secondary" data-i18n="configureAI" data-i18n-title="configureAITip" title="Elegir el proveedor de IA y tu clave API">Configurar IA</button>
      <label class="modelo">
        <span data-i18n="aiModel">Modelo IA</span>
        <select id="selModelo" data-i18n-title="aiModelTip" title="Modelo de lenguaje para Traducir y Revisar con IA"></select>
      </label>
    </section>

    <main class="table-wrap">
      <table id="tabla">
        <thead>
          <tr>
            <th class="col-key" data-i18n="key">Clave</th>
            <th class="col-source" data-i18n="original">Original</th>
            <th class="col-value" data-i18n="newValue">Nuevo</th>
            <th class="col-copy"></th>
          </tr>
        </thead>
        <tbody id="cuerpo"></tbody>
      </table>
      <div id="vacio" class="vacio" data-i18n="statusChooseFolder">Elige una carpeta <code>texts</code> para empezar.</div>
      <div class="more"><button id="btnMore" class="secondary" data-i18n="showMore">Mostrar más…</button></div>
    </main>

    <footer class="statusbar">
      <span id="estado" data-i18n="statusReady">Listo.</span>
      <span class="hint" data-i18n="hint">Ctrl+S guardar · Alt+N siguiente · Alt+D copiar origen · Alt+H heredar · Ctrl+Z/Y deshacer/rehacer · Ctrl+F buscar</span>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
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

// Re-export para que el catálogo esté disponible si se necesita en el futuro.
export { CATALOGO };
