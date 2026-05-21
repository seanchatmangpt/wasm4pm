import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export interface Ocel20EventType {
  name: string;
  attributes: Record<string, any>[];
}

export interface Ocel20ObjectType {
  name: string;
  attributes: Record<string, any>[];
}

export interface Ocel20Object {
  id: string;
  type: string;
  attributes: Record<string, any>;
}

export interface Ocel20Event {
  id: string;
  type: string;
  time: string;
  attributes: Record<string, any>;
  relationships: { objectId: string; qualifier: string }[];
}

export interface Wasm4pmReceiptOcel2 {
  ocel: string;
  eventTypes: Ocel20EventType[];
  objectTypes: Ocel20ObjectType[];
  events: Ocel20Event[];
  objects: Ocel20Object[];
}

export interface BoundaryEvidence {
  command: string;
  args_hash: string;
  exit_code: number;
  stdout_hash: string;
  stderr_hash: string;
  input_artifact_hash: string;
  output_artifact_hash: string;
  registry_hash: string;
  binary_or_build_hash: string;
}

export interface AlgorithmReceipt {
  id: string;
  registry_present: boolean;
  dispatched: boolean;
  result_hash: string | null;
  duration_ms: number;
  expected_path: {
    route_id: string;
    expected_ocel2: Wasm4pmReceiptOcel2;
    expected_ocel2_hash: string;
  };
  observed_path: {
    observed_ocel2: Wasm4pmReceiptOcel2;
    observed_ocel2_hash: string;
    observed_result_hash: string | null;
  };
  alignment: {
    expected_vs_observed: string;
    missing_events: string[];
    unexpected_events: string[];
    refusal_state: string | null;
  };
  boundary_evidence: BoundaryEvidence;
}

export interface ExampleReceipt {
  receipt_type: string;
  receipt_schema: string;
  package: string;
  version: string;
  commit: string;
  hash_algorithm: string;
  time_basis: string;
  canonicalization: {
    name: string;
    version: number;
    hash_algorithm: string;
  };
  example_id: string;
  input: {
    event_log_hash: string;
    event_log_format: string;
    activity_key: string;
  };
  algorithms: AlgorithmReceipt[];
  algorithm_count: number;
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
