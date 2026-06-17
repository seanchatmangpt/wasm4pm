import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CognitionDemo from '../../app/components/content/CognitionDemo.vue'

// happy-dom provides real crypto.subtle and localStorage — no need to stub them.

beforeEach(() => {
  // Reset localStorage between tests so receipt lists don't bleed across.
  localStorage.clear()

  // Stub $fetch for /api/cognition — network boundary, no real server in vitest.
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({
    output: { diagnosis: 'strep_infection', antibiotic: 'penicillin' },
    output_hash: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
    run_id: 'run-mock-001'
  }))
})

describe('CognitionDemo', () => {
  // 1. renders breed name as badge
  it('renders breed name as a badge', async () => {
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
    expect(wrapper.text()).toContain('mycin')
  })

  it('renders custom breed name when prop differs from default', async () => {
    const wrapper = mount(CognitionDemo, { props: { breed: 'eliza' } })
    await flushPromises()
    expect(wrapper.text()).toContain('eliza')
  })

  // 2. renders JSON editor (UTextarea) for contract input
  it('renders a textarea containing the preset contract JSON', async () => {
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
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
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))
    expect(runButton).toBeDefined()
    expect(runButton!.exists()).toBe(true)
  })

  // 4. shows loading state during run
  it('shows loading state on the Run button while running', async () => {
    // Make $fetch hang indefinitely so running.value stays true
    let resolveFetch!: (v: unknown) => void
    const pendingFetch = new Promise((r) => { resolveFetch = r })
    vi.stubGlobal('$fetch', () => pendingFetch)

    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))!

    await runButton.trigger('click')
    await wrapper.vm.$nextTick()

    const anyDisabledOrBusy = wrapper.find('[aria-busy="true"], button[disabled]').exists()
      || runButton.attributes('disabled') !== undefined
      || runButton.attributes('aria-busy') !== undefined
    expect(anyDisabledOrBusy).toBe(true)

    // Resolve to avoid unhandled rejection in teardown
    resolveFetch({ output: {}, output_hash: 'abc', run_id: 'x' })
  })

  // 5. result area hidden before first run
  it('does not render the result area before any run', async () => {
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(false)
  })

  // 6. after run shows output JSON
  it('displays output JSON after a successful run', async () => {
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
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
    const wrapper = mount(CognitionDemo, { props: { breed: 'mycin' } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))!

    await runButton.trigger('click')
    await new Promise(r => setTimeout(r, 50))
    await flushPromises()

    const text = wrapper.text()
    // ReceiptViewer renders the output_hash and run_id field labels
    expect(text).toContain('output_hash')
    expect(text).toContain('run_id')
  })
})
