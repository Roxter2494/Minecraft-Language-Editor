import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

const extension = await esbuild.context({
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});

const webview = await esbuild.context({
  ...common,
  entryPoints: ['media/main.ts', 'media/comparar.ts', 'media/deteccion.ts', 'media/ia.ts'],
  outdir: 'media',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
});

if (watch) {
  await Promise.all([extension.watch(), webview.watch()]);
  console.log('[watch] esperando cambios…');
} else {
  await Promise.all([extension.rebuild(), webview.rebuild()]);
  await Promise.all([extension.dispose(), webview.dispose()]);
  console.log(production ? 'Build de producción listo.' : 'Build listo.');
}
