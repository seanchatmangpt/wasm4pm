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
 * Create a fake workspace root with stub binaries for each step.
 * The real cognition-smoke.sh is spawned with WASM4PM_SMOKE_ROOT pointing to this tmpDir.
 */
async function createFakeRoot(scenario: SmokeScenario, tmpDir: string): Promise<void> {
  const binDir = path.join(tmpDir, 'apps', 'wasm4pm', 'dist', 'bin');
  const scriptsDir = path.join(tmpDir, 'scripts');
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(scriptsDir, { recursive: true });

  // cargo stub: branches on subcommand to control steps 1, 2, 3
  // Steps 2 and 3 check for "test result: ok" in grep, so only output it on success
  const cargoLines = [
    '#!/usr/bin/env bash',
    'case "$*" in',
    `  *check*) exit ${scenario.step1 ? 0 : 1} ;;`,
    scenario.step2
      ? `  *wasm4pm-cognition*) echo "test result: ok. 1 passed"; exit 0 ;;`
      : `  *wasm4pm-cognition*) echo "test result: FAILED. 0 passed"; exit 1 ;;`,
    scenario.step3
      ? `  *prolog8*) echo "test result: ok. 1 passed"; exit 0 ;;`
      : `  *prolog8*) echo "test result: FAILED. 0 passed"; exit 1 ;;`,
    '  *) exit 0 ;;',
    'esac',
  ];
  await fs.writeFile(path.join(tmpDir, 'cargo'), cargoLines.join('\n'), { mode: 0o755 });

  // cognition-no-stub-scan.sh stub (step 4)
  await fs.writeFile(
    path.join(scriptsDir, 'cognition-no-stub-scan.sh'),
    `#!/usr/bin/env bash\nexit ${scenario.step4 ? 0 : 1}\n`,
    { mode: 0o755 }
  );

  // node requires cognition module (step 5)
  // Create a fake packages/cognition/dist/index.js that throws or succeeds based on scenario
  const cognitionDistDir = path.join(tmpDir, 'packages', 'cognition', 'dist');
  await fs.mkdir(cognitionDistDir, { recursive: true });
  await fs.writeFile(
    path.join(cognitionDistDir, 'index.js'),
    scenario.step5
      ? `// stub cognition module\nmodule.exports = {};\n`
      : `throw new Error('cognition stub: step5=false');\n`
  );

  // wpm stub (step 6)
  // The real step 6 invokes: wpm cognition adversarial --format json
  // then pipes through jq and checks if payload.detectors.length === 8
  // So the stub must output valid JSON with 8 detectors (or 0 if scenario.step6 = false)
  const detectorCount = scenario.step6 ? 8 : 0;
  const wpmOutput = {
    status: 'success',
    command: 'cognition adversarial',
    payload: {
      detectors: Array.from({ length: detectorCount }, (_, i) => ({
        id: i + 1,
        name: `detector_${i + 1}`,
      })),
    },
  };
  await fs.writeFile(
    path.join(binDir, 'wpm.js'),
    `#!/usr/bin/env node\nif (process.argv.includes('--format') && process.argv.includes('json')) {\n` +
    `  console.log(${JSON.stringify(JSON.stringify(wpmOutput))});\n` +
    `  process.exit(0);\n` +
    `}\nprocess.exit(1);\n`,
    { mode: 0o755 }
  );
}

/**
 * Spawn the real cognition-smoke.sh script with controlled stub binaries.
 * Uses WASM4PM_SMOKE_ROOT env var to inject fake workspace root.
 * The actual script logic (run_step, timing, counters, summary) executes.
 */
async function runRealSmokeScript(
  scenario: SmokeScenario
): Promise<{ stdout: string; stderr: string; exitCode: number; elapsedMs: number }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cog-smoke-'));
  try {
    await createFakeRoot(scenario, tmpDir);
    const t0 = performance.now();
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        const child = spawn('bash', [SMOKE_SCRIPT], {
          env: {
            ...process.env,
            NO_COLOR: '1',
            WASM4PM_SMOKE_ROOT: tmpDir,
            PATH: `${tmpDir}:${process.env['PATH'] ?? ''}`,
          },
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

    return { ...result, elapsedMs: Math.round(performance.now() - t0) };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

describe('cognition-smoke.sh behavioral contract', () => {
  it('emits PASS for all 6 steps and exits 0 on a synthetic happy path', async () => {
    const { stdout, exitCode, elapsedMs } = await runRealSmokeScript({
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
    const { stdout, exitCode } = await runRealSmokeScript({
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
    const { stdout, exitCode } = await runRealSmokeScript({
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
    const { stdout, exitCode } = await runRealSmokeScript({
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
    const { stdout } = await runRealSmokeScript({
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
    const { stdout } = await runRealSmokeScript({
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
    const { stdout, exitCode } = await runRealSmokeScript({
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
