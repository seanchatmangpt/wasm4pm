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
    timestamp: string;
    component: string;
    event_type: string;
    run_id?: string;
    data: Record<string, any>;
}
/**
 * Layer 3: OTEL Event - OpenTelemetry distributed tracing
 * Supports W3C Trace Context for distributed systems
 */
export interface OtelEvent {
    trace_id: string;
    span_id: string;
    parent_span_id?: string;
    name: string;
    kind?: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
    start_time: number;
    end_time?: number;
    status?: {
        code: 'UNSET' | 'OK' | 'ERROR';
        message?: string;
    };
    attributes: Record<string, any>;
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
    endpoint: string;
    required: boolean;
    timeout_ms?: number;
    max_queue_size?: number;
    batch_size?: number;
}
/**
 * JSON writer configuration
 */
export interface JsonConfig {
    enabled: boolean;
    dest: string;
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
    'run.id': string;
    'config.hash': string;
    'input.hash': string;
    'plan.hash': string;
    'execution.profile': string;
    'source.kind': string;
    'sink.kind': string;
}
/**
 * Result of an observability operation
 */
export interface ObservabilityResult {
    success: boolean;
    error?: string;
    timestamp: Date;
}
//# sourceMappingURL=types.d.ts.map