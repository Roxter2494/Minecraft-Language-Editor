# Desarrollo

Instrucciones para compilar, probar, empaquetar y publicar la extensión
**Minecraft Bedrock Language Editor**. Este archivo no forma parte del VSIX.

## Requisitos

- VS Code 1.90 o superior.
- Node.js 20 o superior (probado con Node 24).
- npm.

## Compilar

```powershell
cd minecraft-lang-editor-vscode
npm install
npm run compile
```

Para depurar: abre esta carpeta en VS Code y pulsa **F5** (configuración
`Ejecutar extensión`). Se abre una ventana de VS Code con la extensión cargada.

Para recompilar mientras desarrollas:

```powershell
npm run watch
```

## Tests

```powershell
npm test
```

## Empaquetar el .vsix

```powershell
npm run package
```

Genera `minecraft-bedrock-language-editor-0.6.0.vsix`, que se instala con:

```powershell
code --install-extension minecraft-bedrock-language-editor-0.6.0.vsix
```

## Publicar en el Marketplace

1. Crea una cuenta en <https://marketplace.visualstudio.com/manage> y una
   organización de publisher. El identificador debe coincidir con
   `publisher` en `package.json` (ahora `Roxter`).
2. Crea un **Personal Access Token** (PAT) en Azure DevOps con el permiso
   **Marketplace → Manage** y cópialo.
3. Inicia sesión una vez:

   ```powershell
   npx.cmd vsce login Roxter
   ```

4. Publica:

   ```powershell
   npm.cmd run publish
   ```

   Para subir la versión automáticamente: `npm.cmd run publish:patch`,
   `npm.cmd run publish:minor` o `npm.cmd run publish:major`.

Si cambias de publisher, actualiza también `publisher`, `homepage`, `bugs` y
`repository` en `package.json`. El repositorio es opcional para publicar, pero
mejora la ficha del Marketplace.

## Localización del manifiesto

La interfaz de las webviews se traduce con `src/core/i18n.ts` y el ajuste
`minecraftLangEditor.idiomaUi`. Los textos que pinta VS Code directamente
(paleta de comandos, ajustes, valores de enum) se traducen con archivos NLS:

- `package.nls.json`: español (idioma base y por defecto).
- `package.nls.en.json`: inglés.
- `package.nls.pt-br.json`: portugués de Brasil.

En `package.json` los textos visibles se escriben como `%clave%`, por ejemplo
`"title": "%command.open%"`. VS Code elige el archivo según su propio idioma de
interfaz, no según `idiomaUi`; si no hay archivo para ese idioma usa
`package.nls.json`, así que el español es el que se muestra por defecto. Al
añadir o cambiar una clave hay que actualizar los tres archivos y mantener las
mismas claves.

## Estructura

```
src/
  core/            Núcleo (lectura/escritura, idiomas, colores, comparación,
                   detección, glosario, nombres propios e i18n)
  panel.ts         Panel webview y flujo de guardado
  compararPanel.ts Panel de comparación de carpetas
  deteccionPanel.ts Panel de detección de textos
  iaPanel.ts       Panel «Configurar IA» (proveedor y clave API)
  ia.ts            Orquestación de IA (vscode.lm y proveedores externos)
  iaHttp.ts        Peticiones HTTP a proveedores externos
  extension.ts     Activación y comandos
media/
  main.ts          Lógica de la interfaz (tabla, filtros, atajos)
  comparar.ts      Interfaz de comparación de carpetas
  deteccion.ts     Interfaz de detección de textos
  ia.ts            Interfaz de «Configurar IA»
  style.css        Estilos basados en el tema de VS Code
test/              Tests del núcleo (vitest)
syntaxes/          Gramática TextMate para .lang
```
