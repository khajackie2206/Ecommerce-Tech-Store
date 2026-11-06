import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Forward every request starting with /api to the NestJS server on port 3000.
    // The browser then sees the web app and the API as the same origin:
    // no CORS setup is needed and auth cookies just work.
    // In Docker, nginx does the same job (see web/nginx.conf).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
