import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The calendar and database libraries are most of the bundle; one file loads fine
  build: { chunkSizeWarningLimit: 1200 },
})
