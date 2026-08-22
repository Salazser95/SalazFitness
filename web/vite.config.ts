import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BACKEND = process.env.SALAZ_BACKEND ?? 'http://127.0.0.1:8000'

// Rutas que sirve el backend de wger y que el frontend consume tal cual.
// /api tiene CORS abierto, pero /allauth no, asi que se proxean las dos.
const proxied = ['/api', '/allauth', '/media', '/static']

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'SalazFitness',
        short_name: 'SalazFitness',
        description: 'Entrenamiento, nutricion y coste de la compra',
        theme_color: '#0A0E1A',
        background_color: '#0A0E1A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Nunca cachear la API: los datos de entrenamiento tienen que ser frescos.
        navigateFallbackDenylist: [/^\/api/, /^\/allauth/, /^\/media/, /^\/static/],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // host:true permite abrir la app desde el movil en la misma red Wi-Fi
    host: true,
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((path) => [path, { target: BACKEND, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
