import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface WpmOcelObjectRef {
  id: string;
  type: string;
  qualifier?: string;
}

export interface WpmOcelEvent {
  id: string;
  activity: string;
  timestamp: string;
  objects: WpmOcelObjectRef[];
  attributes: Record<string, any>;
}

export interface WpmOcelObject {
  id: string;
  type: string;
}

export interface Wasm4pmReceiptOcelSlice {
  schema: string;
  events: WpmOcelEvent[];
  objects: WpmOcelObject[];
}

export interface AlgorithmReceipt {
  id: string;
  registry_present: boolean;
  dispatched: boolean;
  result_hash: string | null;
  duration_ms: number;
  expected_path: {
    route_id: string;
    expected_ocel_hash: string;
    required_events: string[];
  };
  observed_path: {
    ocel: Wasm4pmReceiptOcelSlice;
    observed_ocel_hash: string;
    observed_result_hash: string | null;
  };
  alignment: {
    expected_vs_observed: string;
    missing_events: string[];
    unexpected_events: string[];
    refusal_state: string | null;
  };
}

export interface ExampleReceipt {
  receipt_type: string;
  receipt_schema: string;
  package: string;
  version: string;
  commit: string;
  hash_algorithm: string;
  example_id: string;
  input: {
    event_log_hash: string;
    event_log_format: string;
    activity_key: string;
  };
  algorithms: AlgorithmReceipt[];
  algorithm_count: number;
  all_real: boolean;
  created_at: string;
  previous_receipt_hash: string | null;
  receipt_hash: string;
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
