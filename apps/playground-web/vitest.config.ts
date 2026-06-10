import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('./app', import.meta.url))
const stubs = fileURLToPath(new URL('./tests/__stubs__/nuxt-app.ts', import.meta.url))
const wasmStub = fileURLToPath(new URL('./tests/__stubs__/wasm4pm.ts', import.meta.url))

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
      'wasm4pm': wasmStub,
      '#app': stubs,
      '#imports': stubs,
    }
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.ts'],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  }
})
