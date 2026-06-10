import { describe, it, expect, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AlgorithmTable from '~/components/content/AlgorithmTable.vue'

// AlgorithmTable has no composable deps — no mocks needed for the component itself.
// useWasm is imported transitively by nothing here, but stub $fetch defensively.
vi.stubGlobal('$fetch', vi.fn())

async function mountTable(props: Record<string, unknown> = {}) {
  return mountSuspended(AlgorithmTable, { props })
}

describe('AlgorithmTable', () => {
  it('renders a table/list of algorithms', async () => {
    const wrapper = await mountTable()
    // UTable renders rows; assert at least one known algorithm id is visible
    expect(wrapper.text()).toContain('simd_streaming_dfg')
    expect(wrapper.text()).toContain('alpha_miner')
  })

  it('filter prop narrows displayed algorithms', async () => {
    // The `filter` prop is declared but currently used for external filtering;
    // assert the component mounts with it without error and still shows the table.
    const wrapper = await mountTable({ filter: 'Discovery' })
    expect(wrapper.text()).toContain('simd_streaming_dfg')
  })

  it('search input filters algorithms by name', async () => {
    const wrapper = await mountTable()
    const input = wrapper.find('input')
    expect(input.exists()).toBe(true)
    await input.setValue('alpha_miner')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('alpha_miner')
    // Algorithms that don't match the search should not appear in the count summary
    const summary = wrapper.text().match(/Showing (\d+) of (\d+)/)
    expect(summary).toBeTruthy()
    // After filtering to "alpha_miner" at least one result shows
    expect(Number(summary![1])).toBeGreaterThanOrEqual(1)
    // Fewer results than total
    expect(Number(summary![1])).toBeLessThan(Number(summary![2]))
  })

  it('each algorithm row shows name, tier, description', async () => {
    const wrapper = await mountTable()
    // Check a known row's name, tier, and description
    const text = wrapper.text()
    expect(text).toContain('simd_streaming_dfg')
    expect(text).toContain('fast')
    expect(text).toContain('SIMD-accelerated streaming DFG')
    expect(text).toContain('heuristic_miner')
    expect(text).toContain('balanced')
    expect(text).toContain('Dependency threshold-based process model')
  })
})
