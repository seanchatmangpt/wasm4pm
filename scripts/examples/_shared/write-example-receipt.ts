import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface AlgorithmReceipt {
  id: string;
  registry_present: boolean;
  dispatched: boolean;
  result_hash: string;
  duration_ms: number;
}

export interface ExampleReceipt {
  example_id: string;
  package: string;
  version: string;
  event_log_hash: string;
  algorithms: AlgorithmReceipt[];
  algorithm_count: number;
  all_real: boolean;
  created_at: string;
  receipt_hash: string;
  previous_receipt_hash: string | null;
}

/**
 * Emits a machine-readable receipt for an example execution.
 * No receipt, no example.
 */
export function writeExampleReceipt(receipt: Omit<ExampleReceipt, 'receipt_hash'>): string {
  const receiptHash = createHash('sha256')
    .update(JSON.stringify(receipt))
    .digest('hex');

  const finalReceipt: ExampleReceipt = {
    ...receipt,
    receipt_hash: receiptHash,
  };

  const outDir = path.resolve(process.cwd(), 'examples/out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filePath = path.join(outDir, `${receipt.example_id}.receipt.json`);
  fs.writeFileSync(filePath, JSON.stringify(finalReceipt, null, 2));

  console.log(`[RECEIPT EMITTED] ${receipt.example_id} -> ${filePath}`);
  return receiptHash;
}
