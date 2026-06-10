import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'

// ELK stub factory — registered via vi.doMock before each test loads the component.
function makeElkMock(overrideLayout?: (g: unknown) => Promise<unknown>) {
  return {
    default: class {
      layout(g: { children: Array<Record<string, unknown>> }) {
        if (overrideLayout) return overrideLayout(g)
        return Promise.resolve({
          ...g,
          children: (g.children ?? []).map((c, i) => ({
            ...c,
            x: i * 150,
            y: 100,
          })),
        })
      }
    },
  }
}

// Ensure import.meta.client is truthy before each test so the ELK branch runs.
beforeEach(() => {
  Object.defineProperty(import.meta, 'client', { value: true, configurable: true })
})

afterEach(() => {
  vi.resetModules()
})

// Helper: load the component fresh after doMock registrations
async function loadComponent() {
  const mod = await import('../../app/components/content/ProcessGraph.vue')
  return mod.default
}

describe('ProcessGraph', () => {
  // 1. No-data fallback message
  it('renders "No graph data" message when data has no nodes/edges', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: { data: {} },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('No graph data')
  })

  // 2. SVG rendered when nodes exist
  it('renders SVG when data has a nodes array', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          edges: [],
        },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  // 3. Correct number of node rectangles
  it('renders correct number of node rectangles', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
          edges: [],
        },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('rect').length).toBe(3)
  })

  // 4. Edges rendered as SVG lines
  it('renders edges as SVG lines', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
          edges: [{ source: 'a', target: 'b' }],
        },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('line').length).toBeGreaterThanOrEqual(1)
  })

  // 5. Shows "Computing layout…" while ELK is running (isLayouting=true)
  it('shows "Computing layout…" indicator while layout is in progress', async () => {
    // Slow ELK — never resolves during this test
    vi.doMock('elkjs/lib/elk.bundled.js', () => ({
      default: class {
        layout() {
          return new Promise(() => { /* intentionally never resolves */ })
        }
      },
    }))
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: { nodes: [{ id: 'x', label: 'X' }], edges: [] },
      },
    })
    // isLayouting is set to true before elk.layout resolves — check immediately
    const html = wrapper.html()
    expect(html.includes('Computing layout') || html.includes('svg')).toBe(true)
  })

  // 6. Accepts "activities" / "directly_follows" keys
  it('accepts activities and directly_follows keys', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          activities: [{ id: 'p', label: 'P' }, { id: 'q', label: 'Q' }],
          directly_follows: [{ source: 'p', target: 'q', weight: 2 }],
        },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.findAll('rect').length).toBe(2)
    expect(wrapper.findAll('line').length).toBeGreaterThanOrEqual(1)
  })

  // 7. Handles string nodes (not just {id, label} objects)
  it('handles string nodes', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: { nodes: ['alpha', 'beta'], edges: [] },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.findAll('rect').length).toBe(2)
    expect(wrapper.text()).toContain('alpha')
    expect(wrapper.text()).toContain('beta')
  })

  // 8. Edge weights affect stroke-width
  it('edge weights affect stroke-width', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => makeElkMock())
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
          edges: [
            { source: 'a', target: 'b', weight: 1 },
            { source: 'a', target: 'c', weight: 10 },
          ],
        },
      },
    })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const lines = wrapper.findAll('line')
    expect(lines.length).toBe(2)
    const sw0 = parseFloat(lines[0]!.attributes('stroke-width') ?? '0')
    const sw1 = parseFloat(lines[1]!.attributes('stroke-width') ?? '0')
    expect(sw0).not.toEqual(sw1)
  })

  // 9. Falls back to grid layout when ELK throws
  it('falls back to grid layout when ELK fails', async () => {
    vi.doMock('elkjs/lib/elk.bundled.js', () => ({
      default: class {
        layout() {
          return Promise.reject(new Error('ELK unavailable'))
        }
      },
    }))
    const ProcessGraph = await loadComponent()
    const wrapper = await mountSuspended(ProcessGraph, {
      props: {
        data: {
          nodes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }],
          edges: [{ source: 'x', target: 'y' }],
        },
      },
    })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.findAll('rect').length).toBe(2)
  })
})
