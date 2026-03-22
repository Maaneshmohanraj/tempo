import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // Load .env from project root (one level up from /frontend)
  envDir: path.resolve(__dirname, '..'),
  server: {
    port: 5173,
    // Proxy API calls to the Python backend
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
