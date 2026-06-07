import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2015',
      cssMinify: 'lightningcss',
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: {
          chrome: 109 << 16,
          edge: 109 << 16
        }
      }
    },
    server: {
      proxy: {
        '/api': 'http://localhost:8080',
        '/downloads': 'http://localhost:8080',
        '/ws': {
          target: 'ws://localhost:8080',
          ws: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
