import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        rootDir: '.',
        domEnvironment: 'happy-dom',
      }
    },
    include: ['tests/unit/**/*.test.ts', 'tests/component/**/*.test.ts'],
    globals: true,
  }
})
