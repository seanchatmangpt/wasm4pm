// Stubs for Nuxt auto-imports used in composables/components under test
import { ref, readonly, computed, watch, onMounted, onUnmounted } from 'vue'

export { ref, readonly, computed, watch, onMounted, onUnmounted }

export const useRoute = () => ({ path: '/', query: {}, params: {} })
export const useRouter = (): { replace: ReturnType<typeof vi.fn>, push: ReturnType<typeof vi.fn> } => ({ replace: vi.fn(), push: vi.fn() })
export const useColorMode = () => ({ value: 'light', preference: 'light' })
export const useHead: ReturnType<typeof vi.fn> = vi.fn()
export const useSeoMeta: ReturnType<typeof vi.fn> = vi.fn()
export const defineNuxtPlugin = (fn: any) => fn
export const defineNuxtComponent = (opts: any) => opts
export const useNuxtApp = () => ({ $fetch: globalThis.$fetch })
export const useAsyncData = vi.fn(async (_key: string, fn: () => any) => ({ data: ref(await fn()), error: ref(null) }))
export const useEventListener: ReturnType<typeof vi.fn> = vi.fn()

// $fetch global stub — override in tests via vi.mocked($fetch)
globalThis.$fetch = vi.fn().mockResolvedValue('') as any
