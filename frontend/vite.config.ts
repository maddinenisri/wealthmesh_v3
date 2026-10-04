import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.WM_BACKEND_URL ?? 'http://127.0.0.1:8081'

// https://vite.dev
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WM_FRONTEND_PORT ?? 5180),
    proxy: { '/api': backend },
  },
  preview: {
    proxy: { '/api': backend },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
  },
})
