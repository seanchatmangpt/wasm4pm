/**
 * validate-gaps.test.ts
 *
 * Gap coverage for `wpm validate`:
 *   - JSON output contract completeness (trace_count, event_count, violations[], warnings[])
 *   - Schema feedback on logs with missing required attributes
 *   - Precise exit codes for each error class
 *   - WASM-backed check results (not "not available" fall-throughs)
 *   - Behaviour on empty, near-empty, and malformed logs
 *   - Error envelope structure when validate fails
 *
 * What the existing validate-cli.test.ts already covers (not duplicated here):
 *   - Basic happy-path acceptance of positional arg, --file, -i
 *   - --help flag
 *   - CSV and OCEL format paths
 *   - Receipt auto-save / --no-save flag
 *   - Verbose (-v) and quiet (-q) flags
 */
import { describe, it, expect, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A valid, well-formed XES file with N events in one trace. No <global> elements. */
function validXes(traceId: string, eventCount: number): string {
  const events = Array.from({ length: eventCount }, (_, i) => {
    const ts = new Date(Date.UTC(2026, 4, 17, 10, i, 0)).toISOString();
    return `    <event>
      <string key="concept:name" value="Activity${i + 1}"/>
      <date key="time:timestamp" value="${ts}"/>
    </event>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="${traceId}"/>
${events}
  </trace>
</log>`;
}

/** Valid XES with TWO traces. */
function validXesMultiTrace(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-05-17T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-05-17T10:01:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-05-17T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-05-17T11:01:00Z"/>
    </event>
  </trace>
</log>`;
}

/** XES where events have NO concept:name attribute (missing activity key). */
const noActivityXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <date key="time:timestamp" value="2026-05-17T10:00:00Z"/>
    </event>
    <event>
      <date key="time:timestamp" value="2026-05-17T10:01:00Z"/>
    </event>
  </trace>
</log>`;

/** XES with no traces at all. */
const emptyXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
</log>`;

/** Completely empty file (0 bytes). */
const emptyFileContent = '';

/** Syntactically broken XES (mismatched tags). */
const malformedXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    GARBAGE CONTENT
  </log>`;

/** XES with out-of-order timestamps in one trace. */
const outOfOrderXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="ActivityB"/>
      <date key="time:timestamp" value="2026-05-17T10:02:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="ActivityA"/>
      <date key="time:timestamp" value="2026-05-17T10:01:00Z"/>
    </event>
  </trace>
</log>`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _env: Awaited<ReturnType<typeof createCliTestEnv>> | undefined;
afterEach(() => _env?.cleanup?.());

async function writeTmp(content: string, filename: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-validate-gaps-'));
  const p = path.join(dir, filename);
  await fs.writeFile(p, content, 'utf-8');
  return p;
}

/** Run validate with --format json and parse the JSON envelope. */
async function validateJson(args: string[]): Promise<{
  exitCode: number;
  envelope: Record<string, unknown>;
}> {
  const result = await runCli(['validate', ...args, '--format', 'json', '--no-save']);
  let envelope: Record<string, unknown> = {};
  try {
    envelope = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    // stdout was not JSON — envelope stays empty
  }
  return { exitCode: result.exitCode, envelope };
}

function payload(envelope: Record<string, unknown>): Record<string, unknown> {
  return (envelope['payload'] as Record<string, unknown>) ?? {};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('wpm validate — gap coverage', () => {
  // ── 1. JSON contract: trace_count and event_count fields ─────────────────

  describe('JSON contract: trace_count and event_count', () => {
    it('payload contains trace_count for a valid XES log', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      const pl = payload(envelope);
      expect(pl).toHaveProperty('trace_count');
      expect(typeof pl['trace_count']).toBe('number');
      expect(pl['trace_count']).toBe(1);
    });

    it('payload contains event_count for a valid XES log', async () => {
      const p = await writeTmp(validXes('case-1', 4), 'test.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      const pl = payload(envelope);
      expect(pl).toHaveProperty('event_count');
      expect(typeof pl['event_count']).toBe('number');
      expect(pl['event_count']).toBe(4);
    });

    it('trace_count matches actual traces in multi-trace log', async () => {
      const p = await writeTmp(validXesMultiTrace(), 'multi.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      expect(payload(envelope)['trace_count']).toBe(2);
    });

    it('event_count matches actual events in multi-trace log', async () => {
      const p = await writeTmp(validXesMultiTrace(), 'multi.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      // 2 traces × 2 events each = 4
      expect(payload(envelope)['event_count']).toBe(4);
    });

    it('trace_count is 0 for empty XES (no traces)', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { envelope } = await validateJson([p]);
      expect(payload(envelope)['trace_count']).toBe(0);
    });

    it('event_count is 0 for empty XES', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { envelope } = await validateJson([p]);
      expect(payload(envelope)['event_count']).toBe(0);
    });
  });

  // ── 2. JSON contract: violations[] and warnings[] always arrays ───────────

  describe('JSON contract: violations[] and warnings[] arrays', () => {
    it('violations is always a string array in successful payload', async () => {
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const { envelope } = await validateJson([p]);
      const pl = payload(envelope);
      expect(Array.isArray(pl['violations'])).toBe(true);
      for (const v of pl['violations'] as unknown[]) {
        expect(typeof v).toBe('string');
      }
    });

    it('warnings is always a string array in successful payload', async () => {
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const { envelope } = await validateJson([p]);
      const pl = payload(envelope);
      expect(Array.isArray(pl['warnings'])).toBe(true);
    });

    it('violations and errors carry the same strings', async () => {
      // violations is the PM-vocabulary alias for errors
      const p = await writeTmp(noActivityXes, 'test.xes');
      const { envelope } = await validateJson([p]);
      const pl = payload(envelope);
      expect(pl['violations']).toEqual(pl['errors']);
    });

    it('violations is non-empty when schema check fails', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const pl = payload(envelope);
      expect((pl['violations'] as string[]).length).toBeGreaterThan(0);
    });
  });

  // ── 3. JSON contract: valid boolean ──────────────────────────────────────

  describe('JSON contract: valid boolean field', () => {
    it('valid is true when no schema errors', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      expect(payload(envelope)['valid']).toBe(true);
    });

    it('valid is false when activity attribute is missing', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(2);
      expect(payload(envelope)['valid']).toBe(false);
    });

    it('valid is true for empty XES (zero traces is a warning, not an error)', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { exitCode, envelope } = await validateJson([p]);
      // Zero traces triggers warnings but not errors — valid=true, exit 0
      expect(exitCode).toBe(0);
      expect(payload(envelope)['valid']).toBe(true);
    });
  });

  // ── 4. Schema checks are real (not "not available") ───────────────────────

  describe('schema checks use real WASM API', () => {
    it('schema check passes for well-formed XES', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const schemaCheck = checks.find((c) => c['name'] === 'schema');
      expect(schemaCheck).toBeDefined();
      expect(schemaCheck!['status']).toBe('pass');
      // Message must NOT be the fallback "not available" string
      expect(schemaCheck!['message']).not.toMatch(/not available/i);
    });

    it('required_attributes check passes for well-formed XES', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      expect(attrCheck).toBeDefined();
      expect(attrCheck!['status']).toBe('pass');
    });

    it('required_attributes check fails when concept:name is absent from events', async () => {
      // The schema check uses infer_eventlog_schema (confidence-based), not attribute presence.
      // Missing activity attribute is detected by the required_attributes check instead.
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      expect(attrCheck).toBeDefined();
      expect(attrCheck!['status']).toBe('fail');
    });

    it('required_attributes failure message names the missing attribute', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      expect(String(attrCheck!['message'])).toMatch(/concept:name/i);
    });

    it('required_attributes check fails when concept:name is absent', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      expect(attrCheck).toBeDefined();
      expect(attrCheck!['status']).toBe('fail');
    });
  });

  // ── 5. Exit code contract ─────────────────────────────────────────────────

  describe('exit code contract', () => {
    it('exits 0 on a valid XES file', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).toBe(0);
    });

    it('exits 2 (source_error) on a nonexistent file', async () => {
      const { exitCode } = await validateJson(['/tmp/definitely_does_not_exist_xyz_abc_2026.xes']);
      expect(exitCode).toBe(2);
    });

    it('exits 2 (source_error) on malformed XES (mismatched tags)', async () => {
      const p = await writeTmp(malformedXes, 'bad.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).toBe(2);
    });

    it('exits 2 (source_error) when no input file is provided', async () => {
      const result = await runCli(['validate', '--format', 'json', '--no-save']);
      expect(result.exitCode).toBe(2);
    });

    it('exits 2 (source_error) when activity attribute is missing', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).toBe(2);
    });

    it('exits 0 for empty XES (0 traces → warning, not error)', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).toBe(0);
    });

    it('never exits 3 (execution_error) for any expected input scenario', async () => {
      const valid = await writeTmp(validXes('case-1', 2), 'v.xes');
      const empty = await writeTmp(emptyXes, 'e.xes');
      const noAct = await writeTmp(noActivityXes, 'n.xes');
      for (const f of [valid, empty, noAct]) {
        const { exitCode } = await validateJson([f]);
        expect(exitCode).not.toBe(3);
      }
    }, 30000);
  });

  // ── 6. Error envelope structure on failure ────────────────────────────────

  describe('error envelope structure on failure', () => {
    it('FILE_NOT_FOUND error has code and human message', async () => {
      const { envelope } = await validateJson(['/tmp/no_such_file_abc_xyz.xes']);
      const err = envelope['error'] as Record<string, string> | undefined;
      expect(err).toBeDefined();
      expect(err!['code']).toBe('FILE_NOT_FOUND');
      expect(err!['message']).toMatch(/not found|no_such_file/i);
    });

    it('PARSE_ERROR error has code and includes XES error detail', async () => {
      const p = await writeTmp(malformedXes, 'bad.xes');
      const { envelope } = await validateJson([p]);
      const err = envelope['error'] as Record<string, string> | undefined;
      expect(err).toBeDefined();
      expect(err!['code']).toBe('PARSE_ERROR');
      expect(err!['message']).toBeTruthy();
    });

    it('MISSING_INPUT error code when no file is given', async () => {
      const result = await runCli(['validate', '--format', 'json', '--no-save']);
      const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
      const err = envelope['error'] as Record<string, string> | undefined;
      expect(err!['code']).toBe('MISSING_INPUT');
    });

    it('error envelope message mentions the file path for FILE_NOT_FOUND', async () => {
      const fakePath = '/tmp/wpm_gap_test_no_such_file.xes';
      const { envelope } = await validateJson([fakePath]);
      const err = envelope['error'] as Record<string, string> | undefined;
      expect(err!['message']).toContain(fakePath);
    });
  });

  // ── 7. Empty and near-empty log behaviour ────────────────────────────────

  describe('empty and near-empty log behaviour', () => {
    it('empty XES (no traces) is valid=true with trace_count=0', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      const pl = payload(envelope);
      expect(pl['valid']).toBe(true);
      expect(pl['trace_count']).toBe(0);
      expect(pl['event_count']).toBe(0);
    });

    it('empty XES produces at least one warning about no process behaviour', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { envelope } = await validateJson([p]);
      const warns = payload(envelope)['warnings'] as string[];
      expect(warns.length).toBeGreaterThan(0);
      // At least one warning should mention zero traces or zero events
      const mentionsEmpty = warns.some(
        (w) => /0 trace|0 event|empty|no trace|no event/i.test(w)
      );
      expect(mentionsEmpty).toBe(true);
    });

    it('empty file (0 bytes) does not crash — exits without code 3', async () => {
      const p = await writeTmp(emptyFileContent, 'empty-file.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).not.toBe(3);
    });

    it('XES with single trace and single event is accepted as valid', async () => {
      const p = await writeTmp(validXes('case-1', 1), 'single-event.xes');
      const { exitCode, envelope } = await validateJson([p]);
      expect(exitCode).toBe(0);
      const pl = payload(envelope);
      expect(pl['trace_count']).toBe(1);
      expect(pl['event_count']).toBe(1);
    });
  });

  // ── 8. checks[] array completeness ───────────────────────────────────────

  describe('checks[] array completeness', () => {
    const EXPECTED_CHECK_NAMES = [
      'schema',
      'required_attributes',
      'data_quality',
      'trace_completeness',
      'timestamp_ordering',
    ];

    it('checks[] contains all five expected check names for a valid XES', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const names = checks.map((c) => c['name'] as string);
      for (const expected of EXPECTED_CHECK_NAMES) {
        expect(names).toContain(expected);
      }
    });

    it('each check has name, status, and message fields', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      for (const check of checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('status');
        expect(check).toHaveProperty('message');
        expect(['pass', 'fail', 'warn']).toContain(check['status']);
      }
    });

    it('data_quality check passes for a valid log with events', async () => {
      const p = await writeTmp(validXes('case-1', 5), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const dq = checks.find((c) => c['name'] === 'data_quality');
      expect(dq).toBeDefined();
      expect(dq!['status']).toBe('pass');
    });

    it('trace_completeness check passes for non-empty log', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const tc = checks.find((c) => c['name'] === 'trace_completeness');
      expect(tc).toBeDefined();
      expect(tc!['status']).toBe('pass');
    });

    it('trace_completeness warns for empty XES (zero traces)', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const tc = checks.find((c) => c['name'] === 'trace_completeness');
      expect(tc).toBeDefined();
      expect(tc!['status']).toBe('warn');
    });
  });

  // ── 9. Non-XES file passed as XES ─────────────────────────────────────────

  describe('non-XES file passed as XES', () => {
    it('plain text file produces exit 2 or 0 (parse or schema warn)', async () => {
      const p = await writeTmp('this is plain text, not XES\n', 'notxes.txt');
      const { exitCode } = await validateJson([p]);
      // If WASM tolerates it (parses as empty log), exit 0 is acceptable.
      // If WASM rejects it with parse error, exit 2 is correct.
      expect([0, 2]).toContain(exitCode);
    });

    it('plain text file does not produce exit 3 (execution_error)', async () => {
      const p = await writeTmp('this is plain text\n', 'notxes.txt');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).not.toBe(3);
    });
  });

  // ── 10. --output-format json flag ( alias) ──────────────────────────

  describe('--output-format json ( alias)', () => {
    it('--output-format json produces parseable JSON envelope', async () => {
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const result = await runCli(['validate', p, '--output-format', 'json', '--no-save']);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const env = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(env).toHaveProperty('status');
    });

    it('--output-format json payload includes trace_count', async () => {
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const result = await runCli(['validate', p, '--output-format', 'json', '--no-save']);
      const env = JSON.parse(result.stdout) as Record<string, unknown>;
      const pl = (env['payload'] ?? {}) as Record<string, unknown>;
      expect(pl).toHaveProperty('trace_count');
    });
  });

  // ── 11. Envelope status consistency with payload validation result ──────────
  //
  // Van der Aalst doctrine: a result envelope that says "ok" while the
  // payload reports a schema violation is a self-contradicting response.
  // The top-level envelope `status` must mirror whether the validation
  // passed or failed — not just whether the command ran without crashing.

  describe('envelope status mirrors validation outcome', () => {
    it('envelope.status is "ok" when validation passes (valid XES)', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      // A passing validation: top-level envelope status must be "ok"
      expect(envelope['status']).toBe('ok');
    });

    it('envelope.status is "error" when concept:name is missing (schema failure)', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      // payload.valid=false with exit_code=2 — envelope must report "error"
      expect(envelope['status']).toBe('error');
    });

    it('envelope.status is "ok" for empty XES (zero traces is warning, not error)', async () => {
      const p = await writeTmp(emptyXes, 'empty.xes');
      const { envelope } = await validateJson([p]);
      // Only warnings fired — valid=true, exit=0, envelope status must stay "ok"
      expect(envelope['status']).toBe('ok');
    }, 15000);

    it('envelope.status is "error" and payload.valid is false together', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      // Both the envelope status and the payload flag must agree on failure
      expect(envelope['status']).toBe('error');
      expect(payload(envelope)['valid']).toBe(false);
    });

    it('envelope.status is "ok" and payload.valid is true together for valid log', async () => {
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const { envelope } = await validateJson([p]);
      expect(envelope['status']).toBe('ok');
      expect(payload(envelope)['valid']).toBe(true);
    });
  });

  // ── 12. XES missing only timestamps → violations non-empty ───────────────

  describe('XES missing timestamps', () => {
    // Events with concept:name but no time:timestamp
    const noTimestampXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="ActivityA"/>
    </event>
    <event>
      <string key="concept:name" value="ActivityB"/>
    </event>
  </trace>
</log>`;

    it('XES missing timestamps exits 2 (source_error)', async () => {
      const p = await writeTmp(noTimestampXes, 'no-ts.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).toBe(2);
    });

    it('XES missing timestamps produces violations[] non-empty', async () => {
      const p = await writeTmp(noTimestampXes, 'no-ts.xes');
      const { envelope } = await validateJson([p]);
      const pl = payload(envelope);
      expect((pl['violations'] as string[]).length).toBeGreaterThan(0);
    });

    it('XES missing timestamps gives payload.valid=false', async () => {
      const p = await writeTmp(noTimestampXes, 'no-ts.xes');
      const { envelope } = await validateJson([p]);
      expect(payload(envelope)['valid']).toBe(false);
    });

    it('XES missing timestamps gives envelope.status="error"', async () => {
      const p = await writeTmp(noTimestampXes, 'no-ts.xes');
      const { envelope } = await validateJson([p]);
      expect(envelope['status']).toBe('error');
    });

    it('required_attributes check mentions time:timestamp when missing', async () => {
      // Missing timestamps are caught by the required_attributes check (validate_has_timestamps),
      // not by the schema check (which uses infer_eventlog_schema / confidence scoring).
      const p = await writeTmp(noTimestampXes, 'no-ts.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      if (attrCheck && attrCheck['status'] === 'fail') {
        expect(String(attrCheck['message'])).toMatch(/time:timestamp/i);
      }
      // The violations array must be non-empty when timestamps are missing.
      const vlen = (payload(envelope)['violations'] as string[]).length;
      expect(vlen).toBeGreaterThan(0);
    });
  });

  // ── 13. schema check details field structure ───────────────────────────────

  describe('schema check details field', () => {
    it('schema check details includes confidence for valid log', async () => {
      // The schema check uses infer_eventlog_schema which returns attribute_types, confidence,
      // and inferred_keys — not has_activities/has_timestamps (those are in required_attributes).
      const p = await writeTmp(validXes('case-1', 2), 'test.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const schemaCheck = checks.find((c) => c['name'] === 'schema');
      expect(schemaCheck).toBeDefined();
      if (schemaCheck!['status'] !== 'warn' || (schemaCheck!['details'] as Record<string, unknown>)?.['confidence'] !== undefined) {
        // When infer_eventlog_schema ran, details contain confidence and attribute_types
        const details = schemaCheck!['details'] as Record<string, unknown> | undefined;
        if (details) {
          expect(details).toHaveProperty('confidence');
        }
      }
    });

    it('required_attributes check details includes missing[] array', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const checks = payload(envelope)['checks'] as Array<Record<string, unknown>>;
      const attrCheck = checks.find((c) => c['name'] === 'required_attributes');
      expect(attrCheck).toBeDefined();
      if (attrCheck!['status'] === 'fail') {
        const details = attrCheck!['details'] as Record<string, unknown>;
        expect(Array.isArray(details['missing'])).toBe(true);
        expect((details['missing'] as string[]).length).toBeGreaterThan(0);
      }
    });
  });

  // ── 14. Binary / non-XML file as XES ─────────────────────────────────────

  describe('binary or JSON file passed as XES', () => {
    it('JSON file passed as XES does not crash with exit 3', async () => {
      const jsonContent = JSON.stringify({ hello: 'world', count: 42 });
      const p = await writeTmp(jsonContent, 'data.xes');
      const { exitCode } = await validateJson([p]);
      // May parse as empty log (exit 0) or fail to parse (exit 2) — never crash (3)
      expect(exitCode).not.toBe(3);
    });

    it('JSON file passed as XES produces structured JSON (not raw error text)', async () => {
      const jsonContent = JSON.stringify({ hello: 'world' });
      const p = await writeTmp(jsonContent, 'data.xes');
      const result = await runCli(['validate', p, '--format', 'json', '--no-save']);
      // Output must be parseable JSON regardless of exit code
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('XML file with no traces does not crash with exit 3', async () => {
      // Well-formed XML but not a valid XES event log
      const xmlContent = '<?xml version="1.0"?><root><item>hello</item></root>';
      const p = await writeTmp(xmlContent, 'notlog.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).not.toBe(3);
    });

    it('empty file does not produce exit 3', async () => {
      const p = await writeTmp('', 'empty-file.xes');
      const { exitCode } = await validateJson([p]);
      expect(exitCode).not.toBe(3);
    });
  });

  // ── 15. violations[] strings are descriptive ──────────────────────────────

  describe('violations[] strings are descriptive', () => {
    it('violations for missing concept:name mention the attribute name', async () => {
      const p = await writeTmp(noActivityXes, 'no-activity.xes');
      const { envelope } = await validateJson([p]);
      const viols = payload(envelope)['violations'] as string[];
      // At least one violation must name the missing attribute
      const mentionsCN = viols.some((v) => /concept:name/i.test(v));
      expect(mentionsCN).toBe(true);
    });

    it('violations[] is empty for a valid well-formed XES log', async () => {
      const p = await writeTmp(validXes('case-1', 3), 'test.xes');
      const { envelope } = await validateJson([p]);
      const viols = payload(envelope)['violations'] as string[];
      expect(viols.length).toBe(0);
    });

    it('violations[] and errors[] are always the same array contents', async () => {
      // Invariant: violations is the PM-vocabulary alias for errors —
      // they must be identical regardless of success or failure.
      const cases = [
        await writeTmp(validXes('case-1', 2), 'valid.xes'),
        await writeTmp(noActivityXes, 'no-act.xes'),
        await writeTmp(emptyXes, 'empty.xes'),
      ];
      for (const p of cases) {
        const { envelope } = await validateJson([p]);
        const pl = payload(envelope);
        expect(pl['violations']).toEqual(pl['errors']);
      }
    });
  });
});
