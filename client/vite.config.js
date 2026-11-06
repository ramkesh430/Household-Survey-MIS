import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../shared', import.meta.url));
const apiProxy = { '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:4000', changeOrigin: true } };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'घरधुरी सर्वेक्षण प्रणाली',
        short_name: 'घरधुरी सर्वेक्षण',
        description: 'अनुसूची १ घरधुरी सर्वेक्षण — अफलाइनमा पनि चल्ने तथ्यांक संकलन प्रणाली',
        lang: 'ne',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell + Nepali fonts are precached so the app opens with no network
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // API responses are NOT cached by the service worker: data lives in IndexedDB (src/offline)
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@shared': shared } },
  server: { port: 5173, fs: { allow: ['..'] }, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
