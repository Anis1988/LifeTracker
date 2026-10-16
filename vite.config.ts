import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative paths: the site works at https://<you>.github.io/LifeTracker/ (GitHub Pages) or on any other host.
export default defineConfig({
  base: './',
  plugins: [react()],
  // Two pages: the app (index.html) and "My apps" (apps.html, all the owner's apps on one page).
  build: { outDir: 'build', rollupOptions: { input: { main: 'index.html', apps: 'apps.html' } } },
});
