import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ganti 'bites-kiosk' dengan nama repo GitHub Anda
export default defineConfig({
  plugins: [react()],
  base: '/bites-kiosk/',
})
