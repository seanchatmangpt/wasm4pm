import { describe, it, expect, beforeEach } from 'vitest'
import { useReceipt } from '../../app/composables/useReceipt'

// happy-dom provides real crypto.subtle (SHA-256) and localStorage.
// No stubs — useReceipt runs against real browser APIs.

beforeEach(() => {
  localStorage.clear()
})

describe('useReceipt', () => {
  // 1. saveReceipt() returns a Receipt with all required fields
  it('saveReceipt returns a Receipt with all required fields', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('{"event":"A"}', { result: 1 }, 'alpha-miner')

    expect(receipt).toHaveProperty('algorithm')
    expect(receipt).toHaveProperty('input_hash')
    expect(receipt).toHaveProperty('output_hash')
    expect(receipt).toHaveProperty('run_id')
    expect(receipt).toHaveProperty('timestamp')
    expect(receipt).toHaveProperty('input_size')
  })

  // 2. hashes are non-empty strings
  it('saveReceipt produces non-empty hash strings', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('input', {}, 'heuristic-miner')

    expect(typeof receipt.input_hash).toBe('string')
    expect(receipt.input_hash.length).toBeGreaterThan(0)
    expect(typeof receipt.output_hash).toBe('string')
    expect(receipt.output_hash.length).toBeGreaterThan(0)
  })

  // 3. hashes are real SHA-256 hex strings (64 chars)
  it('saveReceipt hashes are 64-char lowercase hex (real SHA-256)', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('x', {}, 'inductive-miner')

    expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(receipt.output_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  // 4. hashes are deterministic for the same input
  it('same input produces same input_hash on repeated calls', async () => {
    const { saveReceipt } = useReceipt()
    const r1 = await saveReceipt('deterministic-input', {}, 'dfg')
    const r2 = await saveReceipt('deterministic-input', {}, 'dfg')

    expect(r1.input_hash).toBe(r2.input_hash)
  })

  // 5. run_id is a UUID-derived 32-char hex string (dashes removed)
  it('saveReceipt run_id is a 32-char hex string', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('data', {}, 'dfg')

    expect(receipt.run_id).toMatch(/^[0-9a-f]{32}$/)
  })

  // 6. input_size matches input string byte length
  it('saveReceipt input_size equals input string length', async () => {
    const { saveReceipt } = useReceipt()
    const input = 'hello world'
    const receipt = await saveReceipt(input, {}, 'petrinet')

    expect(receipt.input_size).toBe(input.length)
  })

  // 7. getReceipts returns empty array on fresh start
  it('getReceipts returns empty array on fresh start', () => {
    const { getReceipts } = useReceipt()
    expect(getReceipts()).toEqual([])
  })

  // 8. getReceipts returns saved receipts after saveReceipt calls
  it('getReceipts returns receipts after saves', async () => {
    const { saveReceipt, getReceipts } = useReceipt()
    await saveReceipt('a', {}, 'algo-1')
    await saveReceipt('b', {}, 'algo-2')

    const receipts = getReceipts()
    expect(receipts).toHaveLength(2)
    // Most recent first (unshift)
    expect(receipts[0]!.algorithm).toBe('algo-2')
    expect(receipts[1]!.algorithm).toBe('algo-1')
  })

  // 9. getReceipts persists to localStorage
  it('getReceipts reads from localStorage', async () => {
    const { saveReceipt } = useReceipt()
    await saveReceipt('payload', { x: 1 }, 'conformance')

    const raw = localStorage.getItem('wasm4pm:receipts')
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]!.algorithm).toBe('conformance')
  })

  // 10. clearReceipts empties the receipt list
  it('clearReceipts removes all receipts', async () => {
    const { saveReceipt, getReceipts, clearReceipts } = useReceipt()
    await saveReceipt('data', {}, 'algo')

    clearReceipts()
    expect(getReceipts()).toEqual([])
    expect(localStorage.getItem('wasm4pm:receipts')).toBeNull()
  })

  // 11. Persistence cap: only last 20 receipts are kept when 25 are saved
  it('caps stored receipts at 20 when 25 are saved', async () => {
    const { saveReceipt, getReceipts } = useReceipt()

    for (let i = 0; i < 25; i++) {
      await saveReceipt(`input-${i}`, { i }, `algo-${i}`)
    }

    const receipts = getReceipts()
    expect(receipts).toHaveLength(20)
    // Most recent save was algo-24, so it should be first
    expect(receipts[0]!.algorithm).toBe('algo-24')
    // algo-0 through algo-4 were evicted
    const algorithms = receipts.map(r => r.algorithm)
    expect(algorithms).not.toContain('algo-0')
    expect(algorithms).not.toContain('algo-4')
  })

  // 12. getReceipts reads pre-existing data from localStorage on init
  it('getReceipts reads pre-existing data from localStorage on init', () => {
    const preExisting = [
      {
        algorithm: 'pre-existing',
        input_hash: 'a'.repeat(64),
        output_hash: 'b'.repeat(64),
        run_id: 'c'.repeat(32),
        timestamp: new Date().toISOString(),
        input_size: 42
      }
    ]
    localStorage.setItem('wasm4pm:receipts', JSON.stringify(preExisting))

    const { getReceipts } = useReceipt()
    const receipts = getReceipts()

    expect(receipts).toHaveLength(1)
    expect(receipts[0]!.algorithm).toBe('pre-existing')
    expect(receipts[0]!.input_hash).toBe('a'.repeat(64))
  })
})
