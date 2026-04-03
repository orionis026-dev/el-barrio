import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // `three` sigue pesando más que el umbral por defecto de Vite, pero ya está
    // aislado en su propio chunk y cargado aparte del código principal de UI.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/three/')) {
            return 'three-core'
          }

          if (
            id.includes('/troika-three-text/') ||
            id.includes('/troika-worker-utils/') ||
            id.includes('/webgl-sdf-generator/') ||
            id.includes('/bidi-js/')
          ) {
            return 'text-vendor'
          }

          if (
            id.includes('/@react-three/') ||
            id.includes('/its-fine/') ||
            id.includes('/react-use-measure/') ||
            id.includes('/suspend-react/')
          ) {
            return 'r3f-vendor'
          }

          if (
            id.includes('/@react-spring/') ||
            id.includes('/@use-gesture/') ||
            id.includes('/@react-three/drei/') ||
            id.includes('/three-stdlib/') ||
            id.includes('/maath/') ||
            id.includes('/meshline/') ||
            id.includes('/camera-controls/') ||
            id.includes('/stats-gl/') ||
            id.includes('/three-mesh-bvh/') ||
            id.includes('/react-composer/') ||
            id.includes('/tunnel-rat/')
          ) {
            return 'drei-vendor'
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/react-reconciler/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('/zustand/') || id.includes('/use-sync-external-store/')) {
            return 'state-vendor'
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    // Proxy: todas las llamadas a /api van al backend sin CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '')
      }
    }
  }
})
