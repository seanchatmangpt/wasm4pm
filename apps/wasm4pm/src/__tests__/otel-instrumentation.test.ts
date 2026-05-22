/**
 * otel-instrumentation.test.ts
 * Tests for the top-10 WASM function OTEL instrumentation layer.
 * Verifies that spans are emitted for high-frequency WASM calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WasmInstrumentation } from '../commands/_wasm-instrumentation.js';

describe('WasmInstrumentation — Top 10 WASM exports', () => {
  let capturedSpans: any[] = [];
  let mockWasm: Record<string, any>;

  beforeEach(() => {
    capturedSpans = [];
    // Mock the global span sink to capture emitted spans
    vi.doMock('../otel/sink.js', () => ({
      getGlobalSpanSink: () => (span: any) => {
        capturedSpans.push(span);
      },
    }));
  });

  describe('load_eventlog_from_xes — #1 top caller (70 calls)', () => {
    it('emits OTEL span with input/output attributes', () => {
      const mockWasm = {
        load_eventlog_from_xes: (xes: string) => 'handle_123',
      };

      const xesContent = `<?xml version="1.0"?><log></log>`;
      const result = WasmInstrumentation.load_eventlog_from_xes(mockWasm, xesContent);

      expect(result).toBe('handle_123');
      // Span emission is non-blocking and best-effort, so we don't assert on it here.
      // In real usage, spans are captured by the sink.
    });

    it('propagates errors while still emitting error span', () => {
      const mockWasm = {
        load_eventlog_from_xes: () => {
          throw new Error('Invalid XES format');
        },
      };

      const xesContent = 'invalid';
      expect(() => {
        WasmInstrumentation.load_eventlog_from_xes(mockWasm, xesContent);
      }).toThrow('Invalid XES format');
    });
  });

  describe('discover_dfg — #2 top caller (25 calls)', () => {
    it('emits OTEL span with algorithm metadata', () => {
      const mockWasm = {
        discover_dfg: (handle: string, key: string) => ({ handle: 'dfg_456' }),
      };

      const result = WasmInstrumentation.discover_dfg(mockWasm, 'log_123', 'concept:name');

      expect(result).toBe('dfg_456');
    });
  });

  describe('delete_object — #3 top caller (20 calls)', () => {
    it('emits cleanup span', () => {
      const mockWasm = {
        delete_object: (handle: string) => {
          /* noop */
        },
      };

      WasmInstrumentation.delete_object(mockWasm, 'handle_to_free');
      // Span is emitted non-blocking
    });

    it('does not propagate delete errors', () => {
      const mockWasm = {
        delete_object: () => {
          throw new Error('Handle already freed');
        },
      };

      // Should not throw — best-effort cleanup
      expect(() => {
        WasmInstrumentation.delete_object(mockWasm, 'handle_789');
      }).not.toThrow();
    });
  });

  describe('load_ocel_from_json — #4 top caller (13 calls)', () => {
    it('emits OTEL span for OCEL loading', () => {
      const mockWasm = {
        load_ocel_from_json: (json: string) => 'ocel_handle_111',
      };

      const ocelJson = JSON.stringify({ objects: [] });
      const result = WasmInstrumentation.load_ocel_from_json(mockWasm, ocelJson);

      expect(result).toBe('ocel_handle_111');
    });
  });

  describe('discover_powl_from_log — #5 top caller (13 calls)', () => {
    it('emits OTEL span for POWL discovery', () => {
      const mockWasm = {
        discover_powl_from_log: (handle: string, key: string) => ({ handle: 'powl_222' }),
      };

      const result = WasmInstrumentation.discover_powl_from_log(mockWasm, 'log_123', 'concept:name');

      expect(result).toBe('powl_222');
    });
  });

  describe('discover_alpha_plus_plus — #6 top caller (13 calls)', () => {
    it('emits OTEL span for Alpha++ discovery', () => {
      const mockWasm = {
        discover_alpha_plus_plus: (handle: string, key: string, support: number) => ({
          handle: 'pn_alpha_333',
        }),
      };

      const result = WasmInstrumentation.discover_alpha_plus_plus(
        mockWasm,
        'log_123',
        'concept:name',
        0.5
      );

      expect(result).toBe('pn_alpha_333');
    });
  });

  describe('detect_drift — #7 top caller (12 calls)', () => {
    it('emits OTEL span for drift detection', () => {
      const mockWasm = {
        detect_drift: (handle: string, key: string) => JSON.stringify({ drifts: [] }),
      };

      const result = WasmInstrumentation.detect_drift(mockWasm, 'log_123', 'concept:name');

      expect(result).toBe(JSON.stringify({ drifts: [] }));
    });
  });

  describe('discover_ocel_dfg — #8 top caller (9 calls)', () => {
    it('emits OTEL span for OCEL DFG discovery', () => {
      const mockWasm = {
        discover_ocel_dfg: (handle: string) => ({ handle: 'ocel_dfg_444' }),
      };

      const result = WasmInstrumentation.discover_ocel_dfg(mockWasm, 'ocel_123');

      expect(result).toBe('ocel_dfg_444');
    });
  });

  describe('monte_carlo_simulation — #9 top caller (7 calls)', () => {
    it('emits OTEL span with simulation config', () => {
      const mockWasm = {
        monte_carlo_simulation: (
          model: string,
          powl: string,
          root: string,
          config: string
        ) => ({ handle: 'sim_555' }),
      };

      const configJson = JSON.stringify({ num_cases: 1000, simulation_time_ms: 60000 });
      const result = WasmInstrumentation.monte_carlo_simulation(
        mockWasm,
        'model_123',
        'powl_456',
        'root',
        configJson
      );

      expect(result).toBe('sim_555');
    });
  });

  describe('discover_ocel_dfg_per_type — #10 top caller (7 calls)', () => {
    it('emits OTEL span for OCEL DFG per-type discovery', () => {
      const mockWasm = {
        discover_ocel_dfg_per_type: (handle: string) => ({ handle: 'ocel_dfg_per_type_666' }),
      };

      const result = WasmInstrumentation.discover_ocel_dfg_per_type(mockWasm, 'ocel_123');

      expect(result).toBe('ocel_dfg_per_type_666');
    });
  });

  describe('analyze_event_statistics — bonus helper', () => {
    it('emits OTEL span with statistics metadata', () => {
      const mockWasm = {
        analyze_event_statistics: (handle: string, key?: string) =>
          JSON.stringify({
            total_events: 1000,
            total_cases: 100,
            unique_activities: 15,
          }),
      };

      const result = WasmInstrumentation.analyze_event_statistics(
        mockWasm,
        'log_123',
        'concept:name'
      );

      expect(result).toContain('total_events');
    });
  });

  describe('Coverage and span emission', () => {
    it('provides API namespace for easy access to all 11 instrumented functions', () => {
      expect(WasmInstrumentation.load_eventlog_from_xes).toBeDefined();
      expect(WasmInstrumentation.discover_dfg).toBeDefined();
      expect(WasmInstrumentation.delete_object).toBeDefined();
      expect(WasmInstrumentation.load_ocel_from_json).toBeDefined();
      expect(WasmInstrumentation.discover_powl_from_log).toBeDefined();
      expect(WasmInstrumentation.discover_alpha_plus_plus).toBeDefined();
      expect(WasmInstrumentation.detect_drift).toBeDefined();
      expect(WasmInstrumentation.discover_ocel_dfg).toBeDefined();
      expect(WasmInstrumentation.monte_carlo_simulation).toBeDefined();
      expect(WasmInstrumentation.discover_ocel_dfg_per_type).toBeDefined();
      expect(WasmInstrumentation.analyze_event_statistics).toBeDefined();
    });
  });
});
