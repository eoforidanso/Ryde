import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo>/, so the build needs a matching
  // base. Local dev and any root-hosted deploy leave it at '/'.
  base: process.env.VITE_BASE ?? '/',
  server: { port: 5178, host: true },
});
