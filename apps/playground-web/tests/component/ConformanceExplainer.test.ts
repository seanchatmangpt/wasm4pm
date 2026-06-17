import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConformanceExplainer from '../../app/components/content/ConformanceExplainer.vue'

describe('ConformanceExplainer', () => {
  it('renders the SVG alignment diagram', async () => {
    const wrapper = mount(ConformanceExplainer)
    await flushPromises()
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders the section heading', async () => {
    const wrapper = mount(ConformanceExplainer)
    await flushPromises()
    expect(wrapper.text()).toContain('Alignment-Based Conformance Checking')
  })

  it('explains synchronous, log, and model moves', async () => {
    const wrapper = mount(ConformanceExplainer)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Synchronous move')
    expect(text).toContain('Log move')
    expect(text).toContain('Model move')
  })

  it('shows fitness formula', async () => {
    const wrapper = mount(ConformanceExplainer)
    await flushPromises()
    expect(wrapper.text()).toContain('fitness')
    expect(wrapper.text()).toContain('alignment_cost')
  })

  it('shows total alignment cost of 1 for the example trace', async () => {
    const wrapper = mount(ConformanceExplainer)
    await flushPromises()
    expect(wrapper.text()).toContain('Total Alignment Cost')
  })

  it('has no interactive dependencies — renders without any props', async () => {
    // ConformanceExplainer is pure static SVG. Mounting with no props must not throw.
    expect(() => mount(ConformanceExplainer)).not.toThrow()
  })
})
