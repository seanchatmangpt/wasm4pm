/**
 * cognition-smoke.test.ts
 *
 * Behavioral tests for scripts/cognition-smoke.sh
 *
 * Van der Aalst QA perspective:
 * - The smoke test is itself a process: 6 sequential steps, each with a
 *   pass/fail outcome and timing. The test suite verifies that process.
 * - Each test targets one invariant of the smoke script behavior.
 * - Tests run a wrapper script with controlled synthetic steps (exit 0 = PASS,
 *   exit 1 = FAIL) to validate script logic without needing the cognition build.
 *
 * Note: date +%s%3N is Linux-only; the wrapper uses the same portable _ms()
 * helper as the real smoke script to avoid macOS arithmetic errors.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

// __dirname = apps/wasm4pm/src/__tests__
// 4 levels up → worktree root
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SMOKE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'cognition-smoke.sh');

interface SmokeScenario {
  step1: boolean;
  step2: boolean;
  step3: boolean;
  step4: boolean;
  step5: boolean;
  step6: boolean;
}

/**
 * Build a portable wrapper bash script that mirrors the smoke script structure.
 * Uses Python3-based millisecond timing (same strategy as cognition-smoke.sh)
 * to avoid macOS arithmetic failures with date +%s%3N.
 */
function buildWrapperScript(scenario: SmokeScenario): string {
  const s = (v: boolean): string => (v ? '0' : '1');

  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'GREEN=""',
    'RED=""',
    'BOLD=""',
    'RESET=""',
    '_ms() {',
    '  if command -v python3 >/dev/null 2>&1; then',
    '    python3 -c "import time; print(int(time.time()*1000))"',
    '  elif command -v gdate >/dev/null 2>&1; then',
    '    gdate +%s%3N',
    '  else',
    '    echo $(( $(date +%s) * 1000 ))',
    '  fi',
    '}',
    'pass_count=0',
    'fail_count=0',
    'overall_start=$(_ms)',
    'run_step() {',
    '  local label="$1"; shift',
    '  local step_start step_end elapsed_ms exit_code=0',
    '  step_start=$(_ms)',
    '  if "$@" >/dev/null 2>&1; then exit_code=0; else exit_code=$?; fi',
    '  step_end=$(_ms)',
    '  elapsed_ms=$(( step_end - step_start ))',
    '  if [ "$exit_code" -eq 0 ]; then',
    '    printf "${GREEN}[%4d ms] PASS${RESET} %s\\n" "$elapsed_ms" "$label"',
    '    (( pass_count++ )) || true',
    '  else',
    '    printf "${RED}[%4d ms] FAIL${RESET} %s\\n" "$elapsed_ms" "$label"',
    '    (( fail_count++ )) || true',
    '  fi',
    '}',
    'run_step "cargo check -p wasm4pm-cognition" bash -c "exit ' + s(scenario.step1) + '"',
    'run_step "cargo test -p wasm4pm-cognition --lib" bash -c "exit ' + s(scenario.step2) + '"',
    'run_step "cargo test -p prolog8 --lib" bash -c "exit ' + s(scenario.step3) + '"',
    'run_step "cognition-no-stub-scan.sh --quick" bash -c "exit ' + s(scenario.step4) + '"',
    'run_step "node facade require" bash -c "exit ' + s(scenario.step5) + '"',
    'run_step "wpm cognition adversarial detectors==8" bash -c "exit ' + s(scenario.step6) + '"',
    'overall_end=$(_ms)',
    'total_ms=$(( overall_end - overall_start ))',
    'echo ""',
    'printf "${BOLD}cognition-smoke: %d passed, %d failed -- %d ms total${RESET}\\n"' +
      ' "$pass_count" "$fail_count" "$total_ms"',
    '[ "$fail_count" -gt 0 ] && exit 1 || exit 0',
  ];

  return lines.join('\n') + '\n';
}

async function runWrapper(
  scenario: SmokeScenario
): Promise<{ stdout: string; stderr: string; exitCode: number; elapsedMs: number }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cog-smoke-'));
  const wrapperPath = path.join(tmpDir, 'wrapper.sh');

  try {
    await fs.writeFile(wrapperPath, buildWrapperScript(scenario), { mode: 0o755 });

    const t0 = Date.now();
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const child = spawn('bash', [wrapperPath], {
          env: { ...process.env, NO_COLOR: '1' },
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString();
        });
        child.on('close', (code: number | null) => {
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
      }
    );

    return { ...result, elapsedMs: Date.now() - t0 };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('cognition-smoke.sh behavioral contract', () => {
  it('emits PASS for all 6 steps and exits 0 on a synthetic happy path', async () => {
    const { stdout, exitCode, elapsedMs } = await runWrapper({
      step1: true,
      step2: true,
      step3: true,
      step4: true,
      step5: true,
      step6: true,
    });

    expect(exitCode).toBe(0);

    const passLines = stdout.split('\n').filter((l) => l.includes('PASS'));
    expect(passLines.length).toBe(6);

    const failLines = stdout.split('\n').filter((l) => l.includes('FAIL') && l.includes('ms'));
    expect(failLines.length).toBe(0);

    expect(stdout).toMatch(/cognition-smoke:/);
    expect(elapsedMs).toBeLessThan(10_000);
  }, 15_000);

  it('exits 1 and emits one FAIL line when step 1 (cargo check) fails', async () => {
    const { stdout, exitCode } = await runWrapper({
      step1: false,
      step2: true,
      step3: true,
      step4: true,
      step5: true,
      step6: true,
    });

    expect(exitCode).toBe(1);
    const failLines = stdout.split('\n').filter((l) => l.includes('FAIL') && l.includes('ms'));
    expect(failLines.length).toBe(1);
    const passLines = stdout.split('\n').filter((l) => l.includes('PASS'));
    expect(passLines.length).toBe(5);
  }, 15_000);

  it('exits 1 when step 4 (no-stub scan) detects fraud', async () => {
    const { stdout, exitCode } = await runWrapper({
      step1: true,
      step2: true,
      step3: true,
      step4: false,
      step5: true,
      step6: true,
    });

    expect(exitCode).toBe(1);
    const failLines = stdout.split('\n').filter((l) => l.includes('FAIL') && l.includes('ms'));
    expect(failLines.length).toBe(1);
  }, 15_000);

  it('exits 1 when step 6 (adversarial detector count) fails', async () => {
    const { stdout, exitCode } = await runWrapper({
      step1: true,
      step2: true,
      step3: true,
      step4: true,
      step5: true,
      step6: false,
    });

    expect(exitCode).toBe(1);
    const failLines = stdout.split('\n').filter((l) => l.includes('FAIL') && l.includes('ms'));
    expect(failLines.length).toBe(1);
  }, 15_000);

  it('emits timing bracket on every step line', async () => {
    const { stdout } = await runWrapper({
      step1: true,
      step2: true,
      step3: true,
      step4: true,
      step5: true,
      step6: true,
    });

    const stepLines = stdout.split('\n').filter((l) => /\[\s*\d+ ms\]/.test(l));
    expect(stepLines.length).toBe(6);
    for (const line of stepLines) {
      expect(line).toMatch(/\[\s*\d+ ms\] (PASS|FAIL)/);
    }
  }, 15_000);

  it('smoke script exists and is executable', async () => {
    const stat = await fs.stat(SMOKE_SCRIPT);
    // owner execute bit (0o100)
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it('emits summary line in format "cognition-smoke: N passed, M failed"', async () => {
    const { stdout } = await runWrapper({
      step1: true,
      step2: false,
      step3: true,
      step4: true,
      step5: true,
      step6: true,
    });

    expect(stdout).toMatch(/cognition-smoke: \d+ passed, \d+ failed/);
    expect(stdout).toMatch(/cognition-smoke: 5 passed, 1 failed/);
  }, 15_000);

  it('all 6 steps contribute to the pass/fail count in the summary', async () => {
    const { stdout, exitCode } = await runWrapper({
      step1: true,
      step2: false,
      step3: true,
      step4: false,
      step5: true,
      step6: false,
    });

    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/cognition-smoke: 3 passed, 3 failed/);
  }, 15_000);
});
