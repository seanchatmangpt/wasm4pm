//! `wpm cognition run` — execute a cognition contract (breed + cost law).

import { defineCommand } from 'citty';
import { emitResult, makeResult, makeErrorResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { runContract } from '@wasm4pm/cognition';
import type { BreedInput, TraceStep } from '@wasm4pm/cognition';
import { parseInputJson, saveReceipt, mapWasmError } from './_shared.js';
import { exitWithFlush } from '../../otel/exit.js';
import { withSpanRaw } from '../_otel.js';

/** Render the inference trace steps in a tree-like format for human consumption. */
function renderTrace(steps: TraceStep[], maxLines = 12): string[] {
  if (!steps || steps.length === 0) return ['  (no trace steps)'];
  const lines: string[] = [];
  const show = steps.slice(0, maxLines);
  for (let i = 0; i < show.length; i++) {
    const s = show[i];
    const prefix = i === 0 ? '  ┌─' : i === show.length - 1 && steps.length <= maxLines ? '  └─' : '  ├─';
    const indent = '  '.repeat(Math.min(s.depth, 4));
    lines.push(`${prefix} [${String(s.step).padStart(2, '0')}] ${indent}${s.kind}: ${s.detail}`);
  }
  if (steps.length > maxLines) {
    lines.push(`  └─ … ${steps.length - maxLines} more steps (use --verbose to show all)`);
  }
  return lines;
}

/** Short hash for display — first 8 chars of hex. */
function shortHash(h: string | undefined): string {
  return h ? h.slice(0, 8) + '...' : '(none)';
}

export const run = defineCommand({
  meta: {
    name: 'run',
    description: 'Execute cognition contract (breed selection + receipt chain)',
  },
  args: {
    contract: { type: 'string', required: true, description: 'Cognition contract name' },
    input: { type: 'string', required: true, description: 'Path to BreedInput JSON' },
    'evidence-source': { type: 'string', default: 'log' },
    'adversarial-seed': { type: 'string' },
    'trace-parent': { type: 'string' },
    'confidence-threshold': { type: 'string', default: '0.85' },
    'no-save': { type: 'boolean', default: false },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;
    const contract = ctx.args.contract as string;
    let outcomeStatus = 'ok';
    return withSpanRaw(
      'wasm4pm.command.cognition.run',
      { 'cognition.contract': contract, 'cognition.format': format },
      async () => {
        try {
          const input = parseInputJson<BreedInput>(ctx.args.input as string);
          const breed = contract;
          const cresult = await runContract(breed, input);
          // Rust `cognition_run` emits `status: "ok"` on success. There is no
          // `exit_code`, `receipt_chain`, or top-level `findings` field.
          const exitCode =
            cresult.status === 'ok' ? EXIT_CODES.success : EXIT_CODES.execution_error;
          outcomeStatus = cresult.status ?? 'error';

          // Collect inference trace metadata for richer output
          const inferenceTrace: TraceStep[] = cresult.output?.inference_trace ?? [];
          const rulesEvaluated = inferenceTrace.filter((s) => s.kind === 'fire-rule' || s.kind === 'fire_rule').length;
          const candidateCount = (cresult.output?.candidates ?? []).length;
          const selected = cresult.output?.selected;
          const explanation = cresult.output?.explanation ?? '';
          const factsCount = (input.facts ?? []).length;
          const casesCount = (input.cases ?? []).length;

          let savedPath: string | undefined;
          if (!ctx.args['no-save'] && cresult.status === 'ok') {
            savedPath = saveReceipt(
              {
                run_id: cresult.run_id,
                output_hash: cresult.output_hash,
                replay_pointer: cresult.replay_pointer,
                breed: cresult.breed,
                status: cresult.status,
              },
              '.wasm4pm/receipts',
            );
          }

          const result = makeResult(
            'cognition run',
            {
              contract: ctx.args.contract,
              breed: cresult.breed,
              status: cresult.status,
              output: cresult.output,
              run_id: cresult.run_id,
              output_hash: cresult.output_hash,
              replay_pointer: cresult.replay_pointer,
              inference_step_count: inferenceTrace.length,
              rules_evaluated: rulesEvaluated,
              saved_path: savedPath,
            },
            performance.now() - t0,
            exitCode,
          );

          emitResult(result, { format, verbose, quiet }, (res, p) => {
            const pl = res.payload as {
              contract: string;
              breed: string;
              status: string;
              run_id: string;
              output_hash: string;
              replay_pointer: string;
              inference_step_count: number;
              rules_evaluated: number;
              output: { explanation?: string; selected?: string };
            };

            const statusMark = pl.status === 'ok' ? '✔ OK' : '✘ FAILED';
            const breedName = pl.breed ?? contract;
            const elapsedMs = Math.round(res.meta.duration_ms);

            p.log('');
            p.log(`Cognition Run — ${breedName} breed`);
            p.log('===================================');
            p.log(`Run ID:  ${pl.run_id}`);
            p.log(`Breed:   ${breedName}`);
            p.log(`Status:  ${statusMark}  (${elapsedMs}ms)`);

            // Reasoning trace section
            p.log('');
            p.log('Reasoning trace:');
            if (factsCount > 0 || casesCount > 0) {
              p.log(`  ┌─ Input: ${factsCount} facts, ${casesCount} cases, ${candidateCount} candidates`);
            }
            if (rulesEvaluated > 0) {
              p.log(`  ├─ Horn-clause inference: ${rulesEvaluated} rule${rulesEvaluated !== 1 ? 's' : ''} evaluated`);
            }
            const traceMaxLines = verbose ? 50 : 10;
            const traceLines = renderTrace(inferenceTrace, traceMaxLines);
            for (const line of traceLines) p.log(line);
            if (selected) {
              p.log(`  └─ Selected: ${selected}`);
            }
            if (explanation) {
              p.log(`  └─ Conclusion: ${explanation}`);
            }

            // Receipt chain section
            p.log('');
            p.log('Receipt chain:');
            p.log(`  output_hash:   ${shortHash(pl.output_hash)}  ✔`);
            p.log(`  replay_ptr:    ${pl.replay_pointer}`);
            if (savedPath) p.log(`  saved:         ${savedPath}`);

            // Output section — selected + explanation
            if (pl.output && Object.keys(pl.output).length > 0) {
              p.log('');
              p.log('Output:');
              if (selected) p.log(`  selected: ${selected}`);
              if (explanation) p.log(`  explanation: ${explanation}`);
              if (verbose) {
                const outKeys = Object.keys(pl.output).filter((k) => k !== 'inference_trace' && k !== 'breed');
                for (const k of outKeys) {
                  const v = (pl.output as Record<string, unknown>)[k];
                  if (v !== null && v !== undefined && typeof v !== 'object') {
                    p.log(`  ${k}: ${String(v)}`);
                  }
                }
              }
            }
            p.log('');

            if (pl.status === 'ok') {
              p.success(`Breed '${breedName}' completed — ${pl.inference_step_count} inference step(s)`);
            } else {
              p.warn(`Breed '${breedName}' returned non-ok status`);
            }
          });
          return await exitWithFlush(exitCode);
        } catch (err) {
          outcomeStatus = 'error';
          const { code, exitCode } = mapWasmError(err);
          const result = makeErrorResult('cognition run', err, exitCode, code);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(exitCode);
        }
      },
      () => ({ 'cognition.outcome': outcomeStatus }),
    );
  },
});
