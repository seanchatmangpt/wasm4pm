/**
 * Exhaustive error code tests — Rank 1 bijectivity and domain isolation
 *
 * Enumerated ranges are derived from the PRD §14 domain comment in errors.ts,
 * NOT from reading TYPED_ERROR_CODES at runtime inside the assertions (no FM-5).
 *
 * TYPED_ERROR_CODES numeric ranges (0-255 compact scheme):
 *   Config       : 10–19
 *   Source       : 20–29
 *   Algorithm    : 30–39
 *   WASM Runtime : 40–49
 *   Sink         : 50–59
 *   Observability: 60–69
 */

import { describe, it, expect } from 'vitest';
import {
  TYPED_ERROR_CODES,
  TYPED_ERROR_NAMES,
  createTypedError,
  type ErrorCode,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Hardcoded enumerations — independent of the module under test (anti-FM-5)
// ---------------------------------------------------------------------------

const CONFIG_ERROR_CODES: ErrorCode[] = ['CONFIG_INVALID', 'CONFIG_MISSING'];

const SOURCE_ERROR_CODES: ErrorCode[] = [
  'SOURCE_NOT_FOUND',
  'SOURCE_INVALID',
  'SOURCE_PERMISSION',
];

const ALGORITHM_ERROR_CODES: ErrorCode[] = [
  'ALGORITHM_FAILED',
  'ALGORITHM_NOT_FOUND',
  'CONFORMANCE_FAILED',
  'SIMULATION_FAILED',
  'PREDICTION_FAILED',
  'VALIDATION_FAILED',
  'IMPORT_FAILED',
];

const WASM_ERROR_CODES: ErrorCode[] = ['WASM_INIT_FAILED', 'WASM_MEMORY_EXCEEDED'];

const SINK_ERROR_CODES: ErrorCode[] = ['SINK_FAILED', 'SINK_PERMISSION'];

const OBSERVABILITY_ERROR_CODES: ErrorCode[] = ['OTEL_FAILED'];

// All known codes in one flat array, ordered as declared in ErrorCode union
const ALL_ERROR_CODES: ErrorCode[] = [
  ...CONFIG_ERROR_CODES,
  ...SOURCE_ERROR_CODES,
  ...ALGORITHM_ERROR_CODES,
  ...WASM_ERROR_CODES,
  ...SINK_ERROR_CODES,
  ...OBSERVABILITY_ERROR_CODES,
];

// Domain numeric ranges (compact 0-255 scheme, NOT EXIT_CODES 200-799 ranges)
const CONFIG_RANGE = { lo: 10, hi: 19 };
const SOURCE_RANGE = { lo: 20, hi: 29 };
const ALGORITHM_RANGE = { lo: 30, hi: 39 };
const WASM_RANGE = { lo: 40, hi: 49 };
const SINK_RANGE = { lo: 50, hi: 59 };
const OBSERVABILITY_RANGE = { lo: 60, hi: 69 };

function inRange(n: number, range: { lo: number; hi: number }): boolean {
  return n >= range.lo && n <= range.hi;
}

// ---------------------------------------------------------------------------
// Group 1 — Rank 1 (mathematical): Error code range invariants
// ---------------------------------------------------------------------------

describe('Group 1 — Rank 1: Error code range invariants', () => {
  describe('Config-category codes map to numeric range [10, 19]', () => {
    for (const code of CONFIG_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [10, 19]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(CONFIG_RANGE.lo);
        expect(n).toBeLessThanOrEqual(CONFIG_RANGE.hi);
      });
    }
  });

  describe('Source-category codes map to numeric range [20, 29]', () => {
    for (const code of SOURCE_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [20, 29]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(SOURCE_RANGE.lo);
        expect(n).toBeLessThanOrEqual(SOURCE_RANGE.hi);
      });
    }
  });

  describe('Algorithm-category codes map to numeric range [30, 39]', () => {
    for (const code of ALGORITHM_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [30, 39]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(ALGORITHM_RANGE.lo);
        expect(n).toBeLessThanOrEqual(ALGORITHM_RANGE.hi);
      });
    }
  });

  describe('WASM-category codes map to numeric range [40, 49]', () => {
    for (const code of WASM_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [40, 49]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(WASM_RANGE.lo);
        expect(n).toBeLessThanOrEqual(WASM_RANGE.hi);
      });
    }
  });

  describe('Sink-category codes map to numeric range [50, 59]', () => {
    for (const code of SINK_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [50, 59]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(SINK_RANGE.lo);
        expect(n).toBeLessThanOrEqual(SINK_RANGE.hi);
      });
    }
  });

  describe('Observability-category codes map to numeric range [60, 69]', () => {
    for (const code of OBSERVABILITY_ERROR_CODES) {
      it(`TYPED_ERROR_CODES['${code}'] is in [60, 69]`, () => {
        const n = TYPED_ERROR_CODES[code];
        expect(n).toBeGreaterThanOrEqual(OBSERVABILITY_RANGE.lo);
        expect(n).toBeLessThanOrEqual(OBSERVABILITY_RANGE.hi);
      });
    }
  });

  it('no two ErrorCodes share the same numeric code (bijectivity)', () => {
    const seen = new Map<number, ErrorCode>();
    const collisions: string[] = [];

    for (const code of ALL_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      if (seen.has(n)) {
        collisions.push(`Numeric ${n} is shared by '${seen.get(n)}' and '${code}'`);
      } else {
        seen.set(n, code);
      }
    }

    expect(collisions).toEqual([]);
  });

  it('every enumerated ErrorCode is present in TYPED_ERROR_CODES', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(TYPED_ERROR_CODES).toHaveProperty(code);
    }
  });

  it('all numeric codes are in the TypedError 0-255 compact range', () => {
    for (const code of ALL_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Group 2 — Rank 1 (mathematical): Reverse map is a perfect inverse
// ---------------------------------------------------------------------------

describe('Group 2 — Rank 1: Reverse map is a perfect inverse', () => {
  it('TYPED_ERROR_NAMES[TYPED_ERROR_CODES[code]] === code for every ErrorCode', () => {
    for (const code of ALL_ERROR_CODES) {
      const numeric = TYPED_ERROR_CODES[code];
      expect(TYPED_ERROR_NAMES[numeric]).toBe(code);
    }
  });

  it('TYPED_ERROR_CODES[TYPED_ERROR_NAMES[n]] === n for every numeric code in the map', () => {
    for (const [nStr, codeName] of Object.entries(TYPED_ERROR_NAMES)) {
      const n = Number(nStr);
      expect(TYPED_ERROR_CODES[codeName]).toBe(n);
    }
  });

  it('no key in TYPED_ERROR_NAMES falls outside the compact 0-255 range', () => {
    for (const nStr of Object.keys(TYPED_ERROR_NAMES)) {
      const n = Number(nStr);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it('TYPED_ERROR_NAMES has exactly the same number of entries as ALL_ERROR_CODES', () => {
    expect(Object.keys(TYPED_ERROR_NAMES).length).toBe(ALL_ERROR_CODES.length);
  });
});

// ---------------------------------------------------------------------------
// Group 3 — Rank 2 (domain contract): createTypedError behavior
// ---------------------------------------------------------------------------

describe('Group 3 — Rank 2: createTypedError behavior', () => {
  it('returns an object with .code equal to TYPED_ERROR_CODES[input code]', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'test message');
      expect(err.code).toBe(TYPED_ERROR_CODES[code]);
    }
  });

  it('returns an object with .message matching the input message', () => {
    const msg = 'This is a non-empty error message';
    const err = createTypedError('CONFIG_INVALID', msg);
    expect(err.message).toBe(msg);
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('optional context: present when passed, empty object when not passed', () => {
    const ctx = { path: '/tmp/test.xes', line: 42 };

    const withCtx = createTypedError('SOURCE_NOT_FOUND', 'missing', ctx);
    expect(withCtx.context).toEqual(ctx);

    const withoutCtx = createTypedError('SOURCE_NOT_FOUND', 'missing');
    expect(withoutCtx.context).toEqual({});
  });

  it('two errors with the same code have equal .code values', () => {
    const err1 = createTypedError('ALGORITHM_FAILED', 'first failure');
    const err2 = createTypedError('ALGORITHM_FAILED', 'second failure, different message');
    expect(err1.code).toBe(err2.code);
  });

  it('schema_version is always "1.0"', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'test');
      expect(err.schema_version).toBe('1.0');
    }
  });

  it('remediation is a non-empty string for every ErrorCode', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'test');
      expect(typeof err.remediation).toBe('string');
      expect(err.remediation.length).toBeGreaterThan(0);
    }
  });

  it('context defaults to empty object, not undefined', () => {
    const err = createTypedError('WASM_INIT_FAILED', 'init failure');
    expect(err.context).toBeDefined();
    expect(typeof err.context).toBe('object');
    expect(err.context).not.toBeNull();
  });

  it('.code field is a number, not a string', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'test');
      expect(typeof err.code).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Group 4 — Rank 2 (domain contract): Error domain isolation
// ---------------------------------------------------------------------------

describe('Group 4 — Rank 2: Error domain isolation', () => {
  it('config error numeric codes are NOT in the source range [20, 29]', () => {
    for (const code of CONFIG_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, SOURCE_RANGE)).toBe(false);
    }
  });

  it('config error numeric codes are NOT in the algorithm range [30, 39]', () => {
    for (const code of CONFIG_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, ALGORITHM_RANGE)).toBe(false);
    }
  });

  it('algorithm error numeric codes are NOT in the WASM range [40, 49]', () => {
    for (const code of ALGORITHM_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, WASM_RANGE)).toBe(false);
    }
  });

  it('source error numeric codes are NOT in the algorithm range [30, 39]', () => {
    for (const code of SOURCE_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, ALGORITHM_RANGE)).toBe(false);
    }
  });

  it('WASM error numeric codes are NOT in the sink range [50, 59]', () => {
    for (const code of WASM_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, SINK_RANGE)).toBe(false);
    }
  });

  it('sink error numeric codes are NOT in the observability range [60, 69]', () => {
    for (const code of SINK_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      expect(inRange(n, OBSERVABILITY_RANGE)).toBe(false);
    }
  });

  it('domains are mutually exclusive: every code falls in exactly one range', () => {
    const ranges = [
      { name: 'config', range: CONFIG_RANGE },
      { name: 'source', range: SOURCE_RANGE },
      { name: 'algorithm', range: ALGORITHM_RANGE },
      { name: 'wasm', range: WASM_RANGE },
      { name: 'sink', range: SINK_RANGE },
      { name: 'observability', range: OBSERVABILITY_RANGE },
    ];

    for (const code of ALL_ERROR_CODES) {
      const n = TYPED_ERROR_CODES[code];
      const matches = ranges.filter(({ range }) => inRange(n, range));
      expect(matches.length).toBe(1);
    }
  });

  it('createTypedError config code does NOT produce a source-range numeric', () => {
    const err = createTypedError('CONFIG_MISSING', 'no config');
    expect(inRange(err.code, SOURCE_RANGE)).toBe(false);
  });

  it('createTypedError algorithm code does NOT produce a WASM-range numeric', () => {
    const err = createTypedError('ALGORITHM_FAILED', 'algo error');
    expect(inRange(err.code, WASM_RANGE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group 5 — Rank 3 (metamorphic): String round-trip
// ---------------------------------------------------------------------------

describe('Group 5 — Rank 3: JSON serialization round-trip', () => {
  it('JSON round-trip preserves .code (numeric) for every ErrorCode', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'round-trip test');
      const parsed = JSON.parse(JSON.stringify(err)) as { code: number };
      expect(parsed.code).toBe(TYPED_ERROR_CODES[code]);
    }
  });

  it('JSON round-trip preserves .message', () => {
    const msg = 'serialization must preserve this exact message';
    const err = createTypedError('OTEL_FAILED', msg);
    const parsed = JSON.parse(JSON.stringify(err)) as { message: string };
    expect(parsed.message).toBe(msg);
  });

  it('JSON round-trip preserves .schema_version as "1.0"', () => {
    const err = createTypedError('WASM_MEMORY_EXCEEDED', 'oom');
    const parsed = JSON.parse(JSON.stringify(err)) as { schema_version: string };
    expect(parsed.schema_version).toBe('1.0');
  });

  it('JSON round-trip preserves .context fields', () => {
    const ctx = { trace_count: 100, algorithm: 'inductive_miner' };
    const err = createTypedError('SIMULATION_FAILED', 'sim failed', ctx);
    const parsed = JSON.parse(JSON.stringify(err)) as { context: Record<string, unknown> };
    expect(parsed.context).toEqual(ctx);
  });

  it('serialized .code is a JSON number, not a string', () => {
    for (const code of ALL_ERROR_CODES) {
      const raw = JSON.stringify(createTypedError(code, 'test'));
      // A JSON number appears without quotes: ,"code":NN,
      expect(raw).toMatch(/"code":\d+/);
    }
  });

  it('round-tripped .code allows reverse lookup via TYPED_ERROR_NAMES', () => {
    for (const code of ALL_ERROR_CODES) {
      const err = createTypedError(code, 'lookup test');
      const parsed = JSON.parse(JSON.stringify(err)) as { code: number };
      // The numeric from the wire format must still resolve to the original string code
      expect(TYPED_ERROR_NAMES[parsed.code]).toBe(code);
    }
  });
});
