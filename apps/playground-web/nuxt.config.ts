import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/content',
    '@vueuse/nuxt'
  ],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  content: {
    build: {
      markdown: {
        highlight: {
          theme: { default: 'github-light', dark: 'github-dark', light: 'github-light' },
          langs: ['typescript', 'javascript', 'json', 'xml', 'bash', 'vue']
        }
      }
    }
  },

  vite: {
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: { exclude: ['wasm4pm'] },
    esbuild: { target: 'esnext' },
    build: { target: 'esnext' }
  },

  alias: {
    'wasm4pm': fileURLToPath(new URL('./public/wasm4pm.js', import.meta.url))
  },

  routeRules: {
    '/': { redirect: '/learn/tutorials/getting-started' },
    '/api/**': { cors: true },
    '/wasm4pm_bg.wasm': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' }
    }
  },

  compatibilityDate: '2024-07-11',

  eslint: {
    config: {
      stylistic: { commaDangle: 'never', braceStyle: '1tbs' }
    }
  }
})
