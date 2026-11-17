# Changelog

Todos los cambios importantes de la extensión se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [0.6.0] - 2026-11-17

### Cambiado

- Logos actualizados: el de la interfaz se usa en la cabecera, en la pestaña de
  todos los paneles (editor, comparar, detección y configuración de IA) y como
  único icono del botón de la barra de título al editar un `.lang`; la página
  principal y la ficha del Marketplace mantienen su propio logo.
- Altura de fila por defecto de la tabla: de 26 a 27 px.
- README y ficha del Marketplace en español, portugués de Brasil e inglés, en
  ese orden, con selector de idioma, descripción completa y las funciones antes
  del uso.
- Descripción de la extensión ampliada con búsqueda y filtro, traducción y
  revisión con IA, sincronización es_ES/es_MX y resaltado de sintaxis.
- Títulos de comandos y descripciones de ajustes traducidos al español, portugués
  de Brasil e inglés (`package.nls`). El español es el idioma base y se muestra
  por defecto; el inglés y el portugués se usan según el idioma de VS Code.
- Orden de los idiomas de la interfaz: español, portugués de Brasil e inglés.

## [0.5.0] - 2026-11-14

### Añadido

- Desplegable **Modelo IA** en la barra de herramientas: permite elegir entre
  todos los modelos que ofrece VS Code (ChatGPT/OpenAI, Claude/Anthropic,
  Gemini/Google, etc. según el proveedor instalado) o dejar **Automático**.
  La elección se guarda en `minecraftLangEditor.modeloIA` y se conserva entre
  sesiones.
- Botón **Configurar IA** junto a «Revisar con IA»: permite usar tu propia clave
  de OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini) o cualquier API
  compatible con OpenAI. Incluye proveedor, modelo, URL base, prueba de conexión
  y borrado de clave. La clave se guarda cifrada en `SecretStorage` y nunca se
  envía a la interfaz.

### Cambiado

- README y ficha del Marketplace centrados en funciones y uso: se retiraron las
  instrucciones de desarrollo, tests, empaquetado y publicación.
- Las instrucciones técnicas se movieron a `DEVELOPMENT.md`, excluido del VSIX.
- La tabla ya no recorta los textos largos: la clave, el original y el valor se
  envuelven en varias líneas y el campo «Nuevo» crece con el contenido.
- El icono de la extensión se usa en la cabecera y en la pestaña de todos los
  paneles (editor, comparar, detección y configuración de IA).

### Corregido

- El borrador persistente ya no se restaura cuando los cambios se deshicieron
  hasta el último estado guardado.
- Los cambios que llegan desde la IA, la herencia o la importación también se
  guardan en el borrador persistente, junto con los estados y las claves
  importadas.
- Guardar y los diálogos usan el idioma de la interfaz; cancelar la
  sobrescritura vuelve a habilitar el botón Guardar.
- La IA avisa cuando algún lote falló y la comparación muestra los errores de
  lectura de archivos.
- `languages.json` vacío ya no hace perder los códigos existentes; los códigos
  de idioma se aceptan en mayúsculas/minúsculas y se normalizan a `ll_CC`.
- La detección de textos ignora expresiones regulares y rutas absolutas sin
  descartar comandos como `/say hello`.
- Al abrir un `.lang` se selecciona su idioma como origen o destino, y la
  detección distingue «sin editor» de «todas las claves ya existen».
- Si no hay modelo de IA, el aviso ahora distingue si Copilot Chat está
  deshabilitado o si falta iniciar sesión en GitHub, y ofrece abrir la vista
  Extensiones o iniciar sesión en lugar de solo mostrar el error.

## [0.4.0] - 2026-11-09

### Añadido

- **Comparar carpetas texts** (A actual / B anterior) con altas, bajas, claves
  cambiadas y detalle por clave.
- **Detección de textos traducibles** en `.lang`, `.json` y scripts, con
  importación de los textos seleccionados al editor.
- **Glosario** editable (`original = equivalencia1 | equivalencia2`).
- **Nombres propios**: detección y adición al glosario para conservarlos sin
  traducir.
- **Traducción y revisión con IA** mediante `vscode.lm`, con glosario, nombres
  propios y validación de marcadores de formato.
- **Borrador persistente** de los cambios sin guardar.
- Opciones de interfaz: `fontSize`, `rowHeight` e `idiomaUi` (es/en/pt-BR).
- Comandos y atajos `Ctrl+Alt+C/T/G/N/I/R`.

### Cambiado

- El panel principal incorpora una barra de herramientas con las funciones
  nuevas.
- El README y la ficha de la extensión reflejan la versión 0.4.0.

## [0.2.0] - 2026-11-07

### Añadido

- **Heredar versión anterior**: compara el origen actual con una copia anterior
  del pack y trae las traducciones del destino anterior.
- Estados por fila: heredada, por revisar (el inglés cambió), nueva y vacía.
- Filtro **Solo nuevas/por revisar** y contador de pendientes.
- **Deshacer/rehacer** con `Ctrl+Z`, `Ctrl+Y` y `Ctrl+Shift+Z`, más botones en
  la barra de herramientas.
- Botón **Recargar** para volver a leer los archivos del disco.
- El idioma hermano español solo se sincroniza si ya existe (`es_ES` ↔ `es_MX`).
- Icono, metadatos de Marketplace y scripts de publicación.

### Cambiado

- Atajos sin conflicto con VS Code:
  - Copiar original: `Alt+D` (antes `Ctrl+D` / `F4`).
  - Siguiente sin traducir: `Alt+N` (antes `F3`).
  - Heredar versión anterior: `Alt+H`.
  - Elegir carpeta: `Alt+O`.
- Abrir carpeta usa el explorador del sistema.

### Corregido

- Al abrir un `.lang` de la misma carpeta ya cargada no se pierden los cambios
  sin guardar.
- Al pedir un destino personalizado se confirma el descarte después de escribir
  el código, no antes.

## [0.1.0] - 2026-11-07

### Añadido

- Primera versión de la extensión.
- Tabla `Clave | Original | Nuevo` con búsqueda y filtro **Solo sin traducir**.
- Lectura/escritura fiel de `.lang`: comentarios, orden, líneas vacías, UTF-8
  sin BOM y CRLF.
- Copias de seguridad rotativas y actualización de `languages.json`.
- Copiar original con propagación a duplicados y salto a la siguiente clave.
- Catálogo de idiomas, colores por familia de claves y resaltado de sintaxis.
