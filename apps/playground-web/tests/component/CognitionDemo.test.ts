import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import CognitionDemo from '../../app/components/content/CognitionDemo.vue'

// ---------------------------------------------------------------------------
// Globals setup
// ---------------------------------------------------------------------------
// Stub crypto so useReceipt.saveReceipt works without real SubtleCrypto
const FAKE_HASH_BUF = new Uint8Array(32).fill(0xab).buffer

beforeEach(() => {
  vi.stubGlobal('crypto', {
    subtle: { digest: vi.fn().mockResolvedValue(FAKE_HASH_BUF) },
    randomUUID: () => '550e8400-e29b-41d4-a716-446655440000',
  })

  // Stub localStorage for useReceipt persistence
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
  })

  // Default $fetch response: successful cognition call
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
    output: { diagnosis: 'strep_infection', antibiotic: 'penicillin' },
    output_hash: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
    run_id: 'run-mock-001',
  }))
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CognitionDemo', () => {
  // 1. renders breed name as badge
  it('renders breed name as a badge', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    expect(wrapper.text()).toContain('mycin')
  })

  it('renders custom breed name when prop differs from default', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'eliza' },
    })
    expect(wrapper.text()).toContain('eliza')
  })

  // 2. renders JSON editor (UTextarea) for contract input
  it('renders a textarea containing the preset contract JSON', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    const value = textarea.element.value
    expect(() => JSON.parse(value)).not.toThrow()
    const parsed = JSON.parse(value)
    expect(parsed).toHaveProperty('breed', 'mycin')
    expect(parsed).toHaveProperty('contract')
  })

  // 3. Run button present
  it('has a Run button', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))
    expect(runButton).toBeDefined()
    expect(runButton!.exists()).toBe(true)
  })

  // 4. shows loading state during run
  it('shows loading state on the Run button while running', async () => {
    // Make $fetch hang indefinitely so running.value stays true
    let resolveFetch!: (v: unknown) => void
    const pendingFetch = new Promise(r => { resolveFetch = r })
    vi.stubGlobal('$fetch', () => pendingFetch)

    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))!

    await runButton.trigger('click')
    await wrapper.vm.$nextTick()

    // Nuxt UI UButton sets disabled when :loading is true
    const anyDisabledOrBusy = wrapper.find('[aria-busy="true"], button[disabled]').exists()
      || runButton.attributes('disabled') !== undefined
      || runButton.attributes('aria-busy') !== undefined
    expect(anyDisabledOrBusy).toBe(true)

    // Resolve to avoid unhandled rejection in teardown
    resolveFetch({ output: {}, output_hash: 'abc', run_id: 'x' })
  })

  // 5. result area hidden before first run
  it('does not render the result area before any run', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(false)
  })

  // 6. after run shows output JSON
  it('displays output JSON after a successful run', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))!

    await runButton.trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('strep_infection')
    expect(pre.text()).toContain('penicillin')
  })

  // 7. receipt hash displayed after run (ReceiptViewer shows output_hash label)
  it('displays receipt hash after a successful run', async () => {
    const wrapper = await mountSuspended(CognitionDemo, {
      props: { breed: 'mycin' },
    })
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))!

    await runButton.trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    // ReceiptViewer renders the output_hash and run_id field labels
    expect(text).toContain('output_hash')
    expect(text).toContain('run_id')
  })
})
