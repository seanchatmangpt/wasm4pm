import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import QualityBadge from '../../app/components/content/QualityBadge.vue'

describe('QualityBadge', () => {
  // 1. Renders 4 dimension badges
  it('renders 4 dimension badges (fitness, precision, simplicity, generalization)', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.9, precision: 0.8, simplicity: 0.7, generalization: 0.6 },
    })
    const text = wrapper.text()
    expect(text).toContain('fitness')
    expect(text).toContain('precision')
    expect(text).toContain('simplicity')
    expect(text).toContain('generalization')
  })

  // 2. Green (success) color for values > 0.85
  it('applies success color for values above 0.85', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.9, precision: 0.9, simplicity: 0.9, generalization: 0.9 },
    })
    const html = wrapper.html()
    // UBadge renders color as class or attribute — all four should be success
    expect(html).toContain('success')
    // No warning or error badges expected
    expect(html).not.toContain('warning')
    expect(html).not.toContain('error')
  })

  // 3. Yellow (warning) color for values 0.6–0.85
  it('applies warning color for values in range 0.6–0.85', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.75, precision: 0.75, simplicity: 0.75, generalization: 0.75 },
    })
    const html = wrapper.html()
    expect(html).toContain('warning')
    expect(html).not.toContain('success')
    expect(html).not.toContain('error')
  })

  // 4. Red (error) color for values < 0.6
  it('applies error color for values below 0.6', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.5, precision: 0.5, simplicity: 0.5, generalization: 0.5 },
    })
    const html = wrapper.html()
    expect(html).toContain('error')
    expect(html).not.toContain('success')
    expect(html).not.toContain('warning')
  })

  // 5. label prop shows as title
  it('renders label prop as visible title text', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.9, precision: 0.9, simplicity: 0.9, generalization: 0.9, label: 'Alpha Miner' },
    })
    expect(wrapper.text()).toContain('Alpha Miner')
  })

  // 5b. No label element when label prop is omitted
  it('does not render label element when label prop is empty', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.9, precision: 0.9, simplicity: 0.9, generalization: 0.9 },
    })
    expect(wrapper.find('.quality-badge-label').exists()).toBe(false)
  })

  // 6. Tooltip text describes each dimension
  it('tooltip text describes each dimension', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.9, precision: 0.8, simplicity: 0.7, generalization: 0.6 },
    })
    const html = wrapper.html()
    // UTooltip renders :text as an attribute or aria-label — check for keyword presence
    expect(html).toContain('replay')       // fitness tooltip
    expect(html).toContain('unseen')       // precision tooltip
    expect(html).toContain('Occam')        // simplicity tooltip
    expect(html).toContain('generalizes')  // generalization tooltip
  })

  // 7a. Boundary value 0 renders correctly as error
  it('renders boundary value 0 as error badge with "0.00"', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0, precision: 0, simplicity: 0, generalization: 0 },
    })
    const html = wrapper.html()
    expect(html).toContain('error')
    expect(wrapper.text()).toContain('0.00')
  })

  // 7b. Boundary value 1 renders correctly as success
  it('renders boundary value 1 as success badge with "1.00"', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 1, precision: 1, simplicity: 1, generalization: 1 },
    })
    const html = wrapper.html()
    expect(html).toContain('success')
    expect(wrapper.text()).toContain('1.00')
  })

  // 7c. Exact boundary 0.85 — colorFor uses >, so 0.85 is warning not success
  it('treats exact boundary 0.85 as warning (not success)', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.85, precision: 0.85, simplicity: 0.85, generalization: 0.85 },
    })
    const html = wrapper.html()
    expect(html).toContain('warning')
    expect(html).not.toContain('success')
  })

  // 7d. Exact boundary 0.6 — colorFor uses >=, so 0.6 is warning not error
  it('treats exact boundary 0.6 as warning (not error)', async () => {
    const wrapper = await mountSuspended(QualityBadge, {
      props: { fitness: 0.6, precision: 0.6, simplicity: 0.6, generalization: 0.6 },
    })
    const html = wrapper.html()
    expect(html).toContain('warning')
    expect(html).not.toContain('error')
  })
})
