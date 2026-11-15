import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // When this version was built (shown on the Me page)
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Handyman',
        short_name: 'Handyman',
        description: 'Jobs, punch lists, parts and time for a small handyman business.',
        theme_color: '#0F2A23',
        background_color: '#ECEFF2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Remove files from old versions so they can't be served again
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The app's server answers these itself
        navigateFallbackDenylist: [/^\/api\//],
        // Emergency alerts (web push)
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
