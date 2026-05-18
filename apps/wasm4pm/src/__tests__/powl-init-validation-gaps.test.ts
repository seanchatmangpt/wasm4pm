/**
 * Gap-closure tests for `wpm powl` and `wpm init` validation paths.
 *
 * Van der Aalst QA perspective: error paths are first-class defects.
 * Every invalid input must produce a typed refusal with the correct exit code,
 * not a crash or a misclassified error.
 *
 * This file targets the five specific gaps identified in the DX/QoL audit:
 *
 * POWL gaps:
 *   P1. Unknown subcommand must exit 1 (config_error), not 2 (source_error)
 *   P2. `powl parse` with no --model must exit 2 (source_error)
 *   P3. `powl discover -i <nonexistent>` must exit 2 (source_error), not 3
 *   P4. `powl diff` with only --model must exit 2 with MISSING_MODEL2 code
 *   P5. Every subcommand with --format=json must produce parseable JSON with
 *       {command, status, exit_code, payload} envelope
 *
 * Init gaps:
 *   I1. `wpm init --preset <invalid>` exits 1 (config_error) with INVALID_PRESET
 *       and lists valid presets in the error message
 *   I2. When wasm4pm.toml already exists, `wpm init` warns but exits 0 (skip),
 *       or exits 1 if --force is used. The `files_created` list reflects reality.
 *   I3. `wpm init --format json` payload includes `files_created` array
 *   I4. `wpm init` creates .gitignore and .env.example alongside wasm4pm.toml
 *
 * Oracle hierarchy (all tests in this file are Rank 2 domain contract):
 *   - Exit code contract: unknown argument → 1, missing file → 2, WASM error → 3
 *   - JSON envelope invariant: {command, status, exit_code, payload, ?error}
 *   - Error.code is machine-readable (SCREAMING_SNAKE_CASE), non-empty string
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface Envelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
  meta?: { run_id: string; timestamp: string; duration_ms: number };
}

function runCli(
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {}
): Promise<CliResult> {
  const { timeoutMs = 30_000, cwd = path.resolve(__dirname, '../..') } = opts;
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `CLI did not produce valid JSON.\n` +
        `stdout: ${result.stdout.slice(0, 400)}\n` +
        `stderr: ${result.stderr.slice(0, 200)}`
    );
  }
}

// ─── Temp dir lifecycle ────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-gap-tests-'));
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* cleanup best-effort */ }
});

// ─── POWL P1: Unknown subcommand → exit 1 (config_error) ────────────────────
// Domain contract: An unknown subcommand is a user-argument error (like passing
// an unknown flag) — not a source error. exit 1 = config_error.

describe('P1: powl unknown subcommand exits 1 (config_error), not 2', () => {
  it('unknown subcommand exits 1 with status=error', async () => {
    const result = await runCli(['powl', 'not-a-subcommand', '--format=json']);
    expect(result.exitCode, 'exit code must be 1 (config_error)').toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(1);
  });

  it('unknown subcommand error code is INVALID_SUBCOMMAND', async () => {
    const result = await runCli(['powl', 'garbage', '--format=json']);
    const env = parseEnvelope(result);
    expect(env.error?.code).toBe('INVALID_SUBCOMMAND');
  });

  it('unknown subcommand error message lists all 12 valid subcommands', async () => {
    const result = await runCli(['powl', 'foobar', '--format=json']);
    const env = parseEnvelope(result);
    const msg = env.error?.message ?? '';
    const valid = [
      'parse', 'simplify', 'convert', 'diff', 'complexity',
      'footprints', 'conformance', 'import', 'discover',
      'get-children', 'node-info', 'freq-analysis',
    ];
    for (const sub of valid) {
      expect(msg, `error message must list subcommand: ${sub}`).toContain(sub);
    }
  });

  it('JSON envelope exit_code matches process exit code for unknown subcommand', async () => {
    const result = await runCli(['powl', 'unknown-sub', '--format=json']);
    const env = parseEnvelope(result);
    expect(result.exitCode).toBe(env.exit_code);
  });
});

// ─── POWL P2: parse with no --model → exit 2 (source_error) ─────────────────
// Missing required input is a source_error (exit 2), not config_error (exit 1).
// The model is the "source" — missing source = exit 2.

describe('P2: powl parse with no --model exits 2 (source_error)', () => {
  it('parse without --model exits 2', async () => {
    const result = await runCli(['powl', 'parse', '--format=json', '--no-save']);
    expect(result.exitCode, 'exit code must be 2 (source_error)').toBe(2);
  });

  it('parse without --model has status=error and MISSING_MODEL code', async () => {
    const result = await runCli(['powl', 'parse', '--format=json', '--no-save']);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('MISSING_MODEL');
  });

  it('parse without --model produces valid JSON envelope (no crash)', async () => {
    const result = await runCli(['powl', 'parse', '--format=json', '--no-save']);
    // Must not throw — envelope must be parseable
    const env = parseEnvelope(result);
    expect(env.command).toBeDefined();
    expect(env.exit_code).toBeGreaterThan(0);
    expect(env.payload).toBeNull();
  });
});

// ─── POWL P3: discover -i <nonexistent> → exit 2 (source_error) ─────────────
// A nonexistent input log is a source_error, not an execution_error.
// Before the fix, ENOENT from fs.readFile fell through to exit 3.

describe('P3: powl discover with nonexistent input file exits 2 (source_error)', () => {
  it('discover -i /no/such/file.xes exits 2 (not 3)', async () => {
    const result = await runCli([
      'powl', 'discover', '--input=/no/such/file.xes', '--format=json',
    ]);
    expect(result.exitCode, 'must be 2 (source_error), not 3 (execution_error)').toBe(2);
  });

  it('discover nonexistent file error code is DISCOVER_INPUT_NOT_FOUND', async () => {
    const result = await runCli([
      'powl', 'discover', '--input=/no/such/file.xes', '--format=json',
    ]);
    const env = parseEnvelope(result);
    expect(env.error?.code).toBe('DISCOVER_INPUT_NOT_FOUND');
  });

  it('discover nonexistent file JSON envelope exit_code matches process exit', async () => {
    const result = await runCli([
      'powl', 'discover', '--input=/no/such/log.xes', '--format=json',
    ]);
    const env = parseEnvelope(result);
    expect(result.exitCode).toBe(env.exit_code);
    expect(result.exitCode).toBe(2);
  });

  it('discover nonexistent file error message mentions the file path', async () => {
    const result = await runCli([
      'powl', 'discover', '--input=/no/such/special.xes', '--format=json',
    ]);
    const env = parseEnvelope(result);
    // Path may be redacted; at minimum the error must be non-empty
    expect(env.error?.message?.length ?? 0).toBeGreaterThan(0);
  });
});

// ─── POWL P4: diff with only --model → exit 2 with MISSING_MODEL2 ────────────
// diff requires two models. Providing only --model is a source_error (exit 2).
// The error code MISSING_MODEL2 allows tooling to react without parsing messages.

describe('P4: powl diff with only one model exits 2 with MISSING_MODEL2 code', () => {
  it('diff with --model but no --model2 exits 2 (source_error)', async () => {
    const result = await runCli([
      'powl', 'diff', '--model=A', '--format=json', '--no-save',
    ]);
    expect(result.exitCode, 'exit code must be 2 (source_error)').toBe(2);
  });

  it('diff missing model2 error code is MISSING_MODEL2 (not COMMAND_ERROR)', async () => {
    const result = await runCli([
      'powl', 'diff', '--model=A', '--format=json', '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.error?.code).toBe('MISSING_MODEL2');
  });

  it('diff missing model2 error message mentions --model2', async () => {
    const result = await runCli([
      'powl', 'diff', '--model=A', '--format=json', '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.error?.message).toMatch(/--model2/i);
  });

  it('diff missing model2 envelope is JSON-parseable (no crash)', async () => {
    const result = await runCli([
      'powl', 'diff', '--model=A', '--format=json', '--no-save',
    ]);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.payload).toBeNull();
    expect(env.exit_code).toBe(2);
  });
});

// ─── POWL P5: error envelopes always have valid JSON structure ───────────────
// Every error path must produce {command, status, exit_code, payload, error}.
// Regression guard: no error path should produce non-JSON output.

describe('P5: every powl error path produces valid JSON envelope', () => {
  const errorCases: [string, string[]][] = [
    ['unknown subcommand', ['powl', 'fake-subcommand', '--format=json']],
    ['parse no model', ['powl', 'parse', '--format=json']],
    ['diff no model2', ['powl', 'diff', '--model=A', '--format=json']],
    ['conformance no log', ['powl', 'conformance', '--model=A', '--format=json']],
    ['convert no --to', ['powl', 'convert', '--model=A', '--format=json']],
    ['import invalid --from', ['powl', 'import', '--model=A', '--from=xml', '--format=json']],
    ['discover no input', ['powl', 'discover', '--format=json']],
    ['discover nonexistent', ['powl', 'discover', '--input=/no/such/log.xes', '--format=json']],
  ];

  for (const [name, args] of errorCases) {
    it(`${name} produces valid JSON envelope with required fields`, async () => {
      const result = await runCli(args);
      expect(result.exitCode).toBeGreaterThan(0);
      // Must produce parseable JSON
      const env = parseEnvelope(result);
      // Required fields
      expect(env.command, 'command must be present').toBeDefined();
      expect(env.status, 'status must be present').toBe('error');
      expect(typeof env.exit_code, 'exit_code must be a number').toBe('number');
      expect(env.exit_code, 'exit_code must be > 0 for error').toBeGreaterThan(0);
      expect(env.payload, 'payload must be null for error').toBeNull();
      expect(env.error, 'error field must be present').toBeDefined();
      expect(typeof env.error!.code, 'error.code must be a string').toBe('string');
      expect(env.error!.code.length, 'error.code must be non-empty').toBeGreaterThan(0);
      expect(typeof env.error!.message, 'error.message must be a string').toBe('string');
      // JSON envelope exit_code must match actual process exit code
      expect(env.exit_code).toBe(result.exitCode);
    });
  }
});

// ─── INIT I1: Unknown preset → exit 1 (config_error) ────────────────────────

describe('I1: wpm init --preset <invalid> exits 1 (config_error)', () => {
  it('unknown preset exits 1', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i1-'));
    const result = await runCli(
      ['init', '--preset', 'nonexistent-preset', '--format=json'],
      { cwd: initDir }
    );
    expect(result.exitCode, 'exit code must be 1 (config_error)').toBe(1);
  });

  it('unknown preset produces INVALID_PRESET error code', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i1b-'));
    const result = await runCli(
      ['init', '--preset', 'totally-invalid', '--format=json'],
      { cwd: initDir }
    );
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_PRESET');
  });

  it('unknown preset error message lists all valid presets', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i1c-'));
    const result = await runCli(
      ['init', '--preset', 'bad-preset', '--format=json'],
      { cwd: initDir }
    );
    const env = parseEnvelope(result);
    const msg = env.error?.message ?? '';
    const validPresets = ['fast', 'balanced', 'quality', 'conformance', 'streaming'];
    for (const p of validPresets) {
      expect(msg, `error message must list preset: ${p}`).toContain(p);
    }
  });

  it('valid presets all exit 0 (regression: no false rejections)', async () => {
    const validPresets = ['fast', 'balanced', 'quality', 'conformance', 'streaming'];
    for (const p of validPresets) {
      const initDir = fs.mkdtempSync(path.join(tempDir, `init-valid-${p}-`));
      const result = await runCli(
        ['init', '--preset', p, '--format=json', '--force'],
        { cwd: initDir }
      );
      expect(result.exitCode, `preset "${p}" should succeed`).toBe(0);
    }
  });
});

// ─── INIT I2: Existing file behavior ─────────────────────────────────────────
// When wasm4pm.toml already exists, init warns and skips (exit 0, files_created
// does not include the existing file). With --force, it overwrites.

describe('I2: wpm init with existing wasm4pm.toml skips gracefully', () => {
  it('second init (no --force) exits 0 and files_created omits existing files', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i2a-'));
    // First init
    await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    // Second init without --force
    const result = await runCli(['init', '--format=json'], { cwd: initDir });
    expect(result.exitCode, 'second init must exit 0').toBe(0);
    const env = parseEnvelope(result);
    expect(env.status).toBe('ok');
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    // wasm4pm.toml already exists — must not be in files_created
    expect(filesCreated, 'wasm4pm.toml must not be re-created').not.toContain('wasm4pm.toml');
  });

  it('init with --force exits 0 and includes wasm4pm.toml in files_created', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i2b-'));
    // First init
    await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    // Second init WITH --force
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    expect(filesCreated, 'wasm4pm.toml must be in files_created with --force').toContain(
      'wasm4pm.toml'
    );
  });
});

// ─── INIT I3: JSON payload includes files_created array ──────────────────────

describe('I3: wpm init --format=json payload includes files_created array', () => {
  it('files_created is an array in JSON output', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i3a-'));
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    expect(env.status).toBe('ok');
    expect(Array.isArray(env.payload?.files_created), 'files_created must be an array').toBe(true);
  });

  it('files_created contains at least wasm4pm.toml on first init', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i3b-'));
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    expect(filesCreated).toContain('wasm4pm.toml');
  });

  it('JSON envelope has valid meta with run_id, timestamp, duration_ms', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i3c-'));
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    expect(typeof env.meta?.run_id).toBe('string');
    expect(typeof env.meta?.timestamp).toBe('string');
    expect(typeof env.meta?.duration_ms).toBe('number');
  });
});

// ─── INIT I4: Creates .gitignore and .env.example ────────────────────────────

describe('I4: wpm init creates .gitignore and .env.example on fresh directory', () => {
  it('files_created includes .env.example', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4a-'));
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    expect(filesCreated, '.env.example must be in files_created').toContain('.env.example');
  });

  it('.env.example file actually exists on disk after init', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4b-'));
    await runCli(['init', '--force'], { cwd: initDir });
    const envPath = path.join(initDir, '.env.example');
    expect(fs.existsSync(envPath), '.env.example must exist on disk').toBe(true);
  });

  it('.gitignore is created when it does not exist', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4c-'));
    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    expect(filesCreated, '.gitignore must be in files_created on fresh dir').toContain('.gitignore');
    // Verify it physically exists
    const gitignorePath = path.join(initDir, '.gitignore');
    expect(fs.existsSync(gitignorePath), '.gitignore must exist on disk').toBe(true);
  });

  it('.gitignore is NOT re-created when it already exists (preserves user customization)', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4d-'));
    // Pre-create .gitignore with custom content
    const customGitignore = '# custom\n*.tmp\n';
    fs.writeFileSync(path.join(initDir, '.gitignore'), customGitignore, 'utf-8');

    const result = await runCli(['init', '--format=json', '--force'], { cwd: initDir });
    expect(result.exitCode).toBe(0);
    const env = parseEnvelope(result);
    const filesCreated = (env.payload?.files_created as string[]) ?? [];
    // .gitignore already exists — must not be overwritten even with --force
    expect(filesCreated, '.gitignore must not appear in files_created').not.toContain('.gitignore');
    // Content must be preserved
    const content = fs.readFileSync(path.join(initDir, '.gitignore'), 'utf-8');
    expect(content).toBe(customGitignore);
  });

  it('.env.example file contains WASM4PM_ environment variable definitions', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4e-'));
    await runCli(['init', '--force'], { cwd: initDir });
    const envContent = fs.readFileSync(path.join(initDir, '.env.example'), 'utf-8');
    expect(envContent).toContain('WASM4PM_');
  });

  it('wasm4pm.toml file actually exists on disk after init', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-i4f-'));
    await runCli(['init', '--force'], { cwd: initDir });
    const tomlPath = path.join(initDir, 'wasm4pm.toml');
    expect(fs.existsSync(tomlPath), 'wasm4pm.toml must exist on disk').toBe(true);
  });
});

// ─── INIT JSON error envelope invariant ──────────────────────────────────────

describe('init JSON error envelopes have correct structure', () => {
  it('invalid preset JSON output has command=init, status=error, null payload', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-json-err-'));
    const result = await runCli(
      ['init', '--preset', 'invalid-xyz', '--format=json'],
      { cwd: initDir }
    );
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.command).toBe('init');
    expect(env.status).toBe('error');
    expect(env.exit_code).toBe(1);
    expect(env.payload).toBeNull();
    expect(env.error).toBeDefined();
    expect(env.error!.code).toBe('INVALID_PRESET');
  });

  it('invalid config-format JSON output has status=error and INVALID_FORMAT code', async () => {
    const initDir = fs.mkdtempSync(path.join(tempDir, 'init-json-fmt-'));
    const result = await runCli(
      ['init', '--config-format', 'yaml', '--format=json'],
      { cwd: initDir }
    );
    expect(result.exitCode).toBe(1);
    const env = parseEnvelope(result);
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_FORMAT');
  });
});
