/**
 * Main observability layer coordinating all logging outputs
 * Implements three-layer architecture:
 * 1. CLI (human-readable console)
 * 2. JSON (machine-readable JSONL)
 * 3. OTEL (distributed tracing)
 *
 * All operations are non-blocking and async-safe
 * PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */

import { JsonWriter } from './json-writer.js';
import { OtelExporter } from './otel-exporter.js';
import {
  CliEvent,
  JsonEvent,
  OtelEvent,
  ObservabilityConfig,
  RequiredOtelAttributes,
  ObservabilityResult,
} from './types.js';

/**
 * Central observability layer managing all three logging outputs
 * All methods are non-blocking; they return immediately or return Promises that resolve asynchronously
 */
export class ObservabilityLayer {
  private jsonWriter?: JsonWriter;
  private otelExporter?: OtelExporter;
  private config: ObservabilityConfig;

  constructor(config: ObservabilityConfig = {}) {
    this.config = config;

    // Initialize JSON writer
    if (config.json?.enabled) {
      this.jsonWriter = new JsonWriter(config.json);
    }

    // Initialize OTEL exporter
    if (config.otel?.enabled) {
      this.otelExporter = new OtelExporter(config.otel);
    }
  }

  /**
   * Enable JSON logging (non-blocking)
   */
  public enableJson(dest: string): void {
    if (this.jsonWriter) {
      // Already enabled
      return;
    }

    this.jsonWriter = new JsonWriter({
      enabled: true,
      dest,
    });
  }

  /**
   * Enable OTEL export (non-blocking)
   */
  public enableOtel(config: { endpoint: string; exporter?: 'otlp_http' | 'otlp_grpc'; required?: boolean }): void {
    if (this.otelExporter) {
      // Already enabled
      return;
    }

    this.otelExporter = new OtelExporter({
      enabled: true,
      endpoint: config.endpoint,
      exporter: config.exporter ?? 'otlp_http',
      required: config.required ?? false,
    });
  }

  /**
   * Emit a CLI event (Layer 1 - human-readable)
   * Prints to console immediately
   */
  public emitCli(event: CliEvent): void {
    const timestamp = event.timestamp ?? new Date();
    const level = event.level.toUpperCase().padEnd(5);

    switch (event.level) {
      case 'error':
        console.error(`[${level}] ${timestamp.toISOString()} ${event.message}`);
        break;
      case 'warn':
        console.warn(`[${level}] ${timestamp.toISOString()} ${event.message}`);
        break;
      case 'info':
        console.info(`[${level}] ${timestamp.toISOString()} ${event.message}`);
        break;
      case 'debug':
        console.debug(`[${level}] ${timestamp.toISOString()} ${event.message}`);
        break;
    }
  }

  /**
   * Emit a JSON event (Layer 2 - machine-readable)
   * Non-blocking; buffers event for async write
   */
  public emitJson(event: JsonEvent): void {
    if (!this.jsonWriter) {
      return; // JSON writer not enabled
    }

    // Redact secrets from data
    const redactedData = JsonWriter.redactSecrets(event.data);
    const redactedEvent = { ...event, data: redactedData };

    // Non-blocking: emit to writer's buffer
    this.jsonWriter.emit(redactedEvent);
  }

  /**
   * Emit an OTEL event (Layer 3 - distributed tracing)
   * Non-blocking; queues event for async export
   */
  public emitOtel(event: OtelEvent): void {
    if (!this.otelExporter) {
      return; // OTEL exporter not enabled
    }

    // Non-blocking: emit to exporter's queue
    this.otelExporter.emit(event);
  }

  /**
   * Emit an event to all configured layers
   * This is the main entry point for logging
   *
   * Usage:
   *   observability.emit({
   *     cli: { level: 'info', message: 'Processing trace...' },
   *     json: { component: 'engine', event_type: 'trace_start', ... },
   *     otel: { trace_id: '...', span_id: '...', ... }
   *   })
   */
  public emit(event: {
    cli?: CliEvent;
    json?: JsonEvent;
    otel?: OtelEvent;
  }): void {
    // All non-blocking; emit to each layer that's configured
    if (event.cli) {
      this.emitCli(event.cli);
    }
    if (event.json) {
      this.emitJson(event.json);
    }
    if (event.otel) {
      this.emitOtel(event.otel);
    }
  }

  /**
   * Helper: Create a span with required OTEL attributes per PRD §18.2-3
   * Returns the span ID for parent-child relationships
   */
  public createSpan(
    traceId: string,
    name: string,
    requiredAttrs: RequiredOtelAttributes,
    customAttrs?: Record<string, any>
  ): string {
    const spanId = this.generateSpanId();

    const event: OtelEvent = {
      trace_id: traceId,
      span_id: spanId,
      name,
      kind: 'INTERNAL',
      start_time: Date.now() * 1000000, // Convert to nanoseconds
      status: { code: 'UNSET' },
      attributes: {
        ...requiredAttrs,
        ...customAttrs,
      },
    };

    this.emitOtel(event);
    return spanId;
  }

  /**
   * Helper: Generate a W3C-compliant trace ID (32 hex chars)
   */
  public static generateTraceId(): string {
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * Helper: Generate a W3C-compliant span ID (16 hex chars)
   */
  private generateSpanId(): string {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * Get the current observability configuration
   */
  public getConfig(): ObservabilityConfig {
    return this.config;
  }

  /**
   * Get recent observability listener errors from all layers
   * Allows callers to check if observability layers are failing
   */
  public getListenerErrors(): Array<{ timestamp: Date; message: string }> {
    const errors: Array<{ timestamp: Date; message: string }> = [];

    if (this.jsonWriter) {
      const jsonErrors = this.jsonWriter.getFlushErrors();
      errors.push(
        ...jsonErrors.map((e) => ({
          timestamp: e.timestamp,
          message: `JSON flush: ${e.error instanceof Error ? e.error.message : String(e.error)}`,
        }))
      );
    }

    if (this.otelExporter) {
      const otelErrors = this.otelExporter.getFlushErrors();
      errors.push(
        ...otelErrors.map((e) => ({
          timestamp: e.timestamp,
          message: `OTEL flush: ${e.error instanceof Error ? e.error.message : String(e.error)}`,
        }))
      );
    }

    return errors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Gracefully shutdown observability layer
   * Flushes all pending events
   * Reports critical failures when required: true
   */
  public async shutdown(): Promise<ObservabilityResult> {
    const results: ObservabilityResult[] = [];

    if (this.jsonWriter) {
      results.push(await this.jsonWriter.shutdown());
    }

    if (this.otelExporter) {
      results.push(await this.otelExporter.shutdown());
    }

    const hasErrors = results.some((r) => !r.success);
    const failedOtel = results.find((r) => !r.success && this.config.otel?.required);

    if (failedOtel && this.config.otel?.required) {
      return {
        success: false,
        error: `Required OTEL exporter failed: ${failedOtel.error}`,
        timestamp: new Date(),
      };
    }

    return {
      success: !hasErrors,
      error: hasErrors
        ? results.filter((r) => !r.success).map((r) => r.error).join('; ')
        : undefined,
      timestamp: new Date(),
    };
  }
}

/**
 * Singleton instance (optional convenience export)
 * Applications can use this or create their own instance
 */
let defaultInstance: ObservabilityLayer | null = null;

/**
 * Get or create the default observability instance
 */
export function getObservabilityLayer(
  config?: ObservabilityConfig
): ObservabilityLayer {
  if (!defaultInstance) {
    defaultInstance = new ObservabilityLayer(config);
  }
  return defaultInstance;
}
