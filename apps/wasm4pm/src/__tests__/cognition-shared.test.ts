/**
 * cognition-shared.test.ts — tests for _shared.ts
 *
 * Oracle rank: Rank 2 (Domain contract — error codes, exit codes, filesystem contracts,
 * OTEL span shape invariants).
 *
 * Tests call shared helpers directly with real temp files.
 * No mocks, no stubs, no process.exit intercepts needed.
 * Error codes are domain-specified, not implementation-derived.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { OtelSpan } from '@wasm4pm/cognition';
import {
  parseInputJson,
  saveReceipt,
  loadReceipt,
  mapWasmError,
  emitCognitionSpan,
} from '../commands/cognition/_shared.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cog-shared-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── parseInputJson ─────────────────────────────────────────────────────────────

describe('parseInputJson', () => {
  it('throws INPUT_REQUIRED when path is empty string', () => {
    try {
      parseInputJson('');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INPUT_REQUIRED');
    }
  });

  it('throws INPUT_NOT_FOUND when file does not exist', () => {
    const fake = path.join(tmpDir, 'ghost.json');
    try {
      parseInputJson(fake);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INPUT_NOT_FOUND');
    }
  });

  it('throws INPUT_EMPTY when file contains only whitespace', () => {
    const f = path.join(tmpDir, 'empty.json');
    fs.writeFileSync(f, '   \n\t  ');
    try {
      parseInputJson(f);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INPUT_EMPTY');
    }
  });

  it('throws INPUT_INVALID_JSON when file contains unparseable text', () => {
    const f = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(f, 'not { valid } json!!!');
    try {
      parseInputJson(f);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('INPUT_INVALID_JSON');
    }
  });

  it('returns parsed object for valid JSON file', () => {
    const data = { intent: 'test-intent', candidates: [{ id: 'c1', score: 0.9, eliminated: false }] };
    const f = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(f, JSON.stringify(data));
    const result = parseInputJson(f);
    expect(result).toEqual(data);
  });

  it('parses arrays and nested structures correctly', () => {
    const data = { facts: [{ key: 'k', value: 'v' }], goals: [] };
    const f = path.join(tmpDir, 'nested.json');
    fs.writeFileSync(f, JSON.stringify(data));
    expect(parseInputJson(f)).toEqual(data);
  });
});

// ── saveReceipt ────────────────────────────────────────────────────────────────

describe('saveReceipt', () => {
  it('creates the target directory if it does not exist', () => {
    const dir = path.join(tmpDir, 'deep', 'receipts');
    const chain = { id: 'r1', links: [] };
    saveReceipt(chain, dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('returns absolute path containing the receipt id', () => {
    const dir = path.join(tmpDir, 'receipts');
    const chain = { id: 'fixed-uuid-0001', links: [] };
    const saved = saveReceipt(chain, dir);
    expect(saved).toContain('fixed-uuid-0001.json');
    expect(path.isAbsolute(saved)).toBe(true);
  });

  it('falls back to a UUID filename when chain has no id', () => {
    const dir = path.join(tmpDir, 'receipts');
    const chain = { links: [] };
    const saved = saveReceipt(chain, dir);
    expect(saved).toMatch(/[0-9a-f-]{36}\.json$/);
    expect(fs.existsSync(saved)).toBe(true);
  });

  it('saved file parses back to the original object', () => {
    const dir = path.join(tmpDir, 'receipts');
    const chain = { id: 'round-trip', links: [{ index: 0, combined_hash: 'abcdef' }] };
    const saved = saveReceipt(chain, dir);
    const loaded = JSON.parse(fs.readFileSync(saved, 'utf-8'));
    expect(loaded).toEqual(chain);
  });
});

// ── loadReceipt ────────────────────────────────────────────────────────────────

describe('loadReceipt', () => {
  it('throws RECEIPT_ID_REQUIRED when id is empty string', () => {
    try {
      loadReceipt('', tmpDir);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('RECEIPT_ID_REQUIRED');
    }
  });

  it('throws RECEIPT_NOT_FOUND when no file with that id exists', () => {
    try {
      loadReceipt('missing-abc', tmpDir);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('RECEIPT_NOT_FOUND');
    }
  });

  it('throws RECEIPT_CORRUPT when file contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'corrupt.json'), '{ broken: json');
    try {
      loadReceipt('corrupt', tmpDir);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('RECEIPT_CORRUPT');
    }
  });

  it('returns parsed receipt object for a valid file', () => {
    const chain = { id: 'ok-id', links: [{ index: 0, combined_hash: 'xyz' }] };
    fs.writeFileSync(path.join(tmpDir, 'ok-id.json'), JSON.stringify(chain));
    const loaded = loadReceipt('ok-id', tmpDir);
    expect(loaded).toEqual(chain);
  });
});

// ── mapWasmError ───────────────────────────────────────────────────────────────

describe('mapWasmError', () => {
  const SOURCE_ERROR_CODES = [
    'INPUT_REQUIRED',
    'INPUT_NOT_FOUND',
    'INPUT_EMPTY',
    'INPUT_INVALID_JSON',
    'RECEIPT_ID_REQUIRED',
    'RECEIPT_NOT_FOUND',
    'RECEIPT_CORRUPT',
  ];

  for (const errorCode of SOURCE_ERROR_CODES) {
    it(`maps ${errorCode} → exit code 2 (source_error)`, () => {
      const err = Object.assign(new Error('test'), { code: errorCode });
      const { exitCode } = mapWasmError(err);
      expect(exitCode).toBe(2);
    });
  }

  it('maps CONFIG_INVALID → exit code 1 (config_error)', () => {
    const err = Object.assign(new Error('test'), { code: 'CONFIG_INVALID' });
    const { exitCode } = mapWasmError(err);
    expect(exitCode).toBe(1);
  });

  it('maps SYSTEM_ERROR → exit code 5 (system_error)', () => {
    const err = Object.assign(new Error('test'), { code: 'SYSTEM_ERROR' });
    const { exitCode } = mapWasmError(err);
    expect(exitCode).toBe(5);
  });

  it('maps unknown error code → exit code 3 (execution_error)', () => {
    const err = new Error('undocumented failure');
    const { exitCode, code } = mapWasmError(err);
    expect(exitCode).toBe(3);
    expect(code).toBe('EXECUTION_ERROR');
  });

  it('maps null/undefined error code → execution_error', () => {
    const { exitCode } = mapWasmError(null);
    expect(exitCode).toBe(3);
  });
});

// ── emitCognitionSpan ──────────────────────────────────────────────────────────

describe('emitCognitionSpan', () => {
  it('calls the sink with span name "cognition.<operation>"', () => {
    const spans: OtelSpan[] = [];
    emitCognitionSpan('plan', Date.now() * 1_000_000, 1, 'OK', undefined, (s) => spans.push(s));
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('cognition.plan');
  });

  it('span kind is always INTERNAL', () => {
    const spans: OtelSpan[] = [];
    emitCognitionSpan('inspect', Date.now() * 1_000_000, 0, 'OK', undefined, (s) => spans.push(s));
    expect(spans[0].kind).toBe('INTERNAL');
  });

  it('status.code and message are forwarded correctly', () => {
    const spans: OtelSpan[] = [];
    emitCognitionSpan('verify', Date.now() * 1_000_000, 5, 'ERROR', 'chain mismatch', (s) => spans.push(s));
    expect(spans[0].status.code).toBe('ERROR');
    expect(spans[0].status.message).toBe('chain mismatch');
  });

  it('attributes contain service.name, cognition.operation, cognition.duration_ms', () => {
    const spans: OtelSpan[] = [];
    emitCognitionSpan('receipt', Date.now() * 1_000_000, 7, 'OK', undefined, (s) => spans.push(s));
    expect(spans[0].attributes['service.name']).toBe('wasm4pm');
    expect(spans[0].attributes['cognition.operation']).toBe('receipt');
    expect(spans[0].attributes['cognition.duration_ms']).toBe(7);
  });

  it('trace_id is 32 hex chars, span_id is 16 hex chars', () => {
    const spans: OtelSpan[] = [];
    emitCognitionSpan('adversarial', Date.now() * 1_000_000, 0, 'OK', undefined, (s) => spans.push(s));
    expect(spans[0].trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(spans[0].span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('swallows sink errors — never throws', () => {
    const throwingSink = () => { throw new Error('sink boom'); };
    expect(() =>
      emitCognitionSpan('replay', Date.now() * 1_000_000, 0, 'OK', undefined, throwingSink)
    ).not.toThrow();
  });
});
