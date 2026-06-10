import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReceipt } from '../../app/composables/useReceipt'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a deterministic 32-byte ArrayBuffer so SHA-256 output is predictable. */
function fakeDigestBuffer(seed = 0xab): ArrayBuffer {
  const buf = new ArrayBuffer(32)
  new Uint8Array(buf).fill(seed)
  return buf
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

const FAKE_HASH = hexFromBuffer(fakeDigestBuffer(0xab))
const FAKE_UUID = '550e8400-e29b-41d4-a716-446655440000'

// ---------------------------------------------------------------------------
// Setup — mock crypto and localStorage before each test
// ---------------------------------------------------------------------------

let localStorageStore: Record<string, string> = {}

beforeEach(() => {
  // Reset in-memory store
  localStorageStore = {}

  // Stub localStorage
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value },
    removeItem: (key: string) => { delete localStorageStore[key] },
    clear: () => { localStorageStore = {} },
  })

  // Stub crypto.subtle.digest to return predictable buffer
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn().mockResolvedValue(fakeDigestBuffer(0xab)),
    },
    randomUUID: vi.fn().mockReturnValue(FAKE_UUID),
  })

  // Make import.meta.client truthy so the persistence branch executes
  vi.stubGlobal('import', { meta: { client: true } })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // 3. hashes match the mocked SHA-256 output
  it('saveReceipt hashes equal the SHA-256 digest output', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('x', {}, 'inductive-miner')

    expect(receipt.input_hash).toBe(FAKE_HASH)
    expect(receipt.output_hash).toBe(FAKE_HASH)
  })

  // 4. run_id is UUID-like (hex, no dashes, 32 chars from randomUUID sans dashes)
  it('saveReceipt run_id is a UUID-derived string', async () => {
    const { saveReceipt } = useReceipt()
    const receipt = await saveReceipt('data', {}, 'dfg')

    const expectedRunId = FAKE_UUID.replace(/-/g, '')
    expect(receipt.run_id).toBe(expectedRunId)
    // UUID without dashes = 32 hex chars
    expect(receipt.run_id).toMatch(/^[0-9a-f]{32}$/)
  })

  // 5. input_size matches input string byte length
  it('saveReceipt input_size equals input string length', async () => {
    const { saveReceipt } = useReceipt()
    const input = 'hello world'
    const receipt = await saveReceipt(input, {}, 'petrinet')

    expect(receipt.input_size).toBe(input.length)
  })

  // 6. getReceipts returns empty array on fresh start
  it('getReceipts returns empty array on fresh start', () => {
    const { getReceipts } = useReceipt()
    expect(getReceipts()).toEqual([])
  })

  // 7. getReceipts returns saved receipts after saveReceipt calls
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

  // 8. getReceipts persists to localStorage
  it('getReceipts reads from localStorage', async () => {
    const { saveReceipt } = useReceipt()
    await saveReceipt('payload', { x: 1 }, 'conformance')

    // Raw localStorage should hold JSON
    const raw = localStorageStore['wasm4pm:receipts']
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]!.algorithm).toBe('conformance')
  })

  // 9. clearReceipts empties the receipt list
  it('clearReceipts removes all receipts', async () => {
    const { saveReceipt, getReceipts, clearReceipts } = useReceipt()
    await saveReceipt('data', {}, 'algo')

    clearReceipts()
    expect(getReceipts()).toEqual([])
    expect(localStorageStore['wasm4pm:receipts']).toBeUndefined()
  })

  // 10. Persistence cap: only last 20 receipts are kept when 25 are saved
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

  // 11. getReceipts reads from localStorage on composable init
  it('getReceipts reads pre-existing data from localStorage on init', () => {
    const preExisting = [
      {
        algorithm: 'pre-existing',
        input_hash: 'aabbcc',
        output_hash: 'ddeeff',
        run_id: 'abc123',
        timestamp: new Date().toISOString(),
        input_size: 42,
      },
    ]
    localStorageStore['wasm4pm:receipts'] = JSON.stringify(preExisting)

    // New composable instance should read from localStorage immediately
    const { getReceipts } = useReceipt()
    const receipts = getReceipts()

    expect(receipts).toHaveLength(1)
    expect(receipts[0]!.algorithm).toBe('pre-existing')
    expect(receipts[0]!.input_hash).toBe('aabbcc')
  })
})
