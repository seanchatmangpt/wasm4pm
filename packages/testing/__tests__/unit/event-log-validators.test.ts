/**
 * Unit tests for event log validators
 */

import { describe, it, expect } from 'vitest';
import {
  validateXES,
  validateCSV,
  validateEventLog,
  validateTimestampOrdering,
  validateTraceCompleteness,
  validateNoDuplicates,
  type EventLogSchema,
} from '@pictl/testing';

describe('Event Log Validators', () => {
  // Skip XES tests in Node.js (DOMParser is browser-only)
  const describeIf = typeof DOMParser !== 'undefined' ? describe : describe.skip;

  describeIf('validateXES', () => {
    const validXES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00.000+00:00"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00.000+00:00"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-01-01T11:00:00.000+00:00"/>
    </event>
  </trace>
</log>`;

    it('should validate correct XES', () => {
      const result = validateXES(validXES);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid XML', () => {
      const result = validateXES('not xml');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject XES with wrong root element', () => {
      const result = validateXES('<notlog></notlog>');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Root element'))).toBe(true);
    });

    it('should warn about missing concept:name in events', () => {
      const xesWithoutNames = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <event>
      <date key="time:timestamp" value="2026-01-01T09:00:00.000+00:00"/>
    </event>
  </trace>
</log>`;
      const result = validateXES(xesWithoutNames);
      expect(result.warnings.some(w => w.message.includes('concept:name'))).toBe(true);
    });
  });

  describe('validateCSV', () => {
    const validCSV = `case_id,activity,timestamp,resource
case-1,A,2026-01-01T09:00:00Z,resource-1
case-1,B,2026-01-01T10:00:00Z,resource-2
case-2,A,2026-01-01T11:00:00Z,resource-1`;

    it('should validate correct CSV', () => {
      const result = validateCSV(validCSV);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require case_id and activity columns', () => {
      const result = validateCSV('wrong,col\nval1,val2');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('case_id'))).toBe(true);
    });

    it('should warn about missing timestamp column', () => {
      const result = validateCSV('case_id,activity\ncase-1,A');
      expect(result.warnings.some(w => w.message.includes('timestamp'))).toBe(true);
    });

    it('should validate timestamp format', () => {
      const csvWithBadTimestamp = `case_id,activity,timestamp
case-1,A,invalid-timestamp`;
      const result = validateCSV(csvWithBadTimestamp);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Invalid timestamp'))).toBe(true);
    });
  });

  describe('validateEventLog', () => {
    it('should validate correct event log', () => {
      const log: EventLogSchema = {
        traces: [
          {
            'concept:name': 'case-1',
            events: [
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T09:00:00Z' },
              { 'concept:name': 'B', 'time:timestamp': '2026-01-01T10:00:00Z' },
            ],
          },
        ],
      };
      const result = validateEventLog(log);
      expect(result.valid).toBe(true);
    });

    it('should reject empty traces array', () => {
      const log: EventLogSchema = { traces: [] };
      const result = validateEventLog(log);
      expect(result.valid).toBe(false);
    });

    it('should reject traces with no events', () => {
      const log: EventLogSchema = {
        traces: [
          {
            'concept:name': 'case-1',
            events: [],
          },
        ],
      };
      const result = validateEventLog(log);
      expect(result.valid).toBe(false);
    });

    it('should require concept:name in events', () => {
      const log: EventLogSchema = {
        traces: [
          {
            'concept:name': 'case-1',
            events: [{ 'time:timestamp': '2026-01-01T09:00:00Z' } as any],
          },
        ],
      };
      const result = validateEventLog(log);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTimestampOrdering', () => {
    it('should pass for correctly ordered timestamps', () => {
      const log: EventLogSchema = {
        traces: [
          {
            events: [
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T09:00:00Z' },
              { 'concept:name': 'B', 'time:timestamp': '2026-01-01T10:00:00Z' },
              { 'concept:name': 'C', 'time:timestamp': '2026-01-01T11:00:00Z' },
            ],
          },
        ],
      };
      const result = validateTimestampOrdering(log);
      expect(result.valid).toBe(true);
    });

    it('should detect out-of-order timestamps', () => {
      const log: EventLogSchema = {
        traces: [
          {
            events: [
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T10:00:00Z' },
              { 'concept:name': 'B', 'time:timestamp': '2026-01-01T09:00:00Z' },
            ],
          },
        ],
      };
      const result = validateTimestampOrdering(log);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about duplicate timestamps', () => {
      const log: EventLogSchema = {
        traces: [
          {
            events: [
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T09:00:00Z' },
              { 'concept:name': 'B', 'time:timestamp': '2026-01-01T09:00:00Z' },
            ],
          },
        ],
      };
      const result = validateTimestampOrdering(log);
      expect(result.warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
    });
  });

  describe('validateTraceCompleteness', () => {
    it('should pass complete traces', () => {
      const log: EventLogSchema = {
        traces: [
          { events: [{ 'concept:name': 'A' }, { 'concept:name': 'B' }] },
          { events: [{ 'concept:name': 'A' }, { 'concept:name': 'B' }] },
        ],
      };
      const result = validateTraceCompleteness(log);
      expect(result.valid).toBe(true);
    });

    it('should detect empty traces', () => {
      const log: EventLogSchema = {
        traces: [
          { events: [{ 'concept:name': 'A' }] },
          { events: [] },
        ],
      };
      const result = validateTraceCompleteness(log);
      expect(result.valid).toBe(false);
    });

    it('should check for expected activities', () => {
      const log: EventLogSchema = {
        traces: [
          { events: [{ 'concept:name': 'A' }, { 'concept:name': 'B' }] },
        ],
      };
      const result = validateTraceCompleteness(log, ['A', 'B', 'C']);
      expect(result.valid).toBe(true); // No errors, just warnings
      expect(result.warnings.some(w => w.message.includes('C'))).toBe(true);
    });
  });

  describe('validateNoDuplicates', () => {
    it('should pass traces without duplicates', () => {
      const log: EventLogSchema = {
        traces: [
          { events: [{ 'concept:name': 'A' }, { 'concept:name': 'B' }] },
        ],
      };
      const result = validateNoDuplicates(log);
      expect(result.valid).toBe(true);
    });

    it('should detect duplicate events', () => {
      const log: EventLogSchema = {
        traces: [
          {
            events: [
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T09:00:00Z' },
              { 'concept:name': 'A', 'time:timestamp': '2026-01-01T09:00:00Z' },
            ],
          },
        ],
      };
      const result = validateNoDuplicates(log);
      expect(result.warnings.some(w => w.message.includes('Duplicate'))).toBe(true);
    });
  });
});
