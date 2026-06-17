/**
 * FM-5 mandatory integration test — real WASM binary, real XES, no vi.mock.
 *
 * Proves that the wasm4pm Node.js CJS build loads and executes correctly in
 * the vitest environment.  Every assertion is grounded in actual algorithm
 * output — no synthetic return values.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from 'wasm4pm'

const SMALL_XES = readFileSync(
  join(__dirname, '../../public/samples/small-example.xes'), 'utf8'
)
const ROAD_XES = readFileSync(
  join(__dirname, '../../public/samples/road-traffic.xes'), 'utf8'
)

describe('WASM algorithms — real binary, real data (FM-5 gate)', () => {
  // ── Module integrity ──────────────────────────────────────────────────────

  it('wasm4pm module loads and exports algorithm functions', () => {
    expect(typeof (wasm as any).load_eventlog_from_xes).toBe('function')
    expect(typeof (wasm as any).discover_dfg).toBe('function')
    expect(typeof (wasm as any).discover_heuristic_miner).toBe('function')
  })

  it('get_version returns a non-empty string', () => {
    const version = (wasm as any).get_version()
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })

  // ── Event log loading ─────────────────────────────────────────────────────

  it('load_eventlog_from_xes returns a handle for small-example.xes', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    expect(handle).toBeTruthy()
  })

  it('load_eventlog_from_xes returns a handle for road-traffic.xes', () => {
    const handle = (wasm as any).load_eventlog_from_xes(ROAD_XES)
    expect(handle).toBeTruthy()
  })

  it('get_trace_count returns a positive integer', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    const count = (wasm as any).get_trace_count(handle)
    expect(typeof count).toBe('number')
    expect(count).toBeGreaterThan(0)
  })

  // ── Process discovery ─────────────────────────────────────────────────────

  it('discover_dfg: produces nodes, edges, start_activities, end_activities', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    const result = JSON.parse((wasm as any).discover_dfg(handle, 'concept:name'))
    expect(Array.isArray(result.nodes)).toBe(true)
    expect(Array.isArray(result.edges)).toBe(true)
    expect(result.nodes.length).toBeGreaterThan(0)
    expect(result.start_activities).toBeDefined()
    expect(result.end_activities).toBeDefined()
  })

  it('discover_dfg: node objects have id and label', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    const result = JSON.parse((wasm as any).discover_dfg(handle, 'concept:name'))
    const node = result.nodes[0]
    expect(node).toHaveProperty('id')
    expect(node).toHaveProperty('label')
  })

  it('discover_heuristic_miner: returns algorithm name and node/edge counts', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    const result = JSON.parse((wasm as any).discover_heuristic_miner(handle, 'concept:name', 0.5))
    expect(result).toHaveProperty('algorithm', 'heuristic_miner')
    expect(typeof result.nodes).toBe('number')
    expect(typeof result.edges).toBe('number')
  })

  it('discover_inductive_miner: returns a non-null object', () => {
    const handle = (wasm as any).load_eventlog_from_xes(SMALL_XES)
    const result = JSON.parse((wasm as any).discover_inductive_miner(handle, 'concept:name'))
    expect(result).not.toBeNull()
    expect(typeof result).toBe('object')
  })

  // ── Hash / provenance ─────────────────────────────────────────────────────

  it('hash_xes_content returns a non-empty hex string (content fingerprint)', () => {
    const hash = (wasm as any).hash_xes_content(SMALL_XES)
    expect(typeof hash).toBe('string')
    expect(hash).toMatch(/^[0-9a-f]+$/i)
    expect(hash.length).toBeGreaterThan(0)
  })

  it('hash_xes_content is deterministic for the same input', () => {
    const h1 = (wasm as any).hash_xes_content(SMALL_XES)
    const h2 = (wasm as any).hash_xes_content(SMALL_XES)
    expect(h1).toBe(h2)
  })

  it('hash_xes_content differs between different files', () => {
    const h1 = (wasm as any).hash_xes_content(SMALL_XES)
    const h2 = (wasm as any).hash_xes_content(ROAD_XES)
    expect(h1).not.toBe(h2)
  })
})
