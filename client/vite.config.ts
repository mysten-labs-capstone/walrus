import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Example on accessing .env var --> const privateKey = import.meta.env.VITE_WALRUS_PRIVATE_KEY
  // 'VITE_' is important as only .env vars prefixed with that, are exposed to client-side code!
  server: {
    port: 3000
  },
})