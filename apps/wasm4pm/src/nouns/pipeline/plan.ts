/**
 * wpm pipeline plan — NEW verb backed by `engines/orchestrator/plan.ts`
 * (genuinely new code, not a bridge). Builds and returns a typed step DAG
 * from a preset name, a custom plan file, or `--auto` — without executing
 * it (see `pipeline run` for execution, and the migration report for why
 * the two are not yet wired together).
 *
 * Also absorbs the retired `wpm compile`/`wpm workflow` (both were about
 * producing an execution plan) and `wpm pipeline create`/`list`/`validate`
 * (see `nouns/_removed.ts`).
 */
import { defineVerb } from '@wasm4pm/noun-verb';
import { buildPlan, topoSort } from '../../engines/orchestrator/plan.js';

export const planVerb = defineVerb({
  noun: 'pipeline',
  verb: 'plan',
  summary: 'Build a typed step DAG from a preset, a plan file, or --auto (was: wpm compile, wpm workflow, wpm pipeline create/list/validate)',
  args: {
    preset: { type: 'string', description: 'Built-in preset: full | quick | compliance' },
    'plan-file': { type: 'string', description: 'Path to a custom plan JSON file ({steps: [{noun,verb,args,dependsOn}]})' },
    auto: { type: 'boolean', description: 'Auto-build a quick validate -> discover plan for --input' },
    input: { type: 'string', description: 'Input log path (required for --preset/--auto)', alias: 'i' },
  } as const,
  handler: async (args) => {
    const plan = await buildPlan({
      preset: args.preset as string | undefined,
      planFile: args['plan-file'] as string | undefined,
      auto: Boolean(args.auto),
      input: args.input as string | undefined,
    });
    const ordered = topoSort(plan.steps);
    return { ...plan, executionOrder: ordered.map((s) => s.id) };
  },
});
