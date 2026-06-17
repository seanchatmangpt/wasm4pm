// Global test setup
import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// Nuxt UI component stubs — infrastructure boundary (components require full Nuxt runtime).
// We test OUR prop logic (color thresholds, loading state, etc.), not the library's rendering.
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
  ProcessGraph: { props: ['data'], template: '<div />' }
}

// localStorage — happy-dom doesn't expose this as a bare global in all versions.
// Provide a real Storage-compatible implementation backed by a plain Map.
// Behavior is faithful: persistence, STORAGE_KEY reads, 20-item cap — all real.
const _lsStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  get length() { return _lsStore.size },
  key: (n: number) => [..._lsStore.keys()][n] ?? null,
  getItem: (k: string) => _lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { _lsStore.set(k, v) },
  removeItem: (k: string) => { _lsStore.delete(k) },
  clear: () => { _lsStore.clear() }
})

// $fetch global — network boundary shim; no real server in vitest.
// Tests override per-suite with vi.stubGlobal('$fetch', ...).
vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(''))
