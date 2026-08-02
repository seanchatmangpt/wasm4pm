import { defineVerb } from '@wasm4pm/noun-verb';
import { buildPlan } from '../../engines/orchestrator/plan.js';
import { executePlan } from '../../engines/orchestrator/execute.js';
import type { ExecutionReport } from '../../engines/orchestrator/types.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { makeRegistryDispatcher } from './registry-dispatcher.js';

export const runVerb = defineVerb({
  noun: 'pipeline',
  verb: 'run',
  summary:
    'Build and execute a step plan from a preset, a plan file, or --auto, chaining a BLAKE3 receipt ' +
    'per step (was: wpm pipeline run, wpm analyze, wpm batch)',
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
    const report = await executePlan(plan, makeRegistryDispatcher());
    const exitCode = report.status === 'ok'
      ? undefined
      : report.status === 'partial'
        ? EXIT_CODES.partial_failure
        : EXIT_CODES.execution_error;
    return exitCode === undefined ? report : ({ ...report, exitCode } satisfies ExecutionReport & { exitCode: number });
  },
});
