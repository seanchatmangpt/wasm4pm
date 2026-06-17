/**
 * wpm analyze — One-shot guided workflow: validate + auto-select discovery + quality.
 *
 * Runs a 3-step analysis pipeline:
 *   Step 1: validate   — check event log structure
 *   Step 2: run        — discover process model (auto-selected or user-specified)
 *   Step 3: quality    — assess model quality (4 dimensions)
 *
 * Emits a narrative VERDICT with fitness interpretation and next steps.
 */

import { defineCommand } from 'citty';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { withSpan } from './_otel.js';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import {
  saveCommandReceipt,
  blake3Hex,
  newReceipt,
  type CommandReceipt,
} from '../receipts/_shared.js';
import { isFirstRun, formatFirstRunHints, interpretFitness } from '../first-run-ux.js';
import { getSuggestions } from '@wasm4pm/planner';
import { EXIT_CODES } from '../exit-codes.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalyzeStepResult {
  step: string;
  status: 'success' | 'failed';
  exit_code: number;
  duration_ms: number;
  output_hash: string;
}

export interface AnalyzePayload {
  status: 'ok' | 'partial' | 'failed';
  algorithm: string;
  steps: AnalyzeStepResult[];
  fitness: number | null;
  receipt_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCliEntryPoint(): string {
  const url = new URL(import.meta.url);
  const commandsDir = path.dirname(url.pathname);
  const srcDir = path.dirname(commandsDir);
  const appDir = path.dirname(srcDir);
  return path.join(appDir, 'dist', 'cli.js');
}

/** Map the profile arg to a SuggestionGoal understood by planner */
function profileToGoal(profile: string): 'fast' | 'balanced' | 'quality' | 'conformance' | 'streaming' {
  switch (profile) {
    case 'fast': return 'fast';
    case 'quality': return 'quality';
    case 'stream': return 'streaming';
    default: return 'balanced';
  }
}

/** Spawn a single wpm sub-command and return status + output */
function runStep(
  stepName: string,
  extraArgs: string[],
  input: string,
): { exit_code: number; stdout: string; duration_ms: number } {
  const t0 = performance.now();
  const cliEntry = getCliEntryPoint();
  const argv = [stepName, '-i', input, ...extraArgs, '--format', 'json'];

  const result = spawnSync(process.execPath, [cliEntry, ...argv], {
    encoding: 'utf-8',
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: '1' },
  });

  const duration_ms = Math.round(performance.now() - t0);
  const stdout = result.stdout ?? '';
  const exit_code = result.status ?? 1;
  return { exit_code, stdout, duration_ms };
}

/** Extract fitness value from JSON output of `wpm run --format json` */
function extractFitness(stdout: string): number | null {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const payload = parsed['payload'] as Record<string, unknown> | undefined;
    if (payload && typeof payload['fitness'] === 'number') return payload['fitness'] as number;
    if (typeof parsed['fitness'] === 'number') return parsed['fitness'] as number;
    // quality step uses fitness_metrics
    const metrics = payload?.['fitness_metrics'] as Record<string, unknown> | undefined;
    if (metrics && typeof metrics['fitness'] === 'number') return metrics['fitness'] as number;
    return null;
  } catch {
    return null;
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const analyzeCommand = defineCommand({
  meta: {
    name: 'analyze',
    description: 'One-shot guided workflow: validate + auto-select discovery + quality',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to event log (.xes, .xes.gz, .csv, .json)',
      required: true,
    },
    i: {
      type: 'string',
      alias: 'input',
      description: 'Path to event log (alternative to positional)',
    },
    format: {
      type: 'string',
      description: 'Output format: human | json',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      alias: 'v',
      description: 'Show verbose output',
      default: false,
    },
    algorithm: {
      type: 'string',
      description: 'Override auto-selected discovery algorithm',
    },
    profile: {
      type: 'string',
      description: 'Planner profile for auto-selection: fast | balanced | quality | stream',
      default: 'balanced',
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip saving receipt',
      default: false,
    },
  },

  async run({ args }) {
    const t0 = performance.now();
    const format = (args.format as string) ?? 'human';
    const verbose = !!args.verbose;
    const noSave = !!(args['no-save']);
    const profile = (args.profile as string) ?? 'balanced';

    // Resolve input: positional wins over -i
    const input = (args.input as string | undefined) ?? (args.i as string | undefined) ?? '';
    if (!input) {
      const result = makeErrorResult(
        'analyze',
        new Error('Input log path is required. Use: wpm analyze <log.xes>'),
        EXIT_CODES.config_error,
        'CONFIG_MISSING_INPUT',
      );
      emitResult(result, { format: format as 'human' | 'json' });
      process.exitCode = EXIT_CODES.config_error;
      return;
    }

    await withSpan('analyze', { input, profile, verbose }, async () => {
      const projection = new ConsoleProjection({ format: format as 'human' | 'json', verbose });

      // ── Step 0: Auto-select algorithm ────────────────────────────────────────
      let selectedAlgo = (args.algorithm as string | undefined) ?? '';
      if (!selectedAlgo) {
        // Use planner getSuggestions with minimal log stats (trace count unknown pre-validate)
        const goal = profileToGoal(profile);
        const suggestions = getSuggestions(
          { traceCount: 500, eventCount: 5000, variantCount: 50 },
          goal,
          1,
        );
        selectedAlgo = suggestions[0]?.algorithm ?? 'inductive_miner';
      }

      if (format === 'human') {
        console.log(`Analyzing: ${input}`);
      }

      // ── Step 1: Validate ─────────────────────────────────────────────────────
      if (format === 'human') {
        console.log('Step 1/3: Validating log structure...');
      }
      const validateResult = runStep('validate', [], input);
      const validateHash = blake3Hex(validateResult.stdout || `validate:${validateResult.exit_code}`);
      const validateStep: AnalyzeStepResult = {
        step: 'validate',
        status: validateResult.exit_code === 0 ? 'success' : 'failed',
        exit_code: validateResult.exit_code,
        duration_ms: validateResult.duration_ms,
        output_hash: validateHash,
      };

      if (verbose && format === 'human') {
        projection.debug(`validate exit_code=${validateResult.exit_code} duration=${validateResult.duration_ms}ms`);
      }

      // ── Step 2: Run discovery ─────────────────────────────────────────────────
      if (format === 'human') {
        console.log(`Step 2/3: Discovering process model with ${selectedAlgo}...`);
      }
      const runResult = runStep('run', ['--algorithm', selectedAlgo], input);
      const runHash = blake3Hex(runResult.stdout || `run:${runResult.exit_code}`);
      const runStep_: AnalyzeStepResult = {
        step: 'run',
        status: runResult.exit_code === 0 ? 'success' : 'failed',
        exit_code: runResult.exit_code,
        duration_ms: runResult.duration_ms,
        output_hash: runHash,
      };

      const fitness = extractFitness(runResult.stdout);

      if (verbose && format === 'human') {
        projection.debug(`run exit_code=${runResult.exit_code} duration=${runResult.duration_ms}ms fitness=${fitness ?? 'n/a'}`);
      }

      // ── Step 3: Quality ───────────────────────────────────────────────────────
      if (format === 'human') {
        console.log('Step 3/3: Assessing model quality...');
      }
      const qualityResult = runStep('quality', [], input);
      const qualityHash = blake3Hex(qualityResult.stdout || `quality:${qualityResult.exit_code}`);
      const qualityStep: AnalyzeStepResult = {
        step: 'quality',
        status: qualityResult.exit_code === 0 ? 'success' : 'failed',
        exit_code: qualityResult.exit_code,
        duration_ms: qualityResult.duration_ms,
        output_hash: qualityHash,
      };

      // Extract fitness from quality step if run step didn't provide it
      const finalFitness = fitness ?? extractFitness(qualityResult.stdout);

      if (verbose && format === 'human') {
        projection.debug(`quality exit_code=${qualityResult.exit_code} duration=${qualityResult.duration_ms}ms`);
      }

      const steps = [validateStep, runStep_, qualityStep];

      // ── Chain receipt hashes ──────────────────────────────────────────────────
      const chainedHash = blake3Hex([validateHash, runHash, qualityHash].join(','));

      // ── Receipt ───────────────────────────────────────────────────────────────
      const inputBytes = await fs.readFile(input);
      const receiptBase = newReceipt('analyze');
      const inputHash = blake3Hex(inputBytes);
      const receipt: CommandReceipt = {
        ...receiptBase,
        input_hash: inputHash,
        output_hash: chainedHash,
        status: steps.every((s) => s.status === 'success')
          ? 'success'
          : steps.some((s) => s.status === 'success')
            ? 'partial'
            : 'failed',
        summary: {
          algorithm: selectedAlgo,
          fitness: finalFitness,
          steps_completed: steps.filter((s) => s.status === 'success').length,
          input_file: input,
        },
      };
      saveCommandReceipt(receipt);

      // ── Determine overall status ──────────────────────────────────────────────
      const overallStatus: 'ok' | 'partial' | 'failed' =
        steps.every((s) => s.status === 'success')
          ? 'ok'
          : steps.some((s) => s.status === 'success')
            ? 'partial'
            : 'failed';

      // ── Verdict narrative ─────────────────────────────────────────────────────
      if (format === 'human') {
        let verdictText: string;
        if (finalFitness !== null) {
          const interp = interpretFitness(finalFitness);
          verdictText = `Fitness ${(finalFitness * 100).toFixed(1)}% — ${interp.level} ${interp.emoji}. ${interp.explanation}`;
        } else if (overallStatus === 'failed') {
          verdictText = 'Analysis could not complete. Check that the input file is a valid event log.';
        } else {
          verdictText = 'Analysis complete. Run wpm quality -i <log> for detailed fitness metrics.';
        }
        console.log(`VERDICT: ${verdictText}`);

        // First-run hints
        const firstRun = await isFirstRun();
        if (firstRun && finalFitness !== null) {
          const hints = formatFirstRunHints(finalFitness, selectedAlgo, input, null);
          for (const hint of hints) {
            console.log(hint);
          }
        }
      }

      // ── Emit canonical result ─────────────────────────────────────────────────
      const payload: AnalyzePayload = {
        status: overallStatus,
        algorithm: selectedAlgo,
        steps,
        fitness: finalFitness,
        receipt_id: receipt.run_id,
      };

      const duration_ms = Math.round(performance.now() - t0);
      const result = makeResult<AnalyzePayload>(
        'analyze',
        payload,
        duration_ms,
        overallStatus === 'ok' ? EXIT_CODES.success : EXIT_CODES.partial_failure,
        overallStatus === 'ok'
          ? `Analysis complete with ${selectedAlgo} (fitness: ${finalFitness !== null ? (finalFitness * 100).toFixed(1) + '%' : 'n/a'})`
          : `Analysis partially completed (${steps.filter((s) => s.status === 'success').length}/3 steps succeeded)`,
      );

      emitResult(result, { format: format as 'human' | 'json' });

      if (overallStatus !== 'ok') {
        process.exitCode = EXIT_CODES.partial_failure;
      }
    });
  },
});
