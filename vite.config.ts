import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        options: resolve(__dirname, 'src/options/index.html'),
        dashboard: resolve(__dirname, 'src/dashboard/index.html')
      },
      output: {
        entryFileNames: (asset) => {
          if (asset.name === 'background') return 'background.js'
          return 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  publicDir: 'public'
})
