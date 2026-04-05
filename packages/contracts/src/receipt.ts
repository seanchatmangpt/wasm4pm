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
  context?: Record<string, any>;
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
  parameters: Record<string, any>;
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
