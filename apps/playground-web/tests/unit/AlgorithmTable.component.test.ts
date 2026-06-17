import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AlgorithmTable from '~/components/content/AlgorithmTable.vue'

vi.stubGlobal('$fetch', vi.fn())

// UTable uses scoped named slots — provide a minimal stub that renders all data rows
// so the text assertions can find algorithm IDs.
const UTableStub = {
  props: ['data', 'columns'],
  template: `<table><tbody>
    <tr v-for="(row, i) in data" :key="i">
      <td><slot name="id-cell" :row="{ original: row }" /></td>
      <td>{{ row.alias }}</td>
      <td>{{ row.domain }}</td>
      <td><slot name="tier-cell" :row="{ original: row }" /></td>
      <td>{{ row.description }}</td>
    </tr>
  </tbody></table>`
}

const globalStubs = { stubs: { UTable: UTableStub } }

async function mountTable(props: Record<string, unknown> = {}) {
  const wrapper = mount(AlgorithmTable, { props, global: globalStubs })
  await flushPromises()
  return wrapper
}

describe('AlgorithmTable', () => {
  it('renders a table/list of algorithms', async () => {
    const wrapper = await mountTable()
    expect(wrapper.text()).toContain('simd_streaming_dfg')
    expect(wrapper.text()).toContain('alpha_miner')
  })

  it('filter prop narrows displayed algorithms', async () => {
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
    const summary = wrapper.text().match(/Showing (\d+) of (\d+)/)
    expect(summary).toBeTruthy()
    expect(Number(summary![1])).toBeGreaterThanOrEqual(1)
    expect(Number(summary![1])).toBeLessThan(Number(summary![2]))
  })

  it('each algorithm row shows name, tier, description', async () => {
    const wrapper = await mountTable()
    const text = wrapper.text()
    expect(text).toContain('simd_streaming_dfg')
    expect(text).toContain('fast')
    expect(text).toContain('SIMD-accelerated streaming DFG')
    expect(text).toContain('heuristic_miner')
    expect(text).toContain('balanced')
    expect(text).toContain('Dependency threshold-based process model')
  })
})
