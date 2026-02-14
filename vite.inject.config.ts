import { resolve } from 'path';
import { defineConfig } from 'vite';

/**
 * Vite config for the standalone injection script.
 * Builds a single IIFE bundle that can be pasted into the browser console.
 */
export default defineConfig({
  build: {
    outDir: 'dist/standalone',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'src/standalone/inject.ts'),
      formats: ['iife'],
      name: 'GooglePhotosDeleteTool',
      fileName: () => 'inject.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: false, // Keep readable for console paste
  },
});
