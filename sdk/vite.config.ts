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
        similarity: resolve(__dirname, 'src/similarity.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['viem', 'node:fs/promises', 'node:path'],
    },
    /// Library output stays unminified: consumers minify their own bundles,
    /// and minified single-letter identifiers collide with downstream
    /// auto-imports (Nuxt rewrote our `h` to Vue's `createVNode`, which then
    /// failed `BigInt(h)` in `CANONICAL_COLOR_MASK`).
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
})
