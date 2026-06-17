import { z } from 'zod';

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
  level: 'info' | 'warn' | 'error' | 'debug'; // Severity level — required for machine filtering
  component: string; // e.g., "engine", "planner", "connector"
  event_type: string; // e.g., "execution_start", "trace_processed"
  run_id?: string; // UUID of the execution run
  data: Record<string, unknown>; // Arbitrary structured data
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
  status: {
    code: 'UNSET' | 'OK' | 'ERROR';
    message?: string;
  };
  attributes: Record<string, unknown>; // OTEL attributes - MUST include service.name
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
}

/**
 * Zod schema for OtelConfig read from config files / env vars.
 * Validates exporter type, endpoint URL format, and numeric bounds.
 */
export const OtelConfigSchema = z.object({
  enabled: z.boolean(),
  exporter: z.enum(['otlp_http', 'otlp_grpc']),
  endpoint: z.string().url(),
  required: z.boolean().default(false),
  timeout_ms: z.number().int().positive().optional(),
  max_queue_size: z.number().int().positive().optional(),
  batch_size: z.number().int().positive().optional(),
});

/** OTEL configuration for exporter */
export type OtelConfig = z.infer<typeof OtelConfigSchema>;

/**
 * Zod schema for JsonConfig read from config files / env vars.
 * Ensures dest is a non-empty string and rotation bounds are positive.
 */
export const JsonConfigSchema = z.object({
  enabled: z.boolean(),
  dest: z.string().min(1),
  rotation: z
    .object({
      max_bytes: z.number().int().positive().optional(),
      max_files: z.number().int().positive().optional(),
    })
    .optional(),
});

/** JSON writer configuration */
export type JsonConfig = z.infer<typeof JsonConfigSchema>;

/**
 * Zod schema for the complete observability configuration block.
 * Used when parsing configuration from TOML, JSON, or environment.
 */
export const ObservabilityConfigSchema = z.object({
  json: JsonConfigSchema.optional(),
  otel: OtelConfigSchema.optional(),
});

/** Complete observability configuration */
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;

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
