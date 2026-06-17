//! `wpm compile` — the Reasoning Compiler (minimal scope).
//!
//! Compiles a multi-stage reasoning pipeline spec into an executable plan:
//! - Zod-validated spec `{ name, stages: [{ breed, input?, wire? }] }`
//! - breeds validated against the cognition registry (ADMITTED track)
//! - stages topologically ordered along `wire.from` edges
//! - BLAKE3 plan hash + receipt saved to `.wasm4pm/receipts/`
//! - `--run` executes stages sequentially via the shared `runOne` core;
//!   `wire.map = "meta_facts"` folds the upstream output into
//!   `breed:<id>:conclusion` / `breed:<id>:confidence` facts (meta_reasoning fan-in)

import { defineCommand } from 'citty';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES, type ExitCode } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpanRaw } from './_otel.js';
import { getGlobalSpanSink } from '../otel/sink.js';
import { hashData } from '@wasm4pm/contracts';
import { BreedIdSchema } from '@wasm4pm/cognition';
import { parseInputJson, saveReceipt, runOne } from './cognition/_shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// Spec schema
// ─────────────────────────────────────────────────────────────────────────────

export const WireSchema = z.object({
  /** Upstream stage (breed id) whose output feeds this stage. */
  from: z.string().min(1),
  /** Fold mode: meta_facts = breed:<id>:conclusion/confidence facts. */
  map: z.literal('meta_facts'),
});

export const StageSchema = z.object({
  breed: z.string().min(1),
  /** Inline BreedInput (facts etc.). Optional when fully wired. */
  input: z.unknown().optional(),
  wire: z.union([WireSchema, z.array(WireSchema)]).optional(),
});

export const CompileSpecSchema = z.object({
  name: z.string().min(1),
  stages: z.array(StageSchema).min(1),
});
export type CompileSpec = z.infer<typeof CompileSpecSchema>;

/** Compilation failure carrying its CLI exit code. */
export class CompileError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode,
  ) {
    super(message);
    this.name = 'CompileError';
  }
}

/**
 * Load the set of ADMITTED-track breed ids. Prefers the on-disk registry
 * (status PARTIAL_ALIVE / ADMITTED); falls back to the BreedIdSchema enum
 * mirror when the registry file is not present (published-package case).
 */
export function loadAdmittedBreeds(cwd: string = process.cwd()): Set<string> {
  const candidates = [
    path.join(cwd, 'crates', 'wasm4pm-cognition', 'breeds', 'registry.json'),
    path.join(cwd, '..', '..', 'crates', 'wasm4pm-cognition', 'breeds', 'registry.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{
        breed_id: string;
        status: string;
      }>;
      const admitted = raw
        .filter((b) => b.status === 'PARTIAL_ALIVE' || b.status === 'ADMITTED')
        .map((b) => b.breed_id);
      if (admitted.length > 0) return new Set(admitted);
    } catch {
      // try next location
    }
  }
  return new Set(BreedIdSchema.options);
}

export interface CompiledPlan {
  name: string;
  /** Stage breeds in topological execution order. */
  order: string[];
  stages: Array<z.infer<typeof StageSchema>>;
  /** BLAKE3 hash of the normalized plan. */
  plan_hash: string;
}

/**
 * Validate + topologically order a compile spec against the admitted set.
 * Throws `CompileError` with the correct exit code on any defect:
 * - malformed spec → config_error (1)
 * - unknown / non-admitted breed, bad wire reference, cycle → source_error (2)
 */
export function compileSpec(specRaw: unknown, admitted: Set<string>): CompiledPlan {
  const parsed = CompileSpecSchema.safeParse(specRaw);
  if (!parsed.success) {
    throw new CompileError(
      `invalid compile spec: ${parsed.error.issues.map((i: { message: string }) => i.message).join('; ')}`,
      EXIT_CODES.config_error,
    );
  }
  const spec = parsed.data;

  const ids = spec.stages.map((s) => s.breed);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new CompileError(`duplicate stage breed '${id}'`, EXIT_CODES.source_error);
    }
    seen.add(id);
  }
  for (const id of ids) {
    if (!admitted.has(id)) {
      throw new CompileError(
        `unknown or non-ADMITTED breed '${id}'`,
        EXIT_CODES.source_error,
      );
    }
  }

  // Build wire edges and Kahn-sort (deterministic: stable by spec order).
  const wiresOf = (s: z.infer<typeof StageSchema>): Array<z.infer<typeof WireSchema>> =>
    s.wire ? (Array.isArray(s.wire) ? s.wire : [s.wire]) : [];
  const indeg = new Map<string, number>(ids.map((id: string) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id: string) => [id, []]));
  for (const s of spec.stages) {
    for (const w of wiresOf(s)) {
      if (!seen.has(w.from)) {
        throw new CompileError(
          `stage '${s.breed}' wires from unknown stage '${w.from}'`,
          EXIT_CODES.source_error,
        );
      }
      out.get(w.from)!.push(s.breed);
      indeg.set(s.breed, (indeg.get(s.breed) ?? 0) + 1);
    }
  }
  const queue = ids.filter((id: string) => indeg.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const nxt of out.get(id) ?? []) {
      indeg.set(nxt, indeg.get(nxt)! - 1);
      if (indeg.get(nxt) === 0) queue.push(nxt);
    }
  }
  if (order.length !== ids.length) {
    throw new CompileError('wire graph contains a cycle', EXIT_CODES.source_error);
  }

  const plan: Omit<CompiledPlan, 'plan_hash'> = {
    name: spec.name,
    order,
    stages: spec.stages,
  };
  return { ...plan, plan_hash: hashData(plan) };
}

/** Fold an upstream stage result into meta facts for a downstream input. */
export function foldMetaFacts(
  upstreamBreed: string,
  upstream: { output?: { selected?: string | null; explanation?: string } },
): Array<{ key: string; value: string }> {
  const conclusion = upstream.output?.selected ?? 'none';
  return [
    { key: `breed:${upstreamBreed}:conclusion`, value: conclusion },
    // Deterministic confidence: 1.0 when the stage selected, 0.5 otherwise.
    {
      key: `breed:${upstreamBreed}:confidence`,
      value: upstream.output?.selected ? '0.9' : '0.5',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Command
// ─────────────────────────────────────────────────────────────────────────────

export const compile = defineCommand({
  meta: {
    name: 'compile',
    description: 'Reasoning Compiler: validate, order and hash a multi-breed pipeline spec',
  },
  args: {
    spec: { type: 'string', required: true, description: 'Path to pipeline spec JSON' },
    out: { type: 'string', description: 'Write the compiled plan JSON to this path' },
    run: { type: 'boolean', default: false, description: 'Execute the compiled plan' },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human' | 'sarif' | 'jsonl') ?? 'human';
    const verbose = !!ctx.args.verbose;
    const quiet = !!ctx.args.quiet;

    return withSpanRaw(
      'wasm4pm.command.compile',
      { 'compile.spec': String(ctx.args.spec) },
      async () => {
        try {
          const specRaw = parseInputJson(ctx.args.spec as string);
          const admitted = loadAdmittedBreeds();
          const plan = compileSpec(specRaw, admitted);

          if (ctx.args.out) {
            fs.writeFileSync(
              ctx.args.out as string,
              JSON.stringify(plan, null, 2) + '\n',
              'utf8',
            );
          }

          const stageResults: Array<{
            breed: string;
            status: string;
            run_id?: string;
            output_hash?: string;
            selected?: string | null;
          }> = [];

          if (ctx.args.run) {
            const byBreed = new Map(plan.stages.map((s) => [s.breed, s]));
            const outputs = new Map<string, Awaited<ReturnType<typeof runOne>>>();
            for (const breed of plan.order) {
              const stage = byBreed.get(breed)!;
              const baseInput =
                (stage.input as { facts?: Array<{ key: string; value: string }> }) ?? {
                  intent: `compile:${plan.name}`,
                  candidates: [],
                  facts: [],
                  cases: [],
                  rules: [],
                  goals: [],
                  state: [],
                };
              const facts = [...(baseInput.facts ?? [])];
              const wires = stage.wire
                ? Array.isArray(stage.wire)
                  ? stage.wire
                  : [stage.wire]
                : [];
              for (const w of wires) {
                const upstream = outputs.get(w.from);
                if (!upstream) {
                  throw new CompileError(
                    `stage '${breed}' ran before its wire source '${w.from}'`,
                    EXIT_CODES.execution_error,
                  );
                }
                facts.push(...foldMetaFacts(w.from, upstream));
              }
              const input = { ...baseInput, facts };
              const result = await withSpanRaw(
                'wasm4pm.compile.stage',
                { 'compile.stage.breed': breed },
                async () => runOne(breed, input, { spanSink: getGlobalSpanSink() }),
              );
              if (result.status !== 'ok') {
                throw new CompileError(
                  `stage '${breed}' failed: status=${result.status}`,
                  EXIT_CODES.execution_error,
                );
              }
              outputs.set(breed, result);
              stageResults.push({
                breed,
                status: result.status ?? 'error',
                run_id: result.run_id,
                output_hash: result.output_hash,
                selected: result.output?.selected,
              });
            }
          }

          const receipt = {
            kind: 'compile-plan',
            name: plan.name,
            plan_hash: plan.plan_hash,
            order: plan.order,
            executed: !!ctx.args.run,
            stages: stageResults,
          };
          const savedPath = saveReceipt(receipt, '.wasm4pm/receipts');

          const result = makeResult(
            'compile',
            { ...receipt, saved_path: savedPath },
            performance.now() - t0,
            EXIT_CODES.success,
          );
          emitResult(result, { format, verbose, quiet }, (res, p) => {
            p.log('');
            p.log(`Reasoning Compiler — ${plan.name}`);
            p.log('===================================');
            p.log(`Plan hash: ${plan.plan_hash.slice(0, 16)}...`);
            p.log(`Order:     ${plan.order.join(' -> ')}`);
            if (ctx.args.run) {
              for (const s of stageResults) {
                p.log(
                  `  stage ${s.breed}: ${s.status} (run ${s.run_id ?? '?'}; selected ${s.selected ?? '(none)'})`,
                );
              }
            }
            p.log(`Receipt:   ${savedPath}`);
          });
          return exitWithFlush(EXIT_CODES.success);
        } catch (err) {
          const exitCode =
            err instanceof CompileError ? err.exitCode : EXIT_CODES.config_error;
          const result = makeErrorResult('compile', err, exitCode, 'COMPILE_ERROR');
          emitResult(result, { format, verbose, quiet });
          return exitWithFlush(exitCode);
        }
      },
    );
  },
});
