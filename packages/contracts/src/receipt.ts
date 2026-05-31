/**
 * Receipt types and interfaces for process mining runtime
 * Schema version 1.0
 *
 * Provides cryptographic proof of execution with BLAKE3 hashing.
 * Deterministic: sorted keys ensure same input → same hash.
 */

/**
 * Error information included in receipts for failed executions
 */
export interface ErrorInfo {
  code: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Summary of processing results
 */
export interface ExecutionSummary {
  traces_processed: number;
  objects_processed: number;
  variants_discovered: number;
}

/**
 * Algorithm details captured at execution time
 */
export interface AlgorithmInfo {
  name: string;
  version: string;
  parameters: Record<string, unknown>;
}

/**
 * Generated model information
 */
export interface ModelInfo {
  nodes: number;
  edges: number;
  artifacts?: Record<string, string>; // kind -> file path
}

/**
 * Execution profile — performance and resource usage breakdown
 */
export interface ExecutionProfile {
  /** Peak memory usage in bytes */
  peak_memory_bytes: number;

  /** Per-phase timing breakdown */
  phase_timings: {
    phase: string;
    duration_ms: number;
  }[];

  /** Total CPU time in ms (if measurable) */
  cpu_time_ms?: number;
}

/**
 * Runtime receipt - cryptographically signed proof of execution
 * Schema version 1.0
 */
export interface Receipt {
  // Identifiers
  run_id: string; // UUID v4
  schema_version: string; // "1.0"

  // Cryptographic hashes (BLAKE3, hex-encoded)
  config_hash: string;
  input_hash: string;
  plan_hash: string;
  output_hash: string;

  // Execution timeline (ISO 8601)
  start_time: string;
  end_time: string;
  duration_ms: number;

  // Execution outcome
  status: 'success' | 'partial' | 'failed';
  error?: ErrorInfo;

  // Execution details
  summary: ExecutionSummary;
  algorithm: AlgorithmInfo;
  model: ModelInfo;

  // Performance profile
  profile?: ExecutionProfile;
}

/**
 * Format a Receipt as a human-readable one-liner for practitioner QoL.
 *
 * A practitioner glancing at a saved result file should immediately see:
 *   what ran | what data | how many traces/variants | how long | outcome
 *
 * Without this, they must parse 64-char BLAKE3 hex strings to reconstruct context.
 *
 * Example output:
 *   "dfg on xes [342 traces, 8 variants, 47 edges] — 47ms — success [run: a3f8b2c1]"
 *
 * The short run_id prefix (8 chars) is enough for log correlation without
 * overwhelming the terminal line. Full hashes are already in the receipt JSON.
 */
export function formatReceipt(receipt: Receipt): string {
  const runPrefix = receipt.run_id.replace(/-/g, '').slice(0, 8);
  const { traces_processed, variants_discovered } = receipt.summary;
  const { nodes, edges } = receipt.model;
  const alg = receipt.algorithm.name;
  const durationMs = receipt.duration_ms;

  const tracePart =
    traces_processed > 0
      ? `${traces_processed} trace${traces_processed !== 1 ? 's' : ''}, ` +
        `${variants_discovered} variant${variants_discovered !== 1 ? 's' : ''}`
      : 'no traces';
  const modelPart = nodes > 0 ? `, ${nodes} nodes, ${edges} edges` : '';
  const timePart = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;
  const statusGlyph = receipt.status === 'success' ? 'ok' : receipt.status;

  return `${alg} [${tracePart}${modelPart}] — ${timePart} — ${statusGlyph} [run: ${runPrefix}]`;
}

/**
 * Type guard to check if a value is a valid Receipt
 */
export function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== 'object') return false;

  const receipt = value as Record<string, unknown>;

  return (
    typeof receipt.run_id === 'string' &&
    typeof receipt.schema_version === 'string' &&
    typeof receipt.config_hash === 'string' &&
    typeof receipt.input_hash === 'string' &&
    typeof receipt.plan_hash === 'string' &&
    typeof receipt.output_hash === 'string' &&
    typeof receipt.start_time === 'string' &&
    typeof receipt.end_time === 'string' &&
    typeof receipt.duration_ms === 'number' &&
    ['success', 'partial', 'failed'].includes(receipt.status as string) &&
    typeof receipt.summary === 'object' &&
    typeof receipt.algorithm === 'object' &&
    typeof receipt.model === 'object'
  );
}

/**
 * Diff between two receipts — describes fields that diverge.
 *
 * All fields except `same` are optional; they are only present when the
 * corresponding property differs between `a` and `b`.
 */
export interface ReceiptDiff {
  /** true if the receipts are semantically identical (no differing fields) */
  same: boolean;
  /** run_id differs (always true when comparing two distinct runs) */
  run_id?: { a: string; b: string };
  /** execution status differs */
  status?: { a: Receipt['status']; b: Receipt['status'] };
  /** algorithm name or version differs */
  algorithm?: { a: string; b: string };
  /** duration_ms differs by more than 1ms */
  duration_ms?: { a: number; b: number };
  /** Any hash field (input, config, plan, output) that differs */
  hashes?: { field: string; a: string; b: string }[];
  /** Summary fields that differ */
  summary?: { field: string; a: number; b: number }[];
  /** Model field (nodes or edges) that differs */
  model?: { field: string; a: number; b: number }[];
}

/**
 * Validate that an unknown value satisfies the full Receipt schema contract.
 *
 * More strict than `isReceipt`: also verifies that hash fields are exactly 64
 * hex characters (BLAKE3 output), that timestamps parse as ISO-8601, and that
 * numeric fields are within expected ranges.
 *
 * @param receipt Value to validate
 * @returns true if `receipt` is a well-formed Receipt
 *
 * @example
 * ```ts
 * const raw = JSON.parse(fs.readFileSync('result.json', 'utf8'));
 * if (validateReceiptSchema(raw)) {
 *   // raw is Receipt
 * }
 * ```
 */
export function validateReceiptSchema(receipt: unknown): receipt is Receipt {
  if (!isReceipt(receipt)) return false;

  const r = receipt as Receipt;
  const hexPattern = /^[0-9a-f]{64}$/;

  // Hash fields must be 64 hex chars (BLAKE3)
  for (const field of ['config_hash', 'input_hash', 'plan_hash', 'output_hash'] as const) {
    if (!hexPattern.test(r[field])) return false;
  }

  // Timestamps must be parseable ISO-8601
  if (isNaN(Date.parse(r.start_time))) return false;
  if (isNaN(Date.parse(r.end_time))) return false;

  // duration_ms must be non-negative
  if (r.duration_ms < 0) return false;

  // summary counts must be non-negative integers
  const s = r.summary;
  if (
    !Number.isInteger(s.traces_processed) || s.traces_processed < 0 ||
    !Number.isInteger(s.objects_processed) || s.objects_processed < 0 ||
    !Number.isInteger(s.variants_discovered) || s.variants_discovered < 0
  ) return false;

  // model counts must be non-negative integers
  if (
    !Number.isInteger(r.model.nodes) || r.model.nodes < 0 ||
    !Number.isInteger(r.model.edges) || r.model.edges < 0
  ) return false;

  return true;
}

/**
 * Check whether a receipt is older than a given maximum age.
 *
 * Uses `end_time` (the completion timestamp) as the reference point.
 * Returns true if the receipt has "expired" — i.e. its end_time is more
 * than `maxAgeMs` milliseconds ago relative to the current wall clock.
 *
 * @param receipt Receipt to inspect
 * @param maxAgeMs Maximum acceptable age in milliseconds
 * @returns true if the receipt end_time is more than maxAgeMs ms ago
 *
 * @example
 * ```ts
 * const ONE_HOUR = 60 * 60 * 1000;
 * if (isReceiptExpired(receipt, ONE_HOUR)) {
 *   // Stale — re-run discovery
 * }
 * ```
 */
export function isReceiptExpired(receipt: Receipt, maxAgeMs: number): boolean {
  const endMs = Date.parse(receipt.end_time);
  if (isNaN(endMs)) return true; // Treat unparseable timestamp as expired
  return Date.now() - endMs > maxAgeMs;
}

/**
 * Produce a concise, human-readable one-line summary of a receipt.
 *
 * Alias of `formatReceipt` — provided under the name `receiptSummary` so callers
 * looking for a "summary" function find it without knowing the internal naming.
 * Returns a non-empty string suitable for logs, CLI output, or diagnostics.
 *
 * @param receipt Receipt to summarize
 * @returns A non-empty one-line summary string
 *
 * @example
 * ```ts
 * console.log(receiptSummary(receipt));
 * // "dfg [342 traces, 8 variants, 5 nodes, 12 edges] — 47ms — ok [run: a3f8b2c1]"
 * ```
 */
export function receiptSummary(receipt: Receipt): string {
  return formatReceipt(receipt);
}

/**
 * Compare two receipts and return a structured diff of their differences.
 *
 * Useful for detecting result drift between runs, verifying re-runs are
 * deterministic, or reporting what changed after an algorithm upgrade.
 *
 * Hash comparisons are exact (bit-for-bit). Numeric comparisons use a 1ms
 * tolerance for `duration_ms` to absorb measurement noise.
 *
 * @param a First receipt
 * @param b Second receipt
 * @returns A {@link ReceiptDiff} object; `same: true` means no differences found
 *
 * @example
 * ```ts
 * const diff = compareReceipts(receiptA, receiptB);
 * if (!diff.same) {
 *   console.warn('Receipts differ:', diff);
 * }
 * ```
 */
export function compareReceipts(a: Receipt, b: Receipt): ReceiptDiff {
  const diff: ReceiptDiff = { same: true };

  if (a.run_id !== b.run_id) {
    diff.same = false;
    diff.run_id = { a: a.run_id, b: b.run_id };
  }

  if (a.status !== b.status) {
    diff.same = false;
    diff.status = { a: a.status, b: b.status };
  }

  const algoA = `${a.algorithm.name}@${a.algorithm.version}`;
  const algoB = `${b.algorithm.name}@${b.algorithm.version}`;
  if (algoA !== algoB) {
    diff.same = false;
    diff.algorithm = { a: algoA, b: algoB };
  }

  // duration_ms — 1ms tolerance
  if (Math.abs(a.duration_ms - b.duration_ms) > 1) {
    diff.same = false;
    diff.duration_ms = { a: a.duration_ms, b: b.duration_ms };
  }

  // Hash fields
  const hashFields = ['config_hash', 'input_hash', 'plan_hash', 'output_hash'] as const;
  const hashDiffs: ReceiptDiff['hashes'] = [];
  for (const field of hashFields) {
    if (a[field] !== b[field]) {
      hashDiffs.push({ field, a: a[field], b: b[field] });
    }
  }
  if (hashDiffs.length > 0) {
    diff.same = false;
    diff.hashes = hashDiffs;
  }

  // Summary fields
  const summaryFields = ['traces_processed', 'objects_processed', 'variants_discovered'] as const;
  const summaryDiffs: NonNullable<ReceiptDiff['summary']> = [];
  for (const field of summaryFields) {
    if (a.summary[field] !== b.summary[field]) {
      summaryDiffs.push({ field, a: a.summary[field], b: b.summary[field] });
    }
  }
  if (summaryDiffs.length > 0) {
    diff.same = false;
    diff.summary = summaryDiffs;
  }

  // Model fields
  const modelFields = ['nodes', 'edges'] as const;
  const modelDiffs: NonNullable<ReceiptDiff['model']> = [];
  for (const field of modelFields) {
    if (a.model[field] !== b.model[field]) {
      modelDiffs.push({ field, a: a.model[field], b: b.model[field] });
    }
  }
  if (modelDiffs.length > 0) {
    diff.same = false;
    diff.model = modelDiffs;
  }

  return diff;
}

/**
 * JSON Schema for Receipt (for external validation)
 */
export const RECEIPT_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://wasm4pm.dev/schemas/receipt/1.0',
  title: 'Receipt',
  description: 'Cryptographic proof of execution',
  type: 'object' as const,
  required: [
    'run_id',
    'schema_version',
    'config_hash',
    'input_hash',
    'plan_hash',
    'output_hash',
    'start_time',
    'end_time',
    'duration_ms',
    'status',
    'summary',
    'algorithm',
    'model',
  ],
  properties: {
    run_id: { type: 'string' as const, format: 'uuid' },
    schema_version: { type: 'string' as const, const: '1.0' },
    config_hash: { type: 'string' as const, pattern: '^[0-9a-f]{64}$' },
    input_hash: { type: 'string' as const, pattern: '^[0-9a-f]{64}$' },
    plan_hash: { type: 'string' as const, pattern: '^[0-9a-f]{64}$' },
    output_hash: { type: 'string' as const, pattern: '^[0-9a-f]{64}$' },
    start_time: { type: 'string' as const, format: 'date-time' },
    end_time: { type: 'string' as const, format: 'date-time' },
    duration_ms: { type: 'number' as const, minimum: 0 },
    status: { type: 'string' as const, enum: ['success', 'partial', 'failed'] },
    error: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' as const },
        message: { type: 'string' as const },
        stack: { type: 'string' as const },
        context: { type: 'object' as const },
      },
      required: ['code', 'message'],
    },
    summary: {
      type: 'object' as const,
      required: ['traces_processed', 'objects_processed', 'variants_discovered'],
      properties: {
        traces_processed: { type: 'integer' as const, minimum: 0 },
        objects_processed: { type: 'integer' as const, minimum: 0 },
        variants_discovered: { type: 'integer' as const, minimum: 0 },
      },
      additionalProperties: false,
    },
    algorithm: {
      type: 'object' as const,
      required: ['name', 'version', 'parameters'],
      properties: {
        name: { type: 'string' as const },
        version: { type: 'string' as const },
        parameters: { type: 'object' as const },
      },
      additionalProperties: false,
    },
    model: {
      type: 'object' as const,
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'integer' as const, minimum: 0 },
        edges: { type: 'integer' as const, minimum: 0 },
        artifacts: { type: 'object' as const },
      },
      additionalProperties: false,
    },
    profile: {
      type: 'object' as const,
      required: ['peak_memory_bytes', 'phase_timings'],
      properties: {
        peak_memory_bytes: { type: 'integer' as const, minimum: 0 },
        phase_timings: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            required: ['phase', 'duration_ms'],
            properties: {
              phase: { type: 'string' as const },
              duration_ms: { type: 'number' as const, minimum: 0 },
            },
            additionalProperties: false,
          },
        },
        cpu_time_ms: { type: 'number' as const, minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;
