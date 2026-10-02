/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // a new deploy takes over on the next load
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Starbook',
        short_name: 'Starbook',
        description: 'Track the starred, Bib Gourmand and guide restaurants you have visited, and find them near you.',
        theme_color: '#b3122a',
        background_color: '#faf7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; the 5 MB restaurant file is not (it changes monthly).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Firestore code is only for signed-in users; cache it when first fetched, not up front.
        globIgnores: ['**/db-*.js'],
        navigateFallbackDenylist: [/^\/__\//], // Firebase's reserved /__/auth/* sign-in handler
        runtimeCaching: [
          {
            // Open instantly (and offline) from the last copy, refresh in the background.
            urlPattern: ({ url }) => url.pathname === '/data/restaurants.json',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'restaurant-data', expiration: { maxEntries: 1 } },
          },
          {
            // Hashed build files never change, so a cached copy is always correct.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'lazy-assets', expiration: { maxEntries: 20 } },
          },
        ],
        // Map tiles are deliberately not cached here: OpenStreetMap's tile policy discourages
        // app-managed tile caches, so they stay in the browser's ordinary HTTP cache.
      },
    }),
  ],
  test: {
    // Rules tests need the Firestore emulator; they run via `npm run test:rules`.
    exclude: ['**/node_modules/**', 'tests/rules/**'],
  },
})
