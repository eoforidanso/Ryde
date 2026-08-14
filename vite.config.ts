import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo>/, so the build needs a matching
// base. Local dev and any root-hosted deploy leave it at '/'.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Ryde — Move around Ghana',
        short_name: 'Ryde',
        description:
          'Ride-hailing for Ghana. Okada, Go, Comfort, XL and Aboboya across Greater Accra, paid with mobile money.',
        lang: 'en-GH',
        dir: 'ltr',
        categories: ['travel', 'navigation'],
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        // Matches the app shell so the splash and status bar don't flash.
        background_color: '#06090A',
        theme_color: '#0A0D0C',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: `${base}index.html`,
        // No runtimeCaching for the payments API on purpose: balances, fares
        // and charge status must never be served from a cache. Those requests
        // go straight to the network and fail loudly when offline.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        // Keep the service worker out of the way during development.
        enabled: false,
      },
    }),
  ],
  server: { port: 5178, host: true },
});
