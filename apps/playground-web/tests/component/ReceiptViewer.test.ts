import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ReceiptViewer from '../../app/components/content/ReceiptViewer.vue'
import type { Receipt } from '../../app/composables/useReceipt'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    algorithm: 'alpha-miner',
    input_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    output_hash: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
    run_id: 'run-abc-123-xyz-789',
    timestamp: '2026-06-10T12:34:56.789Z',
    input_size: 2048,
    ...overrides,
  }
}

// Mock navigator.clipboard (not available in happy-dom by default)
beforeEach(() => {
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReceiptViewer', () => {
  // 1. renders run_id value
  it('renders the run_id value', async () => {
    const receipt = makeReceipt({ run_id: 'run-abc-123-xyz-789' })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    expect(wrapper.text()).toContain('run-abc-123-xyz-789')
  })

  // 2. renders algorithm name
  it('renders the algorithm name', async () => {
    const receipt = makeReceipt({ algorithm: 'heuristic-miner' })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    expect(wrapper.text()).toContain('heuristic-miner')
  })

  // 3. renders input_hash truncated to 16 chars + ellipsis
  it('renders input_hash truncated to 16 characters with ellipsis', async () => {
    const receipt = makeReceipt({
      input_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    // shortHash = h.slice(0, 16) + '…'
    expect(wrapper.text()).toContain('abcdef1234567890' + '…')
  })

  // 4. renders output_hash truncated
  it('renders output_hash truncated to 16 characters with ellipsis', async () => {
    const receipt = makeReceipt({
      output_hash: '0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
    })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    expect(wrapper.text()).toContain('0000111122223333' + '…')
  })

  // 5. renders timestamp value
  it('renders the timestamp value', async () => {
    const receipt = makeReceipt({ timestamp: '2026-06-10T12:34:56.789Z' })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    expect(wrapper.text()).toContain('2026-06-10T12:34:56.789Z')
  })

  // 6. renders input_size with "bytes" label
  it('renders input_size with bytes label', async () => {
    const receipt = makeReceipt({ input_size: 2048 })
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    expect(wrapper.text()).toContain('2,048 bytes')
  })

  // 7. all 6 required receipt fields are displayed
  it('displays all 6 required receipt field labels', async () => {
    const receipt = makeReceipt()
    const wrapper = await mountSuspended(ReceiptViewer, { props: { receipt } })
    const text = wrapper.text()
    expect(text).toContain('algorithm')
    expect(text).toContain('run_id')
    expect(text).toContain('input_hash')
    expect(text).toContain('output_hash')
    expect(text).toContain('timestamp')
    expect(text).toContain('input_size')
  })
})
