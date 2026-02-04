import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permite exponer el servidor en la red
    port: 8080,
    allowedHosts: true
  },
  build: {
    outDir: 'build',
    chunkSizeWarningLimit: 1600
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  }
});