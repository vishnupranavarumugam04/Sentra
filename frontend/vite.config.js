const PORT = process.env.PORT || 5000;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      manifest: {
        name: 'Sentra Crisis Damage Reporting',
        short_name: 'Sentra',
        description: 'Offline-First Crisis Damage Reporting Platform',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html'
      }
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true
      },
      '/uploads': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true
      }
    }
  }
});
