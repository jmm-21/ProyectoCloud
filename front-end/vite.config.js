import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Permite exponer el servidor en la red
    port: 8080,
    allowedHosts: [
      'proyectocloud-frontend.onrender.com' // Solo el dominio, sin https://
    ]
  },
  build: {
    outDir: 'build',
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  }
});