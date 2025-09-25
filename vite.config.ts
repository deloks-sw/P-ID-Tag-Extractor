import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ command }) => {
    const base = command === 'serve' ? '/' : '/P-ID-Tag-Extractor/';
    return {
      base,
      plugins: [
        react(),
        visualizer({
          filename: 'dist/stats.html',
          open: false
        })
      ],
      define: {
        global: 'globalThis',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: '0.0.0.0',  // Listen on all network interfaces
        port: 3001,       // Changed to port 3001 as you requested
        proxy: {
          // OpenAI API doesn't need proxy - it supports CORS
          // Keeping this for potential future use
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: ['react', 'react-dom'],
              pdfjs: ['pdfjs-dist'],
              xlsx: ['xlsx']
            }
          }
        }
      },
      optimizeDeps: {
        include: ['pdfjs-dist', 'xlsx', 'uuid']
      },
      worker: {
        format: 'es'
      },
      assetsInclude: ['**/*.pdf']
    };
});
