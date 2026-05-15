/**
 * envelope.ts — Doctor JSON envelope assertion helper.
 *
 * Asserts the canonical doctor command JSON envelope shape:
 *   { command, status, exit_code, payload, error?, meta: { run_id, timestamp, duration_ms, version } }
 *
 * Used alongside (not in place of) existing payload-shape assertions in doctor tests.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { expect } from 'vitest';

const PKG_VERSION: string = (() => {
  // import.meta.dirname is available in Node 20.11+ and used elsewhere in this test suite.
  const here = import.meta.dirname;
  // helpers/ -> __tests__/ -> src/ -> apps/wasm4pm/package.json
  const pkgPath = path.resolve(here, '../../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
})();

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export interface DoctorEnvelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: unknown;
  error?: { code: string; message: string; remediation?: string };
  meta: { run_id: string; timestamp: string; duration_ms: number; version: string };
}

export function assertEnvelope(
  result: unknown,
  expected: { command: string; status?: 'ok' | 'error' }
): asserts result is DoctorEnvelope {
  expect(result).toBeTypeOf('object');
  expect(result).not.toBeNull();
  const r = result as Partial<DoctorEnvelope>;
  expect(r.command).toBe(expected.command);
  expect(['ok', 'error']).toContain(r.status);
  if (expected.status) expect(r.status).toBe(expected.status);
  expect(typeof r.exit_code).toBe('number');
  expect(r.payload).not.toBeUndefined();
  expect(r.meta).toBeTypeOf('object');
  expect(r.meta).not.toBeNull();
  expect(r.meta?.run_id).toMatch(UUID_V4);
  expect(r.meta?.timestamp).toMatch(ISO_8601);
  expect(typeof r.meta?.duration_ms).toBe('number');
  expect(r.meta?.version).toBe(PKG_VERSION);
}

export { PKG_VERSION };
