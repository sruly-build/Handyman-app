import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Jewish calendar library is most of the bundle; one file is fine for a preview
  build: { chunkSizeWarningLimit: 800 },
})
