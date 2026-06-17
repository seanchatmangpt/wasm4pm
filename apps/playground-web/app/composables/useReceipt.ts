export interface Receipt {
  algorithm: string
  input_hash: string
  output_hash: string
  run_id: string
  timestamp: string
  input_size: number
}

const STORAGE_KEY = 'wasm4pm:receipts'

// Simple FNV-1a hash as a stand-in for BLAKE3 in the browser
// (Real BLAKE3 would need a WASM build of the hasher — using crypto.subtle for now)
async function sha256hex(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data)
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateRunId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export const useReceipt = () => {
  async function saveReceipt(
    input: string,
    output: unknown,
    algorithm: string
  ): Promise<Receipt> {
    const [input_hash, output_hash] = await Promise.all([
      sha256hex(input),
      sha256hex(JSON.stringify(output))
    ])
    const receipt: Receipt = {
      algorithm,
      input_hash,
      output_hash,
      run_id: generateRunId(),
      timestamp: new Date().toISOString(),
      input_size: input.length
    }
    // Persist to localStorage (last 20 receipts)
    if (typeof window !== 'undefined') {
      const stored = getReceipts()
      stored.unshift(receipt)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.slice(0, 20)))
    }
    return receipt
  }

  function getReceipts(): Receipt[] {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch { return [] }
  }

  function clearReceipts() {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  }

  return { saveReceipt, getReceipts, clearReceipts }
}
