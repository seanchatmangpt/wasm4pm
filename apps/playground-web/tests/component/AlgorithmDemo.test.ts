import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import AlgorithmDemo from '~/components/content/AlgorithmDemo.vue'

// ── useWasm mock ──────────────────────────────────────────────────────────────
const mockRunAlgorithm = vi.fn<() => unknown>(() => ({ nodes: [], edges: [] }))
const mockLoadXes = vi.fn(() => 1)
const mockInit = vi.fn()
const mockReady = ref(true)

vi.mock('~/composables/useWasm', () => ({
  useWasm: () => ({
    ready: mockReady,
    error: ref(null),
    runAlgorithm: mockRunAlgorithm,
    loadXes: mockLoadXes,
    init: mockInit,
  }),
}))

// ── useReceipt mock ───────────────────────────────────────────────────────────
vi.mock('~/composables/useReceipt', () => ({
  useReceipt: () => ({
    saveReceipt: vi.fn(async () => ({
      algorithm: 'simd_streaming_dfg',
      input_hash: 'abc123',
      output_hash: 'def456',
      timestamp: Date.now(),
    })),
  }),
}))

// ── $fetch mock ───────────────────────────────────────────────────────────────
const FAKE_XES = `<?xml version="1.0"?><log><trace><event><string key="concept:name" value="A"/></event></trace></log>`

vi.stubGlobal('$fetch', vi.fn(async () => FAKE_XES))

// ── helpers ───────────────────────────────────────────────────────────────────
async function mountDemo(props: Record<string, unknown> = {}) {
  const wrapper = mount(AlgorithmDemo, { props })
  await flushPromises()
  return wrapper
}

describe('AlgorithmDemo', () => {
  beforeEach(() => {
    mockReady.value = true
    mockRunAlgorithm.mockReset()
    mockRunAlgorithm.mockReturnValue({ nodes: [], edges: [] })
    mockLoadXes.mockReset()
    mockLoadXes.mockReturnValue(1)
    mockInit.mockReset()
    vi.mocked(($fetch as any)).mockReset()
    vi.mocked(($fetch as any)).mockResolvedValue(FAKE_XES as any)
  })

  it('renders algorithm badge with correct algorithm name prop', async () => {
    const wrapper = await mountDemo({ algorithm: 'alpha_miner' })
    expect(wrapper.text()).toContain('alpha_miner')
  })

  it('shows "Loading WASM runtime…" when ready=false', async () => {
    mockReady.value = false
    const wrapper = await mountDemo()
    expect(wrapper.text()).toContain('Loading WASM runtime')
  })

  it('shows Run button', async () => {
    const wrapper = await mountDemo()
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    expect(runBtn).toBeTruthy()
  })

  it('Run button is disabled when ready=false', async () => {
    mockReady.value = false
    const wrapper = await mountDemo()
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    expect(runBtn?.attributes('disabled')).toBeDefined()
  })

  it('clicking Run calls runAlgorithm with correct algorithm name', async () => {
    const wrapper = await mountDemo({ algorithm: 'heuristic_miner' })
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn?.trigger('click')
    expect(mockRunAlgorithm).toHaveBeenCalledWith('heuristic_miner', 1, 'concept:name')
  })

  it('after successful run shows result JSON in pre element', async () => {
    const result = { fitness: 0.95 }
    mockRunAlgorithm.mockReturnValue(result)
    const wrapper = await mountDemo()
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"fitness"')
    expect(pre.text()).toContain('0.95')
  })

  it('after failed run shows error alert', async () => {
    mockRunAlgorithm.mockImplementation(() => { throw new Error('WASM exploded') })
    const wrapper = await mountDemo()
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('WASM exploded')
  })

  it('loads preset XES on mount via $fetch', async () => {
    await mountDemo({ preset: 'small-example' })
    expect(vi.mocked(($fetch as any))).toHaveBeenCalledWith(
      '/samples/small-example.xes',
      expect.objectContaining({ responseType: 'text' }),
    )
  })

  it('"About this algorithm" section shows after successful run if blurb exists', async () => {
    mockRunAlgorithm.mockReturnValue({ fitness: 1.0 })
    const wrapper = await mountDemo({ algorithm: 'alpha_miner' })
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('About this algorithm')
  })

  it('showReceipt=false suppresses receipt tab', async () => {
    mockRunAlgorithm.mockReturnValue({ fitness: 1.0 })
    const wrapper = await mountDemo({ showReceipt: false })
    const buttons = wrapper.findAll('button')
    const runBtn = buttons.find(b => b.text().includes('Run'))
    await runBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Receipt')
  })
})
