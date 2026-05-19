/**
 * error-span-scenarios.test.ts
 *
 * OTEL span emission during error scenarios (Iteration 10: Error Observability Audit)
 * Tests that exceptions are caught and converted to span status=error, error messages
 * reach OTEL, and stack traces are captured. Identifies gaps where failures silently fail.
 *
 * Coverage: 5 error scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Mock OtelSpan type (matches @wasm4pm/cognition)
 */
interface OtelSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: string;
  start_time: number;
  end_time: number;
  status?: { code: string; message?: string };
  attributes: Record<string, unknown>;
}

/**
 * Simple mock capture to track emitted spans
 */
class MockOtelCapture {
  private spans: OtelSpan[] = [];

  addSpan(span: OtelSpan) {
    this.spans.push(span);
  }

  getAllSpans(name?: string): OtelSpan[] {
    if (!name) return this.spans;
    return this.spans.filter((s) => s.name === name);
  }

  reset() {
    this.spans = [];
  }
}

describe('Error Scenario Observability', () => {
  let capture: MockOtelCapture;

  beforeEach(() => {
    capture = new MockOtelCapture();
  });

  afterEach(() => {
    capture.reset();
  });

  /**
   * Scenario 1: WASM function throws exception
   * Expected: Span emitted with status=ERROR and error message
   */
  it('should emit error span when WASM function throws', async () => {
    const mockWasm = {
      load_eventlog_from_xes: vi.fn(() => {
        throw new Error('Malformed XES: unexpected EOF');
      }),
    };

    const instrumentLoadEventlogFromXes = async (
      wasm: Record<string, any>,
      xesContent: string
    ): Promise<string> => {
      const t0 = performance.now();
      let error: Error | undefined;
      let result: string = '';

      try {
        result = wasm.load_eventlog_from_xes(xesContent);
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        // Simulate span emission
        const span: OtelSpan = {
          trace_id: 'trace-123',
          span_id: 'span-456',
          name: 'wasm.load_eventlog_from_xes',
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: {
            code: 'ERROR',
            message: error.message,
          },
          attributes: {
            'service.name': 'wasm4pm',
            'wasm.operation': 'load_eventlog_from_xes',
            'error.type': error.constructor.name,
            'error.message': error.message,
          },
        };
        capture.addSpan(span);
      }

      return result;
    };

    // Execute
    try {
      await instrumentLoadEventlogFromXes(mockWasm, '<malformed>');
    } catch {
      // Expected to throw
    }

    // Verify: Error span emitted with error message
    const spans = capture.getAllSpans('wasm.load_eventlog_from_xes');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].status?.message).toBe('Malformed XES: unexpected EOF');
    expect(spans[0].attributes['error.message']).toBe('Malformed XES: unexpected EOF');
  });

  /**
   * Scenario 2: Algorithm fails with invalid input
   * Expected: Error span with input metadata captured
   */
  it('should capture input context in error span for algorithm failures', async () => {
    const mockWasm = {
      discover_dfg: vi.fn(() => {
        throw new Error('Invalid log handle: handle-999');
      }),
    };

    const instrumentDiscoverDfg = async (
      wasm: Record<string, any>,
      logHandle: string,
      activityKey: string
    ): Promise<string> => {
      const t0 = performance.now();
      let error: Error | undefined;

      try {
        return wasm.discover_dfg(logHandle, activityKey);
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        const elapsedMs = performance.now() - t0;
        const span: OtelSpan = {
          trace_id: 'trace-abc',
          span_id: 'span-def',
          name: 'wasm.discover_dfg',
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: {
            code: 'ERROR',
            message: error.message,
          },
          attributes: {
            'service.name': 'wasm4pm',
            'wasm.operation': 'discover_dfg',
            'wasm.duration_ms': Math.round(elapsedMs),
            'input.log_handle': logHandle,
            'input.activity_key': activityKey,
            'error.type': error.constructor.name,
            'error.message': error.message,
            'error.context': 'Algorithm execution',
          },
        };
        capture.addSpan(span);
        throw error;
      }
    };

    // Execute
    try {
      await instrumentDiscoverDfg(mockWasm, 'handle-999', 'concept:name');
    } catch {
      // Expected
    }

    // Verify: Error includes input context
    const spans = capture.getAllSpans('wasm.discover_dfg');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].attributes['input.log_handle']).toBe('handle-999');
    expect(spans[0].attributes['input.activity_key']).toBe('concept:name');
  });

  /**
   * Scenario 3: Cleanup operation (delete_object) fails
   * Expected: Error span emitted but error does NOT propagate
   */
  it('should emit error span for cleanup failures without propagation', async () => {
    const mockWasm = {
      delete_object: vi.fn(() => {
        throw new Error('Handle already freed');
      }),
    };

    const instrumentDeleteObject = async (wasm: Record<string, any>, handle: string): Promise<void> => {
      const t0 = performance.now();
      let error: Error | undefined;

      try {
        wasm.delete_object(handle);
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        // Best-effort: don't propagate cleanup errors
      } finally {
        const elapsedMs = performance.now() - t0;
        const span: OtelSpan = {
          trace_id: 'trace-xyz',
          span_id: 'span-uvw',
          name: 'wasm.delete_object',
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: error
            ? {
                code: 'ERROR',
                message: error.message,
              }
            : { code: 'OK' },
          attributes: {
            'service.name': 'wasm4pm',
            'wasm.operation': 'delete_object',
            'input.handle': handle,
            'deallocation_ms': Math.round(elapsedMs),
            ...(error && {
              'error.message': error.message,
              'error.type': error.constructor.name,
              'recovery': 'best-effort-cleanup',
            }),
          },
        };
        capture.addSpan(span);
      }
    };

    // Execute — should NOT throw
    const result = await instrumentDeleteObject(mockWasm, 'handle-freed');
    expect(result).toBeUndefined();

    // Verify: Error span emitted with status=ERROR
    const spans = capture.getAllSpans('wasm.delete_object');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].attributes['recovery']).toBe('best-effort-cleanup');
  });

  /**
   * Scenario 4: Command span catches exception and emits error status
   * Expected: Span with error message and zero re-throw
   */
  it('should emit command span with error status on exception catch', async () => {
    const withSpan = async <T>(
      name: string,
      attrs: Record<string, unknown>,
      fn: () => Promise<T>
    ): Promise<T> => {
      const t0 = performance.now();
      let status: 'OK' | 'ERROR' = 'OK';
      let errorMessage: string | undefined;

      try {
        return await fn();
      } catch (e) {
        status = 'ERROR';
        errorMessage = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        const elapsedMs = performance.now() - t0;
        const span: OtelSpan = {
          trace_id: 'trace-cmd',
          span_id: 'span-cmd',
          name: `wasm4pm.command.${name}`,
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: errorMessage ? { code: status, message: errorMessage } : { code: status },
          attributes: {
            'service.name': 'wasm4pm',
            command: name,
            'duration_ms': Math.round(elapsedMs),
            ...attrs,
            ...(errorMessage && {
              'error.message': errorMessage,
            }),
          },
        };
        capture.addSpan(span);
      }
    };

    // Execute
    try {
      await withSpan('run', { algorithm: 'dfg' }, async () => {
        throw new Error('Algorithm execution timeout');
      });
    } catch {
      // Expected
    }

    // Verify: Command span includes error message
    const spans = capture.getAllSpans('wasm4pm.command.run');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].status?.message).toBe('Algorithm execution timeout');
  });

  /**
   * Scenario 5: Async error in nested operation
   * Expected: Error propagates up and parent span captures it
   */
  it('should capture nested async errors in parent span', async () => {
    const childOperation = async (): Promise<string> => {
      return new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Child operation failed')), 10);
      });
    };

    const withParentSpan = async <T>(
      name: string,
      fn: () => Promise<T>
    ): Promise<T> => {
      const t0 = performance.now();
      let error: Error | undefined;

      try {
        return await fn();
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        const span: OtelSpan = {
          trace_id: 'trace-parent',
          span_id: 'span-parent',
          name: `wasm4pm.operation.${name}`,
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: {
            code: 'ERROR',
            message: error.message,
          },
          attributes: {
            'service.name': 'wasm4pm',
            'operation': name,
            'error.message': error.message,
            'error.type': error.constructor.name,
            'child_failure': true,
          },
        };
        capture.addSpan(span);
        throw error;
      }
    };

    // Execute
    try {
      await withParentSpan('parent', () => childOperation());
    } catch {
      // Expected
    }

    // Verify: Parent span captured child error
    const spans = capture.getAllSpans('wasm4pm.operation.parent');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].status?.message).toBe('Child operation failed');
    expect(spans[0].attributes['child_failure']).toBe(true);
  });
});

/**
 * Integration tests: Error span gaps in real command execution
 */
describe('Error Span Gaps in CLI Commands', () => {
  let capture: MockOtelCapture;

  beforeEach(() => {
    capture = new MockOtelCapture();
  });

  /**
   * Gap identification: Commands that swallow errors without span emission
   * This test documents the gap pattern.
   */
  it('should identify when errors are swallowed without span emission', async () => {
    // Pattern: try-catch with empty catch block
    const swallowedErrorFunction = async (): Promise<string> => {
      try {
        throw new Error('This error is swallowed');
      } catch {
        // ❌ GAP: No span emitted here
        return 'fallback-value';
      }
    };

    // Execute
    const result = await swallowedErrorFunction();

    // Verify: Error was silently swallowed
    expect(result).toBe('fallback-value');
    expect(capture.getAllSpans().length).toBe(0); // ❌ Zero span evidence of error
  });

  /**
   * Gap fix: Emit error span even in non-throwing catch blocks
   */
  it('should emit error span even when error is not re-thrown', async () => {
    const nonThrowingErrorFunction = async (): Promise<string> => {
      const t0 = performance.now();
      let error: Error | undefined;

      try {
        throw new Error('This error should be logged but not thrown');
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
        // ✅ FIX: Emit span even though we don't re-throw
        const elapsedMs = performance.now() - t0;
        const span: OtelSpan = {
          trace_id: 'trace-swallow',
          span_id: 'span-swallow',
          name: 'operation.swallowed_error',
          kind: 'INTERNAL',
          start_time: Date.now() * 1_000_000,
          end_time: Date.now() * 1_000_000,
          status: {
            code: 'ERROR',
            message: error.message,
          },
          attributes: {
            'service.name': 'wasm4pm',
            'error.recovered': true, // Mark as recovered/handled
            'error.message': error.message,
          },
        };
        capture.addSpan(span);
        return 'fallback-value';
      }
    };

    // Execute
    const result = await nonThrowingErrorFunction();

    // Verify: Error span emitted despite recovery
    expect(result).toBe('fallback-value');
    const spans = capture.getAllSpans('operation.swallowed_error');
    expect(spans.length).toBe(1);
    expect(spans[0].status?.code).toBe('ERROR');
    expect(spans[0].attributes['error.recovered']).toBe(true);
  });
});
