import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(
        process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || ''
      ),
      'import.meta.env.VITE_GOOGLE_MAPS_MAP_ID': JSON.stringify(
        process.env.GOOGLE_MAPS_MAP_ID || process.env.VITE_GOOGLE_MAPS_MAP_ID || ''
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        fs: path.resolve(__dirname, 'src/lib/emptyModule.ts'),
        path: path.resolve(__dirname, 'src/lib/emptyModule.ts'),
        crypto: path.resolve(__dirname, 'src/lib/emptyModule.ts'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
