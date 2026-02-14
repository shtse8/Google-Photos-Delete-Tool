/**
 * Build script that runs separate Vite builds for each Chrome extension entry.
 * Chrome MV3 content scripts don't support ES module imports,
 * so each entry must be self-contained.
 */
import { build } from 'vite';
import { resolve } from 'path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'fs';

const root = resolve(import.meta.dir, '..');
const outDir = resolve(root, 'dist/extension');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));

// Entries to build as self-contained IIFE bundles
const entries = [
  { name: 'content', input: 'src/extension/content.ts' },
  { name: 'background', input: 'src/extension/background.ts' },
  { name: 'popup', input: 'src/extension/popup/popup.ts' },
];

// Build each entry
for (const entry of entries) {
  console.log(`Building ${entry.name}...`);
  await build({
    configFile: false,
    root,
    build: {
      outDir,
      emptyOutDir: entry === entries[0], // only first clears
      target: 'es2022',
      lib: {
        entry: resolve(root, entry.input),
        formats: ['iife'],
        name: `__gpdt_${entry.name}`,
        fileName: () => `${entry.name}.js`,
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          assetFileNames: entry.name === 'popup' ? 'popup.[ext]' : '[name].[ext]',
        },
      },
      minify: true,
    },
  });
}

console.log('Copying assets...');

// Manifest with version from package.json
const manifest = JSON.parse(
  readFileSync(resolve(root, 'src/extension/manifest.json'), 'utf-8'),
);
manifest.version = pkg.version;
writeFileSync(
  resolve(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);

// popup.html
writeFileSync(
  resolve(outDir, 'popup.html'),
  readFileSync(resolve(root, 'src/extension/popup/popup.html'), 'utf-8'),
);

// Icons
const iconsOut = resolve(outDir, 'icons');
mkdirSync(iconsOut, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const name = `icon-${size}.png`;
  const src = resolve(root, `src/extension/icons/${name}`);
  if (existsSync(src)) {
    copyFileSync(src, resolve(iconsOut, name));
  }
}

// Fix CSS filename (Vite lib mode uses package name by default)
const wrongCss = resolve(outDir, 'google-photos-delete-tool.css');
const correctCss = resolve(outDir, 'popup.css');
if (existsSync(wrongCss) && !existsSync(correctCss)) {
  const { renameSync } = await import('fs');
  renameSync(wrongCss, correctCss);
}

console.log('✅ Extension build complete → dist/extension/');
