import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globIgnores: ['**/assets/sprites/FirstBoss.png'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/sprites\/FirstBoss\.png/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Danmakrew',
        short_name: 'Danma',
        description: 'Danmakrew - NoMercyGames',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          {
            src: '/vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pixi.js') || id.includes('@pixi')) {
              return 'vendor-pixi';
            }
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('react') || id.includes('scheduler')) {
              return 'vendor-react';
            }
          }
          if (
            id.includes('World1SpaceDirector') ||
            id.includes('World2SpaceDirector') ||
            id.includes('World3SpaceDirector') ||
            id.includes('StageDirectorRenderer')
          ) {
            return 'game-worlds';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/docs': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/signal': {
        target: 'ws://localhost:9001',
        ws: true,
        changeOrigin: true,
      },
      '/game': {
        target: 'ws://localhost:9001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: true,
    // En Docker, el backend es alcanzable por el nombre del servicio "api"
    proxy: {
      '/api': {
        target: 'http://api:8080',
        changeOrigin: true,
        secure: false,
      },
      '/docs': {
        target: 'http://api:8080',
        changeOrigin: true,
        secure: false,
      },
      '/signal': {
        target: 'ws://api:9001',
        ws: true,
        changeOrigin: true,
      },
      '/game': {
        target: 'ws://api:9001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})