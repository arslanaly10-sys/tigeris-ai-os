// Builds the read-only snapshot as one self-contained HTML file: apps/web/dist-snapshot/index.html.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: fileURLToPath(new URL('./snapshot', import.meta.url)),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./dist-snapshot', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
});
