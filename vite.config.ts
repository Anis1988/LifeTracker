import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative paths: the site works at https://<you>.github.io/LifeTracker/ (GitHub Pages) or on any other host.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Two pages: the app (index.html) and "My apps" (apps.html, all the owner's apps on one page).
  build: {
    outDir: 'build',
    rollupOptions: {
      input: { main: 'index.html', apps: 'apps.html' },
      // pdf.js's worker (small pictures of PDF receipts) is an .mjs file: saved as .js so every server (and the Android app) sends it as JavaScript.
      output: { assetFileNames: (a) => ((a.names?.[0] ?? a.name ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') },
    },
  },
});
