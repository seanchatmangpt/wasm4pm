/**
 * config-export-cli.test.ts
 *
 * CLI integration tests for `wpm config export`.
 *
 * Migration note (`nouns/config/export.ts` bridges the unchanged legacy
 * `commands/config/export.ts` via `nouns/_bridge.ts`'s
 * `invokeLegacyCommandAsJson`). `config export` overloads its own
 * `--format` flag for the export's DATA format (toml/env/json) rather
 * than a human/json rendering toggle — `stripLegacyOutputFlags` (in
 * `nouns/_bridge.ts`) only strips `--format json`/`--format human`
 * (and forces its own `--format=json` on top when no domain value was
 * kept); any OTHER `--format` value (toml/env/xml/...) is left verbatim
 * for the legacy command to interpret itself. Concretely, verified live
 * against the built CLI:
 *
 *   - no `--format` (or `--format json`/`human`) → the bridge forces
 *     `--format=json` → the legacy command's real JSON path runs → the
 *     resolved config object is returned directly (no wrapper).
 *   - `--format toml`/`--format env` (any case) → kept verbatim → the
 *     legacy command emits real TOML/ENV text on stdout, which is not
 *     JSON — the bridge's always-JSON-on-stdout contract can't return it
 *     as-is, so it wraps it as `{ raw: "<text>" }` instead of dropping it.
 *   - `--format xml` (invalid) → kept verbatim → the legacy command's own
 *     format-whitelist check rejects it (config_error) → the bridge
 *     collapses that to a generic `INVALID_INPUT`/source_error(2) (same
 *     lossy mapping as `model compare`'s `--format badformat`, see
 *     `compare-diff-cli.test.ts`'s C-2). The specific diagnostic text
 *     ("Invalid --format value: 'xml'...") is NOT captured through the
 *     bridge here — a known gap (tracked separately) where human-format
 *     error diagnostics from some legacy commands don't reach the
 *     caller; only the generic "command exited with code 1" message
 *     does. Documented, not silently accepted as fine.
 *   - `--registry` → algorithm registry JSON Schema, exit 0 (checked
 *     before `--format` in the legacy command, unaffected by any of the
 *     above).
 *
 * Oracle rank: Rank-2 (domain contract) — the command is supposed to write
 * content to stdout and exit 0. Deleting the command would cause all tests
 * to fail with "Process failed to start" or wrong exit code.
 *
 * No mocking of the WASM core.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const CWD = path.resolve(__dirname, '../..');

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function runCli(args: string[], timeoutMs = 20_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd: CWD },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

// ---------------------------------------------------------------------------
// Default / --format json / --format human — bridge forces real JSON path
// ---------------------------------------------------------------------------
describe('wpm config export — default and --format json/human (bridge-forced JSON)', () => {
  it('exits 0 with no --format flag and returns the resolved config object directly', async () => {
    const result = await runCli(['config', 'export']);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('source');
    expect(parsed).toHaveProperty('algorithm');
    expect(parsed).toHaveProperty('execution');
  });

  it('--format json gives the same shape as the default', async () => {
    const result = await runCli(['config', 'export', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('algorithm');
    expect(parsed).toHaveProperty('execution');
  });

  it('--format human is stripped the same way — still returns the JSON config object, not human text', async () => {
    const result = await runCli(['config', 'export', '--format', 'human']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('source');
  });
});

// ---------------------------------------------------------------------------
// --format toml/env — kept verbatim by the bridge, real TOML/ENV text comes
// back wrapped as { raw: "<text>" } (stdout must still be valid JSON).
// ---------------------------------------------------------------------------
describe('wpm config export — --format toml/env (real domain values, wrapped as { raw })', () => {
  it('--format toml exits 0 and returns real TOML text wrapped in { raw }', async () => {
    const result = await runCli(['config', 'export', '--format', 'toml']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { raw?: string };
    expect(typeof parsed.raw).toBe('string');
    expect(parsed.raw).toMatch(/\[source\]/);
    expect(parsed.raw).toMatch(/kind = "/);
  });

  it('--format env exits 0 and returns real WASM4PM_ env lines wrapped in { raw }', async () => {
    const result = await runCli(['config', 'export', '--format', 'env']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { raw?: string };
    expect(typeof parsed.raw).toBe('string');
    expect(parsed.raw).toMatch(/WASM4PM_/);
  });

  it('--format TOML (uppercase) still resolves to TOML text (the legacy command lowercases internally)', async () => {
    const result = await runCli(['config', 'export', '--format', 'TOML']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { raw?: string };
    expect(parsed.raw).toMatch(/\[source\]/);
  });

  it('--format ENV (uppercase) still resolves to ENV text', async () => {
    const result = await runCli(['config', 'export', '--format', 'ENV']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as { raw?: string };
    expect(parsed.raw).toMatch(/WASM4PM_/);
  });
});

// ---------------------------------------------------------------------------
// Unknown format → the legacy command's own config_error(1) is collapsed by
// the generic bridge into source_error(2), same as model compare's C-2.
// ---------------------------------------------------------------------------
describe('wpm config export — unrecognised --format value', () => {
  it('exits 2 (source_error) for an unrecognised format, via the generic {error:{code,message}} envelope', async () => {
    const result = await runCli(['config', 'export', '--format', 'xml']);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as { error?: { code?: string; message?: string } };
    expect(parsed.error).toBeDefined();
    expect(parsed.error?.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// --registry — algorithm registry JSON Schema (checked before --format in
// the legacy command, unaffected by any of the above)
// ---------------------------------------------------------------------------
describe('wpm config export — --registry', () => {
  it('exits 0 and returns a JSON Schema document for the algorithm registry', async () => {
    const result = await runCli(['config', 'export', '--registry']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('$schema');
    expect(parsed).toHaveProperty('algorithms');
    expect(typeof parsed.algorithms).toBe('object');
  });
});
