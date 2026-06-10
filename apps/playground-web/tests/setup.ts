// Global test setup
import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// Register Nuxt UI stubs so DOM queries work (UButton → <button>, etc.)
// Nuxt UI components are auto-imported in production but not in plain vitest.
// These minimal stubs render slot content with the correct native element.
config.global.stubs = {
  UButton: { props: ['loading', 'disabled'], template: '<button v-bind="$attrs" :disabled="loading || disabled || null" :aria-busy="loading ? true : undefined" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  UBadge: { template: '<span v-bind="$attrs"><slot /></span>' },
  UInput: { template: '<input v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)" />', props: ['modelValue'], emits: ['update:modelValue'] },
  UTextarea: { template: '<textarea v-bind="$attrs" @input="$emit(\'update:modelValue\', $event.target.value)">{{ modelValue }}</textarea>', props: ['modelValue'], emits: ['update:modelValue'] },
  USelect: { template: '<select v-bind="$attrs"><slot /></select>' },
  UAlert: { props: ['description', 'title'], template: '<div role="alert" v-bind="$attrs">{{ title }}{{ description }}<slot /><slot name="title" /></div>' },
  UCard: { template: '<div v-bind="$attrs"><slot /><slot name="header" /><slot name="footer" /></div>' },
  UTabs: { template: '<div v-bind="$attrs"><slot /></div>' },
  USeparator: { template: '<hr />' },
  UIcon: { template: '<span v-bind="$attrs" />' },
  ReceiptViewer: { props: ['receipt'], template: '<div v-if="receipt"><span>run_id</span><span>{{ receipt.run_id }}</span><span>output_hash</span><span>{{ receipt.output_hash }}</span></div>' },
  ProcessGraph: { props: ['data'], template: '<div />' },
}

// localStorage mock
const localStorageStore: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStorageStore[k] ?? null,
  setItem: (k: string, v: string) => { localStorageStore[k] = v },
  removeItem: (k: string) => { delete localStorageStore[k] },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
})

// crypto.subtle.digest mock — returns predictable hash bytes
vi.stubGlobal('crypto', {
  subtle: {
    digest: async (_algo: string, data: ArrayBuffer) => {
      const view = new Uint8Array(data)
      const hash = new Uint8Array(32)
      for (let i = 0; i < view.length && i < 32; i++) hash[i] = view[i] ^ 0xab
      return hash.buffer
    }
  },
  randomUUID: () => '00000000-0000-0000-0000-000000000001',
  getRandomValues: (arr: Uint8Array) => { arr.fill(1); return arr }
})

// performance.now stub
vi.stubGlobal('performance', { now: vi.fn(() => 1000) })

// $fetch global — tests override per-suite
vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(''))
