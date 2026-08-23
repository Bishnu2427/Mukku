import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Every backend path the SPA talks to. Proxied in dev so the auth cookie
// (httpOnly, SameSite=Lax) is treated as same-origin exactly as in production.
const BACKEND = 'http://127.0.0.1:7000'
const PROXIED = [
  '/api',
  '/generate',
  '/status',
  '/video',
  '/thumbnail',
  '/projects',
  '/enquiry',
  '/health',
  '/static',
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      PROXIED.map((p) => [p, { target: BACKEND, changeOrigin: false }]),
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
