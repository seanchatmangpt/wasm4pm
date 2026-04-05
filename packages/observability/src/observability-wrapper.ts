/**
 * Observability wrapper for safe event emission
 * Ensures observability errors never break execution
 * Per PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */

import { ObservabilityLayer } from './observability.js';
import { SecretRedaction } from './secret-redaction.js';
import {
  CliEvent,
  JsonEvent,
  OtelEvent,
  ObservabilityConfig,
  ObservabilityResult,
} from './types.js';

/**
 * Result of a safe emit operation
 */
export interface SafeEmitResult {
  success: boolean;
  error?: {
    layer: 'cli' | 'json' | 'otel';
    message: string;
  };
}

/**
 * Observability wrapper that ensures non-blocking behavior
 * Catches and logs errors without breaking execution
 */
export class ObservabilityWrapper {
  private layer: ObservabilityLayer;
  private errors: Array<{ timestamp: Date; layer: string; message: string }> = [];
  private emitCount = 0;
  private errorCount = 0;

  constructor(config: ObservabilityConfig = {}) {
    this.layer = new ObservabilityLayer(config);
  }

  /**
   * Safe CLI emit - never throws
   */
  public emitCliSafe(event: CliEvent): SafeEmitResult {
    try {
      this.layer.emitCli(event);
      this.emitCount++;
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError('cli', message);
      return {
        success: false,
        error: { layer: 'cli', message },
      };
    }
  }

  /**
   * Safe JSON emit - never throws
   */
  public emitJsonSafe(event: JsonEvent): SafeEmitResult {
    try {
      const redactedEvent = {
        ...event,
        data: SecretRedaction.redactObject(event.data),
      };
      this.layer.emitJson(redactedEvent);
      this.emitCount++;
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError('json', message);
      return {
        success: false,
        error: { layer: 'json', message },
      };
    }
  }

  /**
   * Safe OTEL emit - never throws
   */
  public emitOtelSafe(event: OtelEvent): SafeEmitResult {
    try {
      const redactedEvent = {
        ...event,
        attributes: SecretRedaction.redactObject(event.attributes),
      };
      this.layer.emitOtel(redactedEvent);
      this.emitCount++;
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError('otel', message);
      return {
        success: false,
        error: { layer: 'otel', message },
      };
    }
  }

  /**
   * Safe multi-layer emit
   */
  public emitSafe(event: {
    cli?: CliEvent;
    json?: JsonEvent;
    otel?: OtelEvent;
  }): SafeEmitResult[] {
    const results: SafeEmitResult[] = [];

    if (event.cli) {
      results.push(this.emitCliSafe(event.cli));
    }

    if (event.json) {
      results.push(this.emitJsonSafe(event.json));
    }

    if (event.otel) {
      results.push(this.emitOtelSafe(event.otel));
    }

    return results;
  }

  /**
   * Execute a callback with observability error handling
   * Returns callback result; observability errors don't break execution
   */
  public async executeWithObservability<T>(
    callback: () => Promise<T>,
    context?: { operationName?: string; traceId?: string }
  ): Promise<{ result: T; observabilityError?: string }> {
    try {
      const result = await callback();
      return { result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError('execution', message);

      return {
        result: undefined as unknown as T,
        observabilityError: `Failed during ${context?.operationName || 'operation'}: ${message}`,
      };
    }
  }

  /**
   * Wrap a synchronous function with error handling
   */
  public wrapSync<T>(
    callback: () => T,
    context?: { operationName?: string }
  ): { result?: T; error?: string } {
    try {
      const result = callback();
      return { result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError('sync', message);

      return {
        error: `Failed during ${context?.operationName || 'operation'}: ${message}`,
      };
    }
  }

  /**
   * Record an observability error
   */
  private recordError(layer: string, message: string): void {
    this.errorCount++;
    this.errors.push({
      timestamp: new Date(),
      layer,
      message,
    });

    // Keep only last 100 errors to avoid memory bloat
    if (this.errors.length > 100) {
      this.errors.shift();
    }

    // Log to console but don't break execution
    console.debug(`[observability-wrapper] Error in ${layer} layer: ${message}`);
  }

  /**
   * Get observability errors that occurred
   */
  public getErrors(): Array<{ timestamp: Date; layer: string; message: string }> {
    return [...this.errors];
  }

  /**
   * Get observability statistics
   */
  public getStats(): {
    emitCount: number;
    errorCount: number;
    errorRate: number;
  } {
    return {
      emitCount: this.emitCount,
      errorCount: this.errorCount,
      errorRate: this.emitCount > 0 ? this.errorCount / this.emitCount : 0,
    };
  }

  /**
   * Clear error history
   */
  public clearErrors(): void {
    this.errors = [];
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<ObservabilityResult> {
    try {
      return await this.layer.shutdown();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Shutdown failed: ${message}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get underlying observability layer
   */
  public getLayer(): ObservabilityLayer {
    return this.layer;
  }
}
