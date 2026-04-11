/**
 * Event type definitions for the three-layer observability system
 * Layer 1: CLI (human-readable)
 * Layer 2: JSON (machine-readable)
 * Layer 3: OTEL (distributed tracing)
 */

/**
 * Layer 1: CLI Event - human-readable logging
 * Used for terminal output and simple console logging
 */
export interface CliEvent {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp?: Date;
}

/**
 * Layer 2: JSON Event - machine-readable structured logging
 * One event per line (JSONL format) for easy parsing and ingestion
 */
export interface JsonEvent {
  timestamp: string; // ISO 8601
  component: string; // e.g., "engine", "planner", "connector"
  event_type: string; // e.g., "execution_start", "trace_processed"
  run_id?: string; // UUID of the execution run
  data: Record<string, any>; // Arbitrary structured data
}

/**
 * Layer 3: OTEL Event - OpenTelemetry distributed tracing
 * Supports W3C Trace Context for distributed systems
 */
export interface OtelEvent {
  trace_id: string; // W3C Trace Context (32 hex chars)
  span_id: string; // W3C Trace Context (16 hex chars)
  parent_span_id?: string; // For child spans
  name: string; // Span name
  kind?: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  start_time: number; // Unix timestamp in nanoseconds
  end_time?: number; // Unix timestamp in nanoseconds
  status?: {
    code: 'UNSET' | 'OK' | 'ERROR';
    message?: string;
  };
  attributes: Record<string, any>; // OTEL attributes - MUST include service.name
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, any>;
  }>;
}

/**
 * OTEL configuration for exporter
 */
export interface OtelConfig {
  enabled: boolean;
  exporter: 'otlp_http' | 'otlp_grpc';
  endpoint: string; // e.g., "http://localhost:4317"
  required: boolean; // if false, OTEL errors don't fail execution
  timeout_ms?: number; // default: 5000
  max_queue_size?: number; // default: 1000
  batch_size?: number; // default: 100
}

/**
 * JSON writer configuration
 */
export interface JsonConfig {
  enabled: boolean;
  dest: string; // file path or 'stdout'
  rotation?: {
    max_bytes?: number;
    max_files?: number;
  };
}

/**
 * Complete observability configuration
 */
export interface ObservabilityConfig {
  json?: JsonConfig;
  otel?: OtelConfig;
}

/**
 * OTEL attributes required by PRD §18.2-3
 * These must be present on all OTEL spans
 */
export interface RequiredOtelAttributes {
  'run.id': string; // UUID
  'config.hash': string; // BLAKE3 hash
  'input.hash': string; // BLAKE3 hash
  'plan.hash': string; // BLAKE3 hash
  'execution.profile': string; // e.g., "default", "benchmark"
  'source.kind': string; // e.g., "xes", "csv", "parquet"
  'sink.kind': string; // e.g., "petri_net", "dfg", "json"
}

/**
 * Result of an observability operation
 */
export interface ObservabilityResult {
  success: boolean;
  error?: string;
  timestamp: Date;
}
