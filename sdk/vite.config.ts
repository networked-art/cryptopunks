import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        offline: resolve(__dirname, 'src/offline.ts'),
        'offline-data': resolve(__dirname, 'src/offline-data.ts'),
        'offline-pixel-data': resolve(__dirname, 'src/offline-pixel-data.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['viem', 'node:fs/promises', 'node:path'],
    },
    sourcemap: true,
    target: 'es2022',
  },
})
