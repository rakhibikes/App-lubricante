import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' permite servir la app desde cualquier carpeta (Cloudflare Pages o una vista previa).
export default defineConfig({
  plugins: [react()],
  base: './',
})
