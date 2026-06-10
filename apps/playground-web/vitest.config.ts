import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('./app', import.meta.url))
// Real wasm4pm CJS build — auto-initializes via fs.readFileSync at require-time; no browser URL needed.
const wasmPkg = fileURLToPath(new URL('../../wasm4pm/pkg/wasm4pm.js', import.meta.url))
const stubs = fileURLToPath(new URL('./tests/__stubs__/nuxt-app.ts', import.meta.url))

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      imports: ['vue'],
      dts: false,
    }),
  ],
  define: {
    'import.meta.client': JSON.stringify(true),
    'import.meta.server': JSON.stringify(false),
    'import.meta.env.SSR': JSON.stringify(false),
  },
  resolve: {
    alias: {
      '~': app,
      '@': app,
      'wasm4pm': wasmPkg,
      '#app': stubs,
      '#imports': stubs,
    }
  },
  test: {
    environment: 'happy-dom',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/component/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  }
})
