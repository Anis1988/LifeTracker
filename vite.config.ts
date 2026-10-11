import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative paths: the site works at https://<you>.github.io/LifeTracker/ (GitHub Pages) or on any other host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'build' },
});
