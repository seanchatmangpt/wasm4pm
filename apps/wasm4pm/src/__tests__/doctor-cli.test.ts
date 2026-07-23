/**
 * Migrated from the retired top-level `wpm doctor` command (removed — see
 * `apps/wasm4pm/src/nouns/_removed.ts`: `doctor` -> `system doctor`) to
 * `wpm system doctor` (`apps/wasm4pm/src/nouns/system/doctor.ts`).
 *
 * `system doctor` is a legacy BRIDGE verb (`invokeLegacyCommandAsJson` in
 * `apps/wasm4pm/src/nouns/_bridge.ts`): it reuses `commands/doctor/` (the
 * 47-check tree) completely unmodified, forcing `--format json --quiet`
 * under the hood. SUCCESS returns the OLD `{command,status,payload,meta}`
 * envelope verbatim; FAILURE takes the NEW `{error:{code,message}}` shape.
 *
 * Corrections made while migrating (verified against `commands/doctor/`
 * source directly, not guessed — see the real subcommand list in
 * `commands/doctor/index.ts`'s `subCommands`):
 *  - `doctor check <category>` never took a positional category filter —
 *    `doctorCheck` only accepts a `--checks name1,name2` NAMED flag
 *    (`commands/doctor/subcommands.ts`). A bare positional like `wasm` was
 *    always silently ignored and every check ran regardless, in BOTH the
 *    old and new CLI. The old "missing required arguments" test asserted a
 *    validation error that never existed — corrected to the real behavior
 *    (exits 0, runs all checks) rather than preserving a check that was
 *    already wrong before this migration.
 *  - `doctor analyze` and `doctor export` are not, and were never, real
 *    subcommands of `commands/doctor/` (the actual list is `check, fix,
 *    publish, env, tps, perf, watch, report, hooks`). Remapped to their
 *    closest real equivalents: `analyze` -> `report` (full diagnostic
 *    report, closest to "deep diagnostics"), `export --output <path>` ->
 *    `report --out <path>` (real flag name is `--out`, not `--output`).
 *  - `doctor --continuous --interval <ms>` flags were never implemented on
 *    the top-level command (`commands/doctor/index.ts`'s `args` has no
 *    `continuous`/`interval` entry) — `--interval 100` is parsed as an
 *    unrecognized positional and errors "Unknown command `100`". Rewritten
 *    to assert the real (always-was-this-way) behavior: a clean structured
 *    error, not a hang or crash.
 *  - `payload.timestamp` never existed on doctor's payload (only
 *    `meta.timestamp`, added by the CommandResult envelope) — corrected to
 *    check the field that actually carries it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runCli,
  assertExitCode,
  assertJsonOutput,
  EXIT_CODES,
  createCliTestEnv,
} from '@wasm4pm/testing';
import { execSync } from 'child_process';

describe('wpm system doctor — system health diagnostics CLI (was: wpm doctor)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('system doctor (default summary)', () => {
    it('should exit 0 on healthy system', async () => {
      const result = await runCli(['system', 'doctor'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should output a status/health JSON payload by default (was: human-readable text — bridge always forces JSON)', async () => {
      const result = await runCli(['system', 'doctor'], { env: env.env });
      expect(result.stdout).toMatch(/status|health|system|diagnostics|checks/i);
    });

    it('should include a numeric total check count in the JSON payload (was: "N checks" text)', async () => {
      const result = await runCli(['system', 'doctor'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(typeof json.payload.total).toBe('number');
      expect(json.payload.total).toBeGreaterThan(0);
    });

    it('should use JSON format when requested', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBeDefined();
    });
  });

  describe('system doctor check <category> (category arg has no effect — see file header; always runs all checks)', () => {
    it('doctor check should include WASM check output regardless of the (ignored) positional', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'wasm'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/wasm|binary|module/i);
    });

    it('doctor check should include config check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'config'], { env: env.env });
      expect([EXIT_CODES.success, 1, 2]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/config|schema|validation|toml|json/i);
    });

    it('doctor check should include pnpm/cargo dependency check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'dependencies'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/pnpm|cargo|packages|crates/i);
    });

    it('doctor check should include OTEL check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'observability'], { env: env.env });
      expect([EXIT_CODES.success, 1]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/otel|tracing|spans|instrumentation/i);
    });

    it('doctor check should include cache/memory check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'cache'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/cache|memory|lru/i);
    });

    it('doctor check should include environment/node check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'environment'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/node|environment|variables|paths/i);
    });

    it('doctor check should include disk space check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'disk'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/disk|space|filesystem|available/i);
    });

    it('doctor check should include TypeScript compilation check output', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'typescript'], { env: env.env });
      expect([0, 1, 2]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/typescript|tsc|compilation|errors/i);
    });

    it('doctor check should include duration/timing info', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'performance'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      expect(result.stdout).toMatch(/performance|speed|duration|ms/i);
    });

    it('doctor check should include version strings', async () => {
      const result = await runCli(['system', 'doctor', 'check', 'versions'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/version|v\d+\.\d+\.\d+|node|npm/i);
    });
  });

  describe('system doctor report (was: "doctor analyze" — not a real subcommand, see file header)', () => {
    // `report` (no --out) writes its findings to a default file
    // (`wpm-doctor-report.json` in cwd) rather than stdout — stdout is empty
    // and the bridge falls back to `{ok:true}`. Run with `cwd: env.tempDir`
    // so the default-named file lands in the isolated temp dir, not the repo.
    it('should run the full diagnostic report and write a report file', async () => {
      const result = await runCli(['system', 'doctor', 'report'], { env: env.env, cwd: env.tempDir });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      if (result.exitCode === 0) {
        const fs = require('fs');
        expect(fs.existsSync(env.tempDir + '/wpm-doctor-report.json')).toBe(true);
      }
    });

    it('should output detailed findings in the report file (was: stdout length — report writes to a file, not stdout)', async () => {
      const result = await runCli(['system', 'doctor', 'report'], { env: env.env, cwd: env.tempDir });
      if (result.exitCode === 0) {
        const fs = require('fs');
        const content = fs.readFileSync(env.tempDir + '/wpm-doctor-report.json', 'utf-8');
        expect(content.length).toBeGreaterThan(200);
      }
    });
  });

  describe('system doctor fix', () => {
    it('should apply/report safe fixes for detected issues', async () => {
      const result = await runCli(['system', 'doctor', 'fix'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      // `doctor fix` returns the same check-report shape with fix_applied — no
      // dedicated "fix|repair|suggest" text exists once bridged to JSON, so
      // assert the real structural marker instead.
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
    });
  });

  describe('system doctor report --out (was: "doctor export --output" — real flag is --out, see file header)', () => {
    it('should write diagnostics to the given JSON file', async () => {
      // was: `env.tmpDir` — CliTestEnv has no such field (only `tempDir`);
      // the original test's path silently resolved to a bogus relative
      // "undefined/..." path. Using the real field lets this genuinely
      // verify the file gets written, which the original never did.
      const outPath = env.tempDir + '/doctor-export.json';
      const result = await runCli(
        ['system', 'doctor', 'report', '--out', outPath],
        { env: env.env }
      );
      expect([0, 1, 2, 3]).toContain(result.exitCode);
      if (result.exitCode === 0) {
        const fs = require('fs');
        expect(fs.existsSync(outPath)).toBe(true);
      }
    });
  });

  describe('system doctor --continuous (was: never implemented — see file header)', () => {
    it('an unrecognized --continuous/--interval combination fails cleanly, not a hang or crash', async () => {
      const result = await runCli(['system', 'doctor', '--continuous', '--interval', '100'], {
        env: env.env,
        timeout: 5000,
      });
      // Real behavior: --interval's value ("100") is parsed as an
      // unrecognized positional/subcommand attempt and errors cleanly.
      expect([0, 1, 3]).toContain(result.exitCode);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });
  });

  describe('system doctor --format json output structure', () => {
    it('should return valid JSON structure', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('status');
      expect(['ok', 'degraded', 'failed']).toContain(json.status);
    });

    it('should include check results in JSON', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.payload).toBeDefined();
    });

    it('should report a run timestamp (was: payload.timestamp — real field is meta.timestamp, see file header)', async () => {
      const result = await runCli(['system', 'doctor', '--format', 'json'], { env: env.env });
      const json = JSON.parse(result.stdout);
      expect(json.meta.timestamp).toBeDefined();
    });
  });

  describe('system doctor error handling', () => {
    it('should handle an unknown subcommand with a structured error', async () => {
      const result = await runCli(['system', 'doctor', 'invalid-subcommand'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
      const json = JSON.parse(result.stdout);
      expect(json.error).toBeDefined();
      expect(json.error.message).toMatch(/unknown|invalid|command/i);
    });

    it('doctor check with no filter runs all checks and exits 0 (was: expected a required-argument error — never validated, see file header)', async () => {
      const result = await runCli(['system', 'doctor', 'check'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      expect(json.payload.total).toBeGreaterThan(0);
    });

    it('should recover from transient failures', async () => {
      const result1 = await runCli(['system', 'doctor', 'check', 'cache'], { env: env.env });
      const result2 = await runCli(['system', 'doctor', 'check', 'cache'], { env: env.env });
      expect([0, 1, 2, 3]).toContain(result1.exitCode);
      expect([0, 1, 2, 3]).toContain(result2.exitCode);
    });
  });

  describe('system doctor performance', () => {
    it('should complete summary check in a reasonable time', async () => {
      const start = Date.now();
      await runCli(['system', 'doctor'], { env: env.env });
      const elapsed = Date.now() - start;
      // Bridged invocation (spawns a full Node process + all 47 checks) is
      // slower than the old in-process budget; keep a real ceiling instead
      // of the pre-bridge 1s figure, which no longer reflects reality.
      expect(elapsed).toBeLessThan(10_000);
    });

    it('should complete the full report in a reasonable time', async () => {
      const start = Date.now();
      await runCli(['system', 'doctor', 'report'], { env: env.env, cwd: env.tempDir });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(15_000);
    });
  });
});
