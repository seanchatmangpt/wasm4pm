/**
 * OpenTelemetry event exporter with non-blocking queue and batch export
 * Events are queued and exported in batches to OTLP HTTP endpoint
 * Never blocks execution; errors are logged but don't fail execution
 * PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */

import { OtelEvent, OtelConfig, ObservabilityResult } from './types.js';

/**
 * Batched OTEL event exporter
 * Manages queue, batching, timeouts, and HTTP export
 * All operations are non-blocking and async
 */
export class OtelExporter {
  private config: OtelConfig;
  private queue: OtelEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private flushPromise: Promise<void> = Promise.resolve();
  private isShuttingDown = false;
  private flushErrors: Array<{ timestamp: Date; error: any }> = [];

  constructor(config: OtelConfig) {
    this.config = config;
    if (config.enabled) {
      this.startAutoFlush();
    }
  }

  private recordFlushError(error: any): void {
    this.flushErrors.push({ timestamp: new Date(), error });
    if (this.flushErrors.length > 50) this.flushErrors.shift();
  }

  public getFlushErrors(): Array<{ timestamp: Date; error: any }> {
    return [...this.flushErrors];
  }

  /**
   * Start automatic flush timer
   */
  private startAutoFlush(): void {
    const timeout = this.config.timeout_ms ?? 5000;

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        if (this.config.required) {
          console.error(`[observability] CRITICAL: Required OTEL flush failed: ${error}`);
          this.recordFlushError(error);
        } else {
          console.warn(`[observability] Optional OTEL flush failed: ${error}`);
        }
      });
    }, timeout);

    // Allow process to exit even if timer is pending
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Emit an OTEL event (non-blocking)
   * Returns immediately; queuing happens synchronously, export happens asynchronously
   */
  public emit(event: OtelEvent): void {
    if (!this.config.enabled) return;

    const maxSize = this.config.max_queue_size ?? 1000;

    // Drop oldest if queue is full (PRD §18.5: never block)
    if (this.queue.length >= maxSize) {
      this.queue.shift();
      console.warn(
        `[observability] OTEL queue full (${maxSize}), dropping oldest event`
      );
    }

    this.queue.push(event);

    // Auto-flush if batch size reached
    const batchSize = this.config.batch_size ?? 100;
    if (this.queue.length >= batchSize && !this.isShuttingDown) {
      this.flush().catch((error) => {
        if (this.config.required) {
          console.error(`[observability] CRITICAL: Required OTEL export failed: ${error}`);
          this.recordFlushError(error);
        } else {
          console.warn(`[observability] Optional OTEL export failed: ${error}`);
        }
      });
    }
  }

  /**
   * Flush queued events to OTEL HTTP endpoint
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    // Chain flushes to avoid concurrent exports
    this.flushPromise = this.flushPromise.then(() => this.doFlush());
    return this.flushPromise;
  }

  /**
   * Internal flush implementation
   * When required=true, throws error so it propagates; when false, logs and continues
   */
  private async doFlush(): Promise<void> {
    const events = this.queue.splice(0, this.config.batch_size ?? 100);
    if (events.length === 0) return;

    try {
      await this.exportEvents(events);
    } catch (error) {
      if (this.config.required) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[observability] CRITICAL: Required OTEL export failed: ${message}`);
        this.recordFlushError(error);
        this.queue.unshift(...events);
        throw new Error(`OTEL export required but failed: ${message}`);
      } else {
        console.warn(`[observability] Optional OTEL export failed: ${error}`);
      }
    }
  }

  /**
   * Export events to OTEL HTTP endpoint
   * This is the actual HTTP export logic
   */
  private async exportEvents(events: OtelEvent[]): Promise<void> {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [], // Could add resource attributes
          },
          scopeSpans: [
            {
              scope: {
                name: '@pictl/observability',
                version: '26.4.5',
              },
              spans: events.map((event) => ({
                traceId: event.trace_id,
                spanId: event.span_id,
                parentSpanId: event.parent_span_id,
                name: event.name,
                kind: event.kind ?? 'INTERNAL',
                startTimeUnixNano: event.start_time.toString(),
                endTimeUnixNano: (event.end_time ?? Date.now() * 1000000).toString(),
                status: event.status ?? { code: 'UNSET' },
                attributes: this.encodeAttributes(event.attributes),
                events: event.events?.map((evt) => ({
                  timeUnixNano: evt.timestamp.toString(),
                  name: evt.name,
                  attributes: this.encodeAttributes(evt.attributes ?? {}),
                })),
              })),
            },
          ],
        },
      ],
    };

    const timeout = this.config.timeout_ms ?? 5000;
    await this.sendToEndpoint(payload, timeout);
  }

  /**
   * Send payload to OTEL endpoint via HTTP POST
   */
  private async sendToEndpoint(
    payload: any,
    timeoutMs: number
  ): Promise<void> {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchPromise = fetch(this.getExportUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // Race fetch against abort signal so timeout always resolves
      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('OTEL export timed out'))
        );
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(
          `OTEL export failed with status ${response.status}: ${response.statusText}`
        );
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Get the correct OTEL export URL based on exporter type
   */
  private getExportUrl(): string {
    const endpoint = this.config.endpoint.replace(/\/$/, ''); // Remove trailing slash

    if (this.config.exporter === 'otlp_http') {
      return `${endpoint}/v1/traces`;
    } else if (this.config.exporter === 'otlp_grpc') {
      // For gRPC, we'd typically use a different client library
      // For now, return HTTP endpoint as fallback
      return `${endpoint}/v1/traces`;
    }

    throw new Error(`Unknown OTEL exporter: ${this.config.exporter}`);
  }

  /**
   * Encode attributes for OTEL format
   * OTEL uses typed attributes
   */
  private encodeAttributes(
    attrs: Record<string, any>
  ): Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }> {
    return Object.entries(attrs).map(([key, value]) => ({
      key,
      value: this.encodeValue(value),
    }));
  }

  /**
   * Encode a single attribute value
   */
  private encodeValue(
    value: any
  ): { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return { intValue: value.toString() };
      } else {
        return { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else {
      return { stringValue: JSON.stringify(value) };
    }
  }

  /**
   * Gracefully shutdown exporter
   * Flushes any remaining events
   * Throws if required=true and flush errors occurred
   */
  public async shutdown(): Promise<ObservabilityResult> {
    this.isShuttingDown = true;

    try {
      // Stop auto-flush timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }

      // Flush remaining events
      let lastError: Error | undefined;
      while (this.queue.length > 0) {
        try {
          await this.flush();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (!this.config.required) {
            console.warn(`[observability] Continuing shutdown despite optional OTEL error: ${error}`);
          }
        }
      }

      if (this.config.required && lastError) {
        return {
          success: false,
          error: `Required OTEL shutdown failed: ${lastError.message}`,
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
        timestamp: new Date(),
      };
    }
  }
}
