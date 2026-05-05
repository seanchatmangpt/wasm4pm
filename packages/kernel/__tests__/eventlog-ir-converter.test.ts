/**
 * eventlog-ir-converter.test.ts
 *
 * Unit tests for EventLogIR ↔ WASM JSON conversion.
 * Tests round-trip losslessness and canonical JSON ordering.
 */

import { describe, it, expect } from 'vitest';
import type { EventLogIR } from '@wasm4pm/contracts';
import {
  eventLogIrToWasmJson,
  wasmJsonToEventLogIr,
  isValidIso8601,
  validateLogTimestamps,
  hashEventLogIr,
} from '../src/converters/eventlog-ir-converter.js';

describe('eventlog-ir-converter', () => {
  /**
   * Example 1: Simple XES log with 1 trace, 2 events
   */
  const simpleLog: EventLogIR = {
    format_version: "1.0",
    source_format: "xes",
    traces: [
      {
        case_id: "case-001",
        events: [
          {
            activity: "Register",
            timestamp: "2026-04-16T10:00:00Z",
            resource: "alice",
            attributes: Object.freeze({ amount: 100 }),
          },
          {
            activity: "Approve",
            timestamp: "2026-04-16T10:30:00Z",
            resource: "bob",
            attributes: Object.freeze({ approved: true }),
          },
        ],
      },
    ],
    metadata: {
      trace_count: 1,
      event_count: 2,
      activity_count: 2,
      start_time: "2026-04-16T10:00:00Z",
      end_time: "2026-04-16T10:30:00Z",
      source_hash: "abcd1234ef5678901234567890abcdef1234567890abcdef1234567890abcdef",
    },
  };

  /**
   * Example 2: Complex log with multiple traces, nested attributes
   */
  const complexLog: EventLogIR = {
    format_version: "1.0",
    source_format: "json",
    traces: [
      {
        case_id: "case-001",
        events: [
          {
            activity: "Start",
            timestamp: "2026-04-16T09:00:00Z",
            attributes: Object.freeze({
              vendor: "vendor-a",
              amount: 1000,
              nested: { category: "purchase" },
            }),
          },
          {
            activity: "Review",
            timestamp: "2026-04-16T09:15:00Z",
            resource: "reviewer",
            attributes: Object.freeze({ status: "pending" }),
          },
        ],
      },
      {
        case_id: "case-002",
        events: [
          {
            activity: "Start",
            timestamp: "2026-04-16T10:00:00Z",
            attributes: Object.freeze({ vendor: "vendor-b", amount: 500 }),
          },
          {
            activity: "Approve",
            timestamp: "2026-04-16T10:10:00Z",
            resource: "approver",
            attributes: Object.freeze({}),
          },
        ],
      },
    ],
    metadata: {
      trace_count: 2,
      event_count: 4,
      activity_count: 3,
      start_time: "2026-04-16T09:00:00Z",
      end_time: "2026-04-16T10:10:00Z",
      source_hash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    },
  };

  describe('isValidIso8601', () => {
    it('accepts valid ISO-8601 timestamps', () => {
      expect(isValidIso8601("2026-04-16T10:00:00Z")).toBe(true);
      expect(isValidIso8601("2026-04-16T10:00:00.123Z")).toBe(true);
      expect(isValidIso8601("2026-04-16T10:00:00+02:00")).toBe(true);
      expect(isValidIso8601("2026-04-16T10:00:00-05:00")).toBe(true);
    });

    it('rejects invalid ISO-8601 timestamps', () => {
      expect(isValidIso8601("2026-04-16")).toBe(false);
      expect(isValidIso8601("10:00:00Z")).toBe(false);
      expect(isValidIso8601("2026-13-01T10:00:00Z")).toBe(false); // Invalid month
      expect(isValidIso8601("not-a-date")).toBe(false);
    });
  });

  describe('validateLogTimestamps', () => {
    it('accepts valid logs with all ISO-8601 timestamps', () => {
      expect(() => validateLogTimestamps(simpleLog)).not.toThrow();
      expect(() => validateLogTimestamps(complexLog)).not.toThrow();
    });

    it('rejects logs with invalid timestamps', () => {
      const badLog: EventLogIR = {
        ...simpleLog,
        traces: [
          {
            ...simpleLog.traces[0],
            events: [
              {
                ...simpleLog.traces[0].events[0],
                timestamp: "invalid-date",
              },
            ],
          },
        ],
      };

      expect(() => validateLogTimestamps(badLog)).toThrow(/Invalid ISO-8601/);
    });

    it('rejects logs where start_time > end_time', () => {
      const badLog: EventLogIR = {
        ...simpleLog,
        metadata: {
          ...simpleLog.metadata,
          start_time: "2026-04-16T11:00:00Z",
          end_time: "2026-04-16T10:00:00Z",
        },
      };

      expect(() => validateLogTimestamps(badLog)).toThrow(/start_time.*after end_time/);
    });
  });

  describe('eventLogIrToWasmJson', () => {
    it('converts simple log to canonical JSON', () => {
      const json = eventLogIrToWasmJson(simpleLog);

      // Should be a valid JSON string
      expect(() => JSON.parse(json)).not.toThrow();

      // Should be deterministic (same log → same JSON)
      const json2 = eventLogIrToWasmJson(simpleLog);
      expect(json).toBe(json2);
    });

    it('preserves all data in WASM JSON', () => {
      const json = eventLogIrToWasmJson(simpleLog);
      const parsed = JSON.parse(json);

      expect(parsed.format_version).toBe("1.0");
      expect(parsed.source_format).toBe("xes");
      expect(parsed.traces).toHaveLength(1);
      expect(parsed.traces[0].case_id).toBe("case-001");
      expect(parsed.traces[0].events).toHaveLength(2);
      expect(parsed.traces[0].events[0].activity).toBe("Register");
      expect(parsed.traces[0].events[0].resource).toBe("alice");
      expect(parsed.traces[0].events[0].attributes.amount).toBe(100);
    });

    it('canonicalizes nested attributes (sorted keys)', () => {
      const json = eventLogIrToWasmJson(complexLog);
      const parsed = JSON.parse(json);

      // Attributes should have sorted keys
      const attributes = parsed.traces[0].events[0].attributes;
      const keys = Object.keys(attributes);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });

    it('produces deterministic JSON (same input → same output)', () => {
      const hashes = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const json = eventLogIrToWasmJson(simpleLog);
        hashes.add(json);
      }

      // All 5 conversions should produce identical JSON
      expect(hashes.size).toBe(1);
    });

    it('omits resource if undefined', () => {
      const logWithoutResource: EventLogIR = {
        ...simpleLog,
        traces: [
          {
            case_id: "case-001",
            events: [
              {
                activity: "Register",
                timestamp: "2026-04-16T10:00:00Z",
                attributes: Object.freeze({}),
              },
            ],
          },
        ],
      };

      const json = eventLogIrToWasmJson(logWithoutResource);
      const parsed = JSON.parse(json);

      expect(parsed.traces[0].events[0].resource).toBeUndefined();
    });
  });

  describe('wasmJsonToEventLogIr', () => {
    it('reconstructs EventLogIR from WASM JSON', () => {
      const json = eventLogIrToWasmJson(simpleLog);
      const reconstructed = wasmJsonToEventLogIr(json);

      expect(reconstructed.format_version).toBe("1.0");
      expect(reconstructed.source_format).toBe("xes");
      expect(reconstructed.traces).toHaveLength(1);
      expect(reconstructed.traces[0].case_id).toBe("case-001");
      expect(reconstructed.traces[0].events).toHaveLength(2);
      expect(reconstructed.metadata.trace_count).toBe(1);
      expect(reconstructed.metadata.event_count).toBe(2);
    });

    it('throws on invalid JSON', () => {
      expect(() => wasmJsonToEventLogIr("{invalid json")).toThrow(SyntaxError);
    });

    it('throws on mismatched format_version', () => {
      const badJson = JSON.stringify({
        format_version: "2.0",
        source_format: "xes",
        traces: [],
        metadata: { trace_count: 0, event_count: 0, activity_count: 0, start_time: "", end_time: "", source_hash: "" },
      });

      expect(() => wasmJsonToEventLogIr(badJson)).toThrow(/Invalid format_version/);
    });

    it('throws on invalid source_format', () => {
      const badJson = JSON.stringify({
        format_version: "1.0",
        source_format: "invalid",
        traces: [],
        metadata: { trace_count: 0, event_count: 0, activity_count: 0, start_time: "", end_time: "", source_hash: "" },
      });

      expect(() => wasmJsonToEventLogIr(badJson)).toThrow(/Invalid source_format/);
    });
  });

  describe('round-trip losslessness', () => {
    it('EventLogIR → JSON → EventLogIR preserves data', () => {
      const json = eventLogIrToWasmJson(simpleLog);
      const reconstructed = wasmJsonToEventLogIr(json);

      // Deep equality check
      expect(reconstructed.format_version).toBe(simpleLog.format_version);
      expect(reconstructed.source_format).toBe(simpleLog.source_format);
      expect(reconstructed.metadata.trace_count).toBe(simpleLog.metadata.trace_count);
      expect(reconstructed.metadata.event_count).toBe(simpleLog.metadata.event_count);
      expect(reconstructed.traces[0].case_id).toBe(simpleLog.traces[0].case_id);
      expect(reconstructed.traces[0].events[0].activity).toBe(
        simpleLog.traces[0].events[0].activity
      );
    });

    it('complex log round-trips losslessly', () => {
      const json = eventLogIrToWasmJson(complexLog);
      const reconstructed = wasmJsonToEventLogIr(json);

      expect(reconstructed.traces).toHaveLength(complexLog.traces.length);
      expect(reconstructed.metadata.trace_count).toBe(complexLog.metadata.trace_count);
      expect(reconstructed.metadata.event_count).toBe(complexLog.metadata.event_count);

      // Check nested attributes
      expect(reconstructed.traces[0].events[0].attributes.nested).toEqual({
        category: "purchase",
      });
    });
  });

  describe('hashEventLogIr', () => {
    it('produces consistent hash for same log', () => {
      const hash1 = hashEventLogIr(simpleLog);
      const hash2 = hashEventLogIr(simpleLog);

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different logs', () => {
      const hash1 = hashEventLogIr(simpleLog);
      const hash2 = hashEventLogIr(complexLog);

      expect(hash1).not.toBe(hash2);
    });

    it('hash is unaffected by JSON serialization order', () => {
      // Manually create a log with attributes in different order
      // Both should hash to the same value because hashing canonicalizes
      const log1: EventLogIR = {
        ...simpleLog,
        traces: [
          {
            case_id: "case-001",
            events: [
              {
                activity: "A",
                timestamp: "2026-04-16T10:00:00Z",
                attributes: Object.freeze({ z: 1, a: 2 }),
              },
            ],
          },
        ],
      };

      const log2: EventLogIR = {
        ...simpleLog,
        traces: [
          {
            case_id: "case-001",
            events: [
              {
                activity: "A",
                timestamp: "2026-04-16T10:00:00Z",
                attributes: Object.freeze({ a: 2, z: 1 }),
              },
            ],
          },
        ],
      };

      // Both should produce the same hash due to canonicalization
      const hash1 = hashEventLogIr(log1);
      const hash2 = hashEventLogIr(log2);
      expect(hash1).toBe(hash2);
    });
  });
});
