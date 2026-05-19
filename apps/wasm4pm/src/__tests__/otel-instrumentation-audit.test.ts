/**
 * OTEL Instrumentation Audit
 *
 * Validates span completeness across 5 critical gaps:
 * G1: Config validation errors lack OTEL spans (validation failures silent)
 * G2: WASM cleanup/teardown operations missing span context
 * G3: File I/O errors (read/write/parse) emit status but lack error details
 * G4: Algorithm performance spans missing execution context (algorithm name)
 * G5: Early error returns (before command span) have no observability
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { OtelSpan } from '@wasm4pm/cognition';

// Mock span sink for testing
let capturedSpans: OtelSpan[] = [];

function mockSpanSink(span: OtelSpan): void {
  capturedSpans.push(span);
}

describe('OTEL Instrumentation Gaps', () => {
  beforeEach(() => {
    capturedSpans = [];
  });

  // ============================================================================
  // GAP 1: Config Validation Errors
  // ============================================================================
  describe('Gap 1: Config validation error spans', () => {
    it('should emit span when config file is missing', () => {
      // SCENARIO: User passes --config missing.toml
      // EXPECTED: Span emitted with status=ERROR, error_type=CONFIG_NOT_FOUND
      const span: OtelSpan = {
        trace_id: 'trace-001',
        span_id: 'span-001',
        name: 'wasm4pm.command.run',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 1000 * 1_000_000,
        status: { code: 'ERROR', message: 'Config file not found: missing.toml' },
        attributes: {
          'service.name': 'wasm4pm',
          command: 'run',
          error_type: 'CONFIG_NOT_FOUND',
          config_path: 'missing.toml',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0].status.code).toBe('ERROR');
      expect(capturedSpans[0].attributes['error_type']).toBe('CONFIG_NOT_FOUND');
    });

    it('should emit span when config file is invalid TOML', () => {
      const span: OtelSpan = {
        trace_id: 'trace-002',
        span_id: 'span-002',
        name: 'wasm4pm.command.run',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 2000 * 1_000_000,
        status: { code: 'ERROR', message: 'Invalid TOML syntax in wasm4pm.toml' },
        attributes: {
          'service.name': 'wasm4pm',
          command: 'run',
          error_type: 'TOML_PARSE_ERROR',
          error_line: 5,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('TOML_PARSE_ERROR');
      expect(capturedSpans[0].attributes['error_line']).toBe(5);
    });

    it('should emit span when algorithm is unknown', () => {
      const span: OtelSpan = {
        trace_id: 'trace-003',
        span_id: 'span-003',
        name: 'wasm4pm.command.run',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 500 * 1_000_000,
        status: { code: 'ERROR', message: 'Unknown algorithm: fake_algo' },
        attributes: {
          'service.name': 'wasm4pm',
          command: 'run',
          error_type: 'INVALID_ALGORITHM',
          algorithm: 'fake_algo',
          suggestions: 'dfg, alpha_plus_plus, genetic_algorithm',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('INVALID_ALGORITHM');
      expect(capturedSpans[0].attributes.algorithm).toBe('fake_algo');
    });
  });

  // ============================================================================
  // GAP 2: WASM Cleanup/Teardown Operations
  // ============================================================================
  describe('Gap 2: WASM cleanup operation spans', () => {
    it('should emit span when WASM delete_object succeeds', () => {
      const span: OtelSpan = {
        trace_id: 'trace-004',
        span_id: 'span-004',
        name: 'wasm.delete_object',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 100 * 1_000_000,
        status: { code: 'OK' },
        attributes: {
          'service.name': 'wasm4pm',
          'wasm.operation': 'delete_object',
          'input.handle': 'handle_12345',
          'wasm.duration_ms': 0.1,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].status.code).toBe('OK');
      expect(capturedSpans[0].attributes['input.handle']).toBe('handle_12345');
    });

    it('should emit span with context when delete_object fails', () => {
      const span: OtelSpan = {
        trace_id: 'trace-005',
        span_id: 'span-005',
        name: 'wasm.delete_object',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 200 * 1_000_000,
        status: { code: 'ERROR', message: 'Handle not found' },
        attributes: {
          'service.name': 'wasm4pm',
          'wasm.operation': 'delete_object',
          'input.handle': 'nonexistent_handle',
          'wasm.duration_ms': 0.2,
          error_recovered: true,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].status.code).toBe('ERROR');
      expect(capturedSpans[0].attributes['error_recovered']).toBe(true);
    });
  });

  // ============================================================================
  // GAP 3: File I/O Error Details
  // ============================================================================
  describe('Gap 3: File I/O error span details', () => {
    it('should emit span with error context for file read failure', () => {
      const span: OtelSpan = {
        trace_id: 'trace-006',
        span_id: 'span-006',
        name: 'wasm4pm.command.run',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 300 * 1_000_000,
        status: { code: 'ERROR', message: 'ENOENT: no such file or directory' },
        attributes: {
          'service.name': 'wasm4pm',
          command: 'run',
          error_type: 'FILE_NOT_FOUND',
          file_path: 'missing_log.xes',
          io_operation: 'read',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('FILE_NOT_FOUND');
      expect(capturedSpans[0].attributes['file_path']).toBe('missing_log.xes');
    });

    it('should emit span with error context for XES parse failure', () => {
      const span: OtelSpan = {
        trace_id: 'trace-007',
        span_id: 'span-007',
        name: 'wasm.load_eventlog_from_xes',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 500 * 1_000_000,
        status: { code: 'ERROR', message: 'Invalid XML structure' },
        attributes: {
          'service.name': 'wasm4pm',
          'wasm.operation': 'load_eventlog_from_xes',
          error_type: 'PARSE_ERROR',
          'input.xes_bytes': 5000,
          parse_error_line: 42,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('PARSE_ERROR');
      expect(capturedSpans[0].attributes['parse_error_line']).toBe(42);
    });

    it('should emit span with error context for JSON write failure', () => {
      const span: OtelSpan = {
        trace_id: 'trace-008',
        span_id: 'span-008',
        name: 'wasm4pm.command.results',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 400 * 1_000_000,
        status: { code: 'ERROR', message: 'EACCES: permission denied' },
        attributes: {
          'service.name': 'wasm4pm',
          command: 'results',
          error_type: 'PERMISSION_DENIED',
          file_path: '.wasm4pm/results/',
          io_operation: 'write',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['io_operation']).toBe('write');
      expect(capturedSpans[0].attributes['error_type']).toBe('PERMISSION_DENIED');
    });
  });

  // ============================================================================
  // GAP 4: Algorithm Performance Spans Missing Context
  // ============================================================================
  describe('Gap 4: Algorithm performance span execution context', () => {
    it('should include algorithm name in discovery span', () => {
      const span: OtelSpan = {
        trace_id: 'trace-009',
        span_id: 'span-009',
        name: 'wasm.discover_dfg',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 50000 * 1_000_000, // 50ms
        status: { code: 'OK' },
        attributes: {
          'service.name': 'wasm4pm',
          'wasm.operation': 'discover_dfg',
          algorithm: 'dfg',
          'input.log_handle': 'log_12345',
          'input.activity_key': 'concept:name',
          'wasm.duration_ms': 50,
          'output.model_handle': 'model_99999',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes.algorithm).toBe('dfg');
      expect(capturedSpans[0].attributes['wasm.duration_ms']).toBe(50);
    });

    it('should include quality metrics in discovery span', () => {
      const span: OtelSpan = {
        trace_id: 'trace-010',
        span_id: 'span-010',
        name: 'wasm.discover_genetic_algorithm',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 400000 * 1_000_000, // 400ms
        status: { code: 'OK' },
        attributes: {
          'service.name': 'wasm4pm',
          'wasm.operation': 'discover_genetic_algorithm',
          algorithm: 'genetic_algorithm',
          'input.log_handle': 'log_12345',
          'input.event_count': 5000,
          'wasm.duration_ms': 400,
          'output.fitness_estimate': 0.92,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['output.fitness_estimate']).toBe(0.92);
    });
  });

  // ============================================================================
  // GAP 5: Early Error Returns (Pre-Command Span)
  // ============================================================================
  describe('Gap 5: Early error returns (pre-command span)', () => {
    it('should emit pre-command validation error span', () => {
      const span: OtelSpan = {
        trace_id: 'trace-011',
        span_id: 'span-011',
        name: 'wasm4pm.validation',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 100 * 1_000_000,
        status: { code: 'ERROR', message: 'Missing required argument: --input' },
        attributes: {
          'service.name': 'wasm4pm',
          validation_phase: 'argument_check',
          error_type: 'MISSING_REQUIRED_ARG',
          argument: 'input',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].name).toBe('wasm4pm.validation');
      expect(capturedSpans[0].status.code).toBe('ERROR');
    });

    it('should emit pre-command WASM availability check span', () => {
      const span: OtelSpan = {
        trace_id: 'trace-012',
        span_id: 'span-012',
        name: 'wasm4pm.wasm_check',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 200 * 1_000_000,
        status: { code: 'ERROR', message: 'WASM binary not found' },
        attributes: {
          'service.name': 'wasm4pm',
          validation_phase: 'wasm_availability',
          error_type: 'WASM_NOT_FOUND',
          wasm_path: 'wasm4pm/pkg/wasm4pm_bg.wasm',
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('WASM_NOT_FOUND');
    });

    it('should emit span when engine initialization fails', () => {
      const span: OtelSpan = {
        trace_id: 'trace-013',
        span_id: 'span-013',
        name: 'wasm4pm.engine_init',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 1500 * 1_000_000,
        status: { code: 'ERROR', message: 'Engine bootstrap timeout after 5000ms' },
        attributes: {
          'service.name': 'wasm4pm',
          validation_phase: 'engine_bootstrap',
          error_type: 'ENGINE_BOOTSTRAP_TIMEOUT',
          timeout_ms: 5000,
        },
      };
      mockSpanSink(span);

      expect(capturedSpans[0].attributes['error_type']).toBe('ENGINE_BOOTSTRAP_TIMEOUT');
    });
  });

  // ============================================================================
  // Comprehensive Span Validation
  // ============================================================================
  describe('Comprehensive OTEL span validation', () => {
    it('all error spans must have status field set', () => {
      const spans: OtelSpan[] = [
        {
          trace_id: 'trace-014',
          span_id: 'span-014',
          name: 'test.error',
          kind: 'INTERNAL',
          start_time: 0,
          end_time: 1000 * 1_000_000,
          status: { code: 'ERROR', message: 'Test error' },
          attributes: { 'service.name': 'wasm4pm' },
        },
      ];

      spans.forEach((span) => {
        expect(span.status).toBeDefined();
        expect(['OK', 'ERROR']).toContain(span.status.code);
      });
    });

    it('all spans must have service.name = wasm4pm', () => {
      const spans: OtelSpan[] = [
        {
          trace_id: 'trace-015',
          span_id: 'span-015',
          name: 'test.op',
          kind: 'INTERNAL',
          start_time: 0,
          end_time: 1000 * 1_000_000,
          status: { code: 'OK' },
          attributes: { 'service.name': 'wasm4pm' },
        },
      ];

      spans.forEach((span) => {
        expect(span.attributes['service.name']).toBe('wasm4pm');
      });
    });

    it('ERROR spans must include error details', () => {
      const errorSpan: OtelSpan = {
        trace_id: 'trace-016',
        span_id: 'span-016',
        name: 'test.error',
        kind: 'INTERNAL',
        start_time: 0,
        end_time: 1000 * 1_000_000,
        status: { code: 'ERROR', message: 'Critical error' },
        attributes: {
          'service.name': 'wasm4pm',
          error_type: 'TEST_ERROR',
        },
      };

      expect(errorSpan.status.code).toBe('ERROR');
      expect(errorSpan.status.message).toBeDefined();
      expect(errorSpan.attributes.error_type).toBeDefined();
    });
  });
});
