# Minecraft Bedrock Language Editor

[Español](#español) · [Português (Brasil)](#português-brasil) · [English](#english)

---

## Español

Editor de archivos `.lang` de **Minecraft Bedrock** con tabla origen/destino,
búsqueda y filtro, herencia de versiones, comparación de carpetas, detección de
textos, traducción y revisión con IA, glosario, nombres propios, borrador
persistente, backups con rotación, `languages.json`, sincronización `es_ES` ↔
`es_MX`, resaltado de sintaxis y colores por familia de claves.

### Funciones

Esta es la **versión 0.6.0**. Incluye:

- Abrir una carpeta `texts` (o la raíz del pack; entra solo en `texts`).
- Selector de idioma **origen** (solo códigos con archivo `.lang`).
- Selector de idioma **destino** (catálogo completo, marca `(nuevo)` y permite
  escribir un código `ll_CC` personalizado).
- Tabla editable con búsqueda, filtro **Solo sin traducir** y contador.
- `= Copiar` (botón o `Alt+D`): copia el original y propaga a las claves
  vacías con el mismo texto original.
- `Alt+N`: salta a la siguiente clave sin traducir.
- `Ctrl+S`: guarda y exporta.
- `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`): deshacer y rehacer.
- `Alt+H`: heredar desde una versión anterior.
- `Alt+O`: elegir carpeta `texts`.
- Conserva **comentarios, líneas vacías y orden** del origen.
- Escribe **UTF-8 sin BOM** y **CRLF**.
- Copias de seguridad `.bak_yyyyMMdd_HHmmss_fff_xxxxxxxx` y rotación.
- Actualiza `texts/languages.json` (solo códigos, ordenados y sin duplicados).
- Sincroniza el idioma hermano español (`es_ES` ↔ `es_MX`) **solo si ya existe**.
- **Heredar versión anterior**: compara el `en_US` actual con el de una carpeta
  anterior y trae las traducciones del destino anterior. Marca las claves
  heredadas, las que hay que revisar porque cambió el inglés, las nuevas y las
  obsoletas. Filtro **Solo nuevas/por revisar**.
- **Comparar carpetas texts**: carpeta A (actual) frente a B (anterior), con
  altas, bajas, claves cambiadas y detalle por clave.
- **Detectar textos traducibles** en `.lang`, catálogos `.json` y cadenas de
  scripts (`.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`), con importación de los
  textos seleccionados al editor.
- **Glosario** de terminología (`original = equivalencia1 | equivalencia2`) y
  **nombres propios** detectados para conservarlos sin traducir.
- **Traducción y revisión con IA** usando los modelos de VS Code
  (`vscode.lm`, p. ej. GitHub Copilot Chat), con glosario y nombres propios como
  contexto y validación de marcadores (`%s`, `%1$d`, `§a`, `{0}`…).
- **Borrador persistente**: si cierras VS Code con cambios sin guardar, al
  volver a abrir la misma sesión puedes restaurarlos. El borrador se descarta
  automáticamente al guardar o al deshacer hasta el último estado guardado.
- Opciones de interfaz: tamaño de fuente, alto de fila e idioma de la interfaz
  (español, portugués de Brasil e inglés). Puedes cambiar el idioma en
  Ajustes → `minecraftLangEditor.idiomaUi`. Los títulos de comandos y las
  descripciones de ajustes usan el español por defecto y cambian a inglés o
  portugués según el idioma de VS Code.
- Colores por familia de claves.
- Resaltado de sintaxis básico para `.lang` en el editor de texto.

### Uso

1. Abre la paleta de comandos (`Ctrl+Shift+P`).
2. Ejecuta **Minecraft Bedrock Language Editor: Abrir editor .lang**.
3. Pulsa **Elegir carpeta** y selecciona la carpeta `texts` del resource pack
   (o la raíz del pack).
4. Elige idioma origen y destino.
5. Traduce en la columna **Nuevo** y pulsa **Guardar** (`Ctrl+S`).

Para actualizar desde una versión anterior del pack: pulsa **Heredar versión
anterior** y elige la carpeta que contiene el `en_US.lang` y el `es_ES.lang`
antiguos. Las traducciones se cargan en la tabla (aún sin guardar), se marcan
las claves a revisar y puedes filtrarlas con **Solo nuevas/por revisar**.

También puedes abrir el editor desde el botón del logo en la barra de título al
editar cualquier archivo `.lang`.

#### Comparar carpetas

Ejecuta **Comparar dos carpetas texts** (`Ctrl+Alt+C`) y elige la carpeta A
(versión actual) y la B (versión anterior). La tabla muestra los archivos con
altas, bajas y claves cambiadas; al seleccionar uno se ve el detalle clave por
clave.

#### Detectar textos

Ejecuta **Detectar textos traducibles** (`Ctrl+Alt+T`), elige la carpeta del
pack y revisa las cadenas encontradas en `.lang`, `.json` y scripts. Marca las
que quieras y pulsa **Importar al editor**: se añaden como claves nuevas del
origen actual para que las traduzcas y guardes con `Ctrl+S`.

#### Glosario, nombres propios e IA

- **Glosario** (`Ctrl+Alt+G`) abre un archivo de texto con el formato
  `original = equivalencia1 | equivalencia2`. La IA lo usa como contexto; nunca
  sustituye texto por sí solo.
- **Nombres propios** (`Ctrl+Alt+N`) detecta nombres en el origen y permite
  añadirlos al glosario para conservarlos sin traducir.
- **Traducir con IA** (`Ctrl+Alt+I`) y **Revisar con IA** (`Ctrl+Alt+R`) usan
  los modelos disponibles en VS Code (`vscode.lm`). Necesitas una extensión que
  aporte modelos, como GitHub Copilot Chat; según tu plan aparecerán modelos de
  OpenAI (ChatGPT), Anthropic (Claude) y Google (Gemini). El desplegable
  **Modelo IA** permite elegir uno concreto o dejar **Automático**. Las propuestas
  se cargan en la tabla sin guardar; revísalas y pulsa `Ctrl+S`.
- **Configurar IA** permite usar tu propia clave de OpenAI, Anthropic o Google
  (o cualquier API compatible con OpenAI) sin depender de Copilot. Elige el
  proveedor, el modelo y la URL base si hace falta, pega la clave y pulsa
  **Probar** para comprobar la conexión. La clave se guarda cifrada en el
  almacén seguro de VS Code (`SecretStorage`) y nunca se muestra en la interfaz.

### Atajos

| Acción | Atajo |
| --- | --- |
| Guardar | `Ctrl+S` |
| Deshacer | `Ctrl+Z` |
| Rehacer | `Ctrl+Y` o `Ctrl+Shift+Z` |
| Buscar | `Ctrl+F` |
| Copiar original | `Alt+D` |
| Siguiente sin traducir | `Alt+N` |
| Heredar versión anterior | `Alt+H` |
| Elegir carpeta | `Alt+O` |
| Comparar carpetas | `Ctrl+Alt+C` |
| Detectar textos | `Ctrl+Alt+T` |
| Glosario | `Ctrl+Alt+G` |
| Nombres propios | `Ctrl+Alt+N` |
| Traducir con IA | `Ctrl+Alt+I` |
| Revisar con IA | `Ctrl+Alt+R` |
| Salir de la celda | `Esc` |

### Licencia

GPL-3.0-or-later. Consulta el archivo `LICENSE` incluido en el paquete.
Copyright (C) 2026 Roxter.

---

## Português (Brasil)

Editor de arquivos `.lang` do **Minecraft Bedrock** com tabela origem/destino,
pesquisa e filtro, herança de versões, comparação de pastas, detecção de textos,
tradução e revisão com IA, glossário, nomes próprios, rascunho persistente,
backups com rotação, `languages.json`, sincronização `es_ES` ↔ `es_MX`,
destaque de sintaxe e cores por família de chaves.

### Recursos

Esta é a **versão 0.6.0**. Inclui:

- Abrir uma pasta `texts` (ou a raiz do pacote; entra automaticamente em
  `texts`).
- Seletor de idioma **origem** (apenas códigos que têm arquivo `.lang`).
- Seletor de idioma **destino** (catálogo completo, marca `(novo)` e permite
  digitar um código `ll_CC` personalizado).
- Tabela editável com pesquisa, filtro **Somente sem tradução** e contador.
- `= Copiar` (botão ou `Alt+D`): copia o original e propaga para as chaves
  vazias com o mesmo texto original.
- `Alt+N`: pula para a próxima chave sem tradução.
- `Ctrl+S`: salva e exporta.
- `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`): desfazer e refazer.
- `Alt+H`: herdar de uma versão anterior.
- `Alt+O`: escolher a pasta `texts`.
- Preserva **comentários, linhas vazias e ordem** da origem.
- Grava **UTF-8 sem BOM** e **CRLF**.
- Cópias de segurança `.bak_yyyyMMdd_HHmmss_fff_xxxxxxxx` e rotação.
- Atualiza `texts/languages.json` (apenas códigos, ordenados e sem duplicados).
- Sincroniza o idioma irmão espanhol (`es_ES` ↔ `es_MX`) **somente se ele já
  existir**.
- **Herdar versão anterior**: compara o `en_US` atual com o de uma pasta anterior
  e traz as traduções do destino anterior. Marca as chaves herdadas, as que
  precisam de revisão porque o inglês mudou, as novas e as obsoletas. Filtro
  **Somente novas/para revisar**.
- **Comparar pastas texts**: pasta A (atual) contra B (anterior), com inclusões,
  exclusões, chaves alteradas e detalhe por chave.
- **Detectar textos traduzíveis** em `.lang`, catálogos `.json` e strings de
  scripts (`.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`), com importação dos
  textos selecionados para o editor.
- **Glossário** de terminologia (`original = equivalência1 | equivalência2`) e
  **nomes próprios** detectados para mantê-los sem tradução.
- **Tradução e revisão com IA** usando os modelos do VS Code (`vscode.lm`, por
  exemplo GitHub Copilot Chat), com glossário e nomes próprios como contexto e
  validação de marcadores (`%s`, `%1$d`, `§a`, `{0}`…).
- **Rascunho persistente**: se você fechar o VS Code com alterações não salvas,
  ao abrir a mesma sessão novamente poderá restaurá-las. O rascunho é descartado
  automaticamente ao salvar ou ao desfazer até o último estado salvo.
- Opções de interface: tamanho da fonte, altura da linha e idioma da interface
  (espanhol, português do Brasil e inglês). Você pode alterar o idioma em
  Configurações → `minecraftLangEditor.idiomaUi`. Os títulos de comandos e as
  descrições das configurações usam o espanhol por padrão e mudam para inglês ou
  português conforme o idioma do VS Code.
- Cores por família de chaves.
- Destaque de sintaxe básico para `.lang` no editor de texto.

### Uso

1. Abra a paleta de comandos (`Ctrl+Shift+P`).
2. Execute **Minecraft Bedrock Language Editor: Abrir editor .lang**.
3. Clique em **Escolher pasta** e selecione a pasta `texts` do pacote de
   recursos (ou a raiz do pacote).
4. Escolha o idioma de origem e o de destino.
5. Traduza na coluna **Novo** e clique em **Salvar** (`Ctrl+S`).

Para atualizar a partir de uma versão anterior do pacote: clique em **Herdar
versão anterior** e escolha a pasta que contém o `en_US.lang` e o `es_ES.lang`
antigos. As traduções são carregadas na tabela (ainda sem salvar), as chaves que
precisam de revisão são marcadas e você pode filtrá-las com **Somente
novas/para revisar**.

Você também pode abrir o editor pelo botão do logo na barra de título ao editar
qualquer arquivo `.lang`.

#### Comparar pastas

Execute **Comparar duas pastas texts** (`Ctrl+Alt+C`) e escolha a pasta A
(versão atual) e a B (versão anterior). A tabela mostra os arquivos com
inclusões, exclusões e chaves alteradas; ao selecionar um, você vê o detalhe
chave por chave.

#### Detectar textos

Execute **Detectar textos traduzíveis** (`Ctrl+Alt+T`), escolha a pasta do
pacote e revise as strings encontradas em `.lang`, `.json` e scripts. Marque as
que quiser e clique em **Importar para o editor**: elas são adicionadas como
novas chaves da origem atual para você traduzir e salvar com `Ctrl+S`.

#### Glossário, nomes próprios e IA

- **Glossário** (`Ctrl+Alt+G`) abre um arquivo de texto com o formato
  `original = equivalência1 | equivalência2`. A IA o usa como contexto; ele
  nunca substitui texto sozinho.
- **Nomes próprios** (`Ctrl+Alt+N`) detecta nomes na origem e permite
  adicioná-los ao glossário para mantê-los sem tradução.
- **Traduzir com IA** (`Ctrl+Alt+I`) e **Revisar com IA** (`Ctrl+Alt+R`) usam os
  modelos disponíveis no VS Code (`vscode.lm`). Você precisa de uma extensão que
  forneça modelos, como o GitHub Copilot Chat; dependendo do seu plano,
  aparecerão modelos da OpenAI (ChatGPT), Anthropic (Claude) e Google (Gemini).
  O menu **Modelo IA** permite escolher um específico ou deixar **Automático**.
  As sugestões são carregadas na tabela sem salvar; revise-as e pressione
  `Ctrl+S`.
- **Configurar IA** permite usar sua própria chave da OpenAI, Anthropic ou Google
  (ou qualquer API compatível com OpenAI) sem depender do Copilot. Escolha o
  provedor, o modelo e a URL base se necessário, cole a chave e clique em
  **Testar** para verificar a conexão. A chave é armazenada criptografada no
  armazenamento seguro do VS Code (`SecretStorage`) e nunca é mostrada na
  interface.

### Atalhos

| Ação | Atalho |
| --- | --- |
| Salvar | `Ctrl+S` |
| Desfazer | `Ctrl+Z` |
| Refazer | `Ctrl+Y` ou `Ctrl+Shift+Z` |
| Pesquisar | `Ctrl+F` |
| Copiar original | `Alt+D` |
| Próxima sem tradução | `Alt+N` |
| Herdar versão anterior | `Alt+H` |
| Escolher pasta | `Alt+O` |
| Comparar pastas | `Ctrl+Alt+C` |
| Detectar textos | `Ctrl+Alt+T` |
| Glossário | `Ctrl+Alt+G` |
| Nomes próprios | `Ctrl+Alt+N` |
| Traduzir com IA | `Ctrl+Alt+I` |
| Revisar com IA | `Ctrl+Alt+R` |
| Sair da célula | `Esc` |

### Licença

GPL-3.0-or-later. Consulte o arquivo `LICENSE` incluído no pacote.
Copyright (C) 2026 Roxter.

---

## English

Editor for **Minecraft Bedrock** `.lang` files with a source/target table,
search and filter, version inheritance, folder comparison, text detection, AI
translation and review, glossary, proper names, persistent draft, backups with
rotation, `languages.json`, `es_ES` ↔ `es_MX` sync, syntax highlighting and
key-family colors.

### Features

This is version **0.6.0**. It includes:

- Open a `texts` folder (or the pack root; it enters `texts` automatically).
- **Source** language selector (only codes that have a `.lang` file).
- **Target** language selector (full catalog, marks `(new)` and allows a custom
  `ll_CC` code).
- Editable table with search, **Only untranslated** filter and a counter.
- `= Copy` (button or `Alt+D`): copies the original and propagates it to empty
  keys with the same original text.
- `Alt+N`: jumps to the next untranslated key.
- `Ctrl+S`: saves and exports.
- `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`): undo and redo.
- `Alt+H`: inherit from a previous version.
- `Alt+O`: choose the `texts` folder.
- Preserves **comments, blank lines and order** from the source.
- Writes **UTF-8 without BOM** and **CRLF**.
- Backups `.bak_yyyyMMdd_HHmmss_fff_xxxxxxxx` and rotation.
- Updates `texts/languages.json` (codes only, sorted and without duplicates).
- Syncs the Spanish sibling language (`es_ES` ↔ `es_MX`) **only if it already
  exists**.
- **Inherit previous version**: compares the current `en_US` with a previous
  folder and brings the previous target translations. Marks inherited keys,
  keys to review because the English changed, new keys and obsolete keys.
  Filter **Only new/to review**.
- **Compare texts folders**: folder A (current) vs. B (previous), with additions,
  removals, changed keys and per-key details.
- **Detect translatable texts** in `.lang`, `.json` catalogs and script strings
  (`.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`), with import of the selected
  texts into the editor.
- **Glossary** of terminology (`original = equivalence1 | equivalence2`) and
  **proper names** detected to keep them untranslated.
- **AI translation and review** using VS Code models (`vscode.lm`, e.g. GitHub
  Copilot Chat), with the glossary and proper names as context and validation
  of format placeholders (`%s`, `%1$d`, `§a`, `{0}`, etc.).
- **Persistent draft**: if you close VS Code with unsaved changes, you can
  restore them when you reopen the same session. The draft is discarded
  automatically when you save or undo back to the last saved state.
- Interface options: font size, row height and interface language (Spanish,
  Brazilian Portuguese and English). You can change the language in Settings →
  `minecraftLangEditor.idiomaUi`. Command titles and setting descriptions default
  to Spanish and switch to English or Portuguese with VS Code's display language.
- Colors by key family.
- Basic syntax highlighting for `.lang` in the text editor.

### Usage

1. Open the Command Palette (`Ctrl+Shift+P`).
2. Run **Minecraft Bedrock Language Editor: Open .lang editor**.
3. Click **Choose folder** and select the resource pack's `texts` folder (or
   the pack root).
4. Choose the source and target languages.
5. Translate in the **New** column and click **Save** (`Ctrl+S`).

To update from a previous version of the pack: click **Inherit previous
version** and choose the folder that contains the old `en_US.lang` and
`es_ES.lang`. The translations are loaded into the table (still unsaved), the
keys to review are marked, and you can filter them with **Only new/to review**.

You can also open the editor from the logo button in the title bar when editing
any `.lang` file.

#### Compare folders

Run **Compare two texts folders** (`Ctrl+Alt+C`) and choose folder A (current
version) and B (previous version). The table shows the files with additions,
removals and changed keys; selecting one shows the per-key details.

#### Detect texts

Run **Detect translatable texts** (`Ctrl+Alt+T`), choose the pack folder and
review the strings found in `.lang`, `.json` and scripts. Check the ones you
want and click **Import into editor**: they are added as new keys to the current
source so you can translate them and save with `Ctrl+S`.

#### Glossary, proper names and AI

- **Glossary** (`Ctrl+Alt+G`) opens a text file with the format
  `original = equivalence1 | equivalence2`. The AI uses it as context; it never
  replaces text on its own.
- **Proper names** (`Ctrl+Alt+N`) detects names in the source and lets you add
  them to the glossary so they are kept untranslated.
- **Translate with AI** (`Ctrl+Alt+I`) and **Review with AI** (`Ctrl+Alt+R`) use
  the models available in VS Code (`vscode.lm`). You need an extension that
  provides models, such as GitHub Copilot Chat; depending on your plan, models
  from OpenAI (ChatGPT), Anthropic (Claude) and Google (Gemini) will appear. The
  **AI Model** dropdown lets you choose a specific one or leave **Automatic**.
  Suggestions are loaded into the table without saving; review them and press
  `Ctrl+S`.
- **Configure AI** lets you use your own OpenAI, Anthropic or Google key (or any
  OpenAI-compatible API) without depending on Copilot. Choose the provider, the
  model and the base URL if needed, paste the key and click **Test** to check the
  connection. The key is stored encrypted in VS Code's secure store
  (`SecretStorage`) and is never shown in the interface.

### Shortcuts

| Action | Shortcut |
| --- | --- |
| Save | `Ctrl+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` or `Ctrl+Shift+Z` |
| Search | `Ctrl+F` |
| Copy original | `Alt+D` |
| Next untranslated | `Alt+N` |
| Inherit previous version | `Alt+H` |
| Choose folder | `Alt+O` |
| Compare folders | `Ctrl+Alt+C` |
| Detect texts | `Ctrl+Alt+T` |
| Glossary | `Ctrl+Alt+G` |
| Proper names | `Ctrl+Alt+N` |
| Translate with AI | `Ctrl+Alt+I` |
| Review with AI | `Ctrl+Alt+R` |
| Leave the cell | `Esc` |

### License

GPL-3.0-or-later. See the `LICENSE` file included in the package.
Copyright (C) 2026 Roxter.
