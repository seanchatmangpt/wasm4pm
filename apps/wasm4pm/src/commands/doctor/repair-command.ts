import { defineCommand } from 'citty';
import { emitResult, makeErrorResult, makeResult } from '../../output.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { exitWithFlush } from '../../otel/exit.js';
import type { Diagnosis } from './types.js';
import { ALL_CHECKS } from './checks-arrays.js';
import { resolveWorkspaceRoot } from './checks-env.js';
import {
  executeRepairPlan,
  planRepairs,
  RepairBrokerError,
  REPAIR_INTENTS,
  type RepairExecutionReport,
} from './repair-broker.js';

export interface RunDoctorRepairOptions {
  readonly format: 'json' | 'human';
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly dryRun: boolean;
  readonly authorized: boolean;
  readonly only?: readonly string[];
  readonly commandName?: string;
}

async function executeDiagnoses(): Promise<Diagnosis[]> {
  return Promise.all(
    ALL_CHECKS.map(async (check) => {
      try {
        return await check();
      } catch (error) {
        return {
          name: check.name || 'anonymous doctor check',
          pathology: 'EPISTEMIC_FAULT',
          severity: 'STOP_THE_LINE',
          message: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
          repairMode: 'MANUAL_INTERVENTION',
        } satisfies Diagnosis;
      }
    })
  );
}

function exitCodeFor(
  execution: RepairExecutionReport | null,
  remaining: readonly Diagnosis[],
  dryRun: boolean
): number {
  if (dryRun) return EXIT_CODES.success;
  if (execution?.standing === 'BLOCKED') return EXIT_CODES.system_error;
  if (execution?.standing === 'REFUSED') return EXIT_CODES.config_error;
  if (execution?.standing === 'PARTIAL_ALIVE') return EXIT_CODES.partial_failure;
  if (remaining.some((diagnosis) => diagnosis.severity === 'STOP_THE_LINE')) {
    return EXIT_CODES.config_error;
  }
  if (remaining.length > 0) return EXIT_CODES.partial_failure;
  return EXIT_CODES.success;
}

export async function runDoctorRepair(options: RunDoctorRepairOptions): Promise<number> {
  const start = Date.now();
  const commandName = options.commandName ?? 'doctor fix';
  const workspaceRoot = resolveWorkspaceRoot();
  if (!workspaceRoot) {
    const result = makeErrorResult(
      commandName,
      new Error('WORKSPACE_ROOT_REQUIRED: no pnpm-workspace.yaml found in the current path or parents'),
      EXIT_CODES.config_error,
      'WORKSPACE_ROOT_REQUIRED',
      'Run the command from an admitted wasm4pm checkout.'
    );
    emitResult(result, options);
    return EXIT_CODES.config_error;
  }

  const before = await executeDiagnoses();
  try {
    const plan = planRepairs(before, options.only);
    const execution = executeRepairPlan(plan, {
      workspaceRoot,
      authorized: options.authorized,
      dryRun: options.dryRun,
    });

    const after =
      options.dryRun || execution.standing === 'REFUSED'
        ? before
        : await executeDiagnoses();
    const remaining = after.filter((diagnosis) => diagnosis.severity !== 'INFO');
    const exitCode = exitCodeFor(execution, remaining, options.dryRun);
    const payload = {
      schema_version: 'wasm4pm.doctor-fix.v1',
      execution,
      before: {
        pass: before.filter((diagnosis) => diagnosis.severity === 'INFO').length,
        warn: before.filter((diagnosis) => diagnosis.severity === 'WARNING').length,
        fail: before.filter((diagnosis) => diagnosis.severity === 'STOP_THE_LINE').length,
      },
      after: {
        pass: after.filter((diagnosis) => diagnosis.severity === 'INFO').length,
        warn: after.filter((diagnosis) => diagnosis.severity === 'WARNING').length,
        fail: after.filter((diagnosis) => diagnosis.severity === 'STOP_THE_LINE').length,
      },
      remaining,
    };
    const result = makeResult(
      commandName,
      payload,
      Date.now() - start,
      exitCode,
      options.dryRun
        ? `Repair plan contains ${plan.length} admitted intent(s); no actuation occurred`
        : `Repair standing: ${execution.standing}`
    );
    emitResult(result, options, (_result, projection) => {
      projection.log(`Doctor repair: ${execution.standing}`);
      projection.log(`Run: ${execution.run_id}`);
      projection.log(`Authorized: ${execution.authorized}; dry-run: ${execution.dry_run}`);
      projection.log('');
      if (execution.plan.length === 0) projection.log('  No admitted repair intents matched current diagnoses.');
      for (const outcome of execution.outcomes) {
        projection.log(`  [${outcome.status}] ${outcome.intent_id} — ${outcome.message}`);
        if (options.verbose && outcome.pending_receipt) {
          projection.log(`      pending: ${outcome.pending_receipt}`);
        }
        if (options.verbose && outcome.outcome_receipt) {
          projection.log(`      outcome: ${outcome.outcome_receipt}`);
        }
      }
      if (remaining.length > 0) {
        projection.log('');
        projection.log(`Remaining diagnoses: ${remaining.length}`);
        if (options.verbose) {
          for (const diagnosis of remaining) {
            projection.log(`  ${diagnosis.severity}: ${diagnosis.name} — ${diagnosis.message}`);
          }
        }
      }
    });
    return exitCode;
  } catch (error) {
    if (error instanceof RepairBrokerError) {
      const result = makeErrorResult(
        commandName,
        error,
        EXIT_CODES.source_error,
        error.code,
        error.alternatives.length > 0
          ? `Available repair intents: ${error.alternatives.join(', ')}`
          : undefined
      );
      emitResult(result, options);
      return EXIT_CODES.source_error;
    }
    throw error;
  }
}

export const doctorRepairCommand = defineCommand({
  meta: {
    name: 'fix',
    description:
      'Plan or execute receipt-gated structured repairs. No shell strings; --yes is required for actuation.',
  },
  args: {
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show receipt paths and remaining diagnoses',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress human output',
      alias: 'q',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Construct the admitted repair plan without actuation',
    },
    yes: {
      type: 'boolean',
      description: 'Authorize the admitted plan for this invocation',
      alias: 'y',
    },
    only: {
      type: 'string',
      description: `Comma-separated repair intent ids: ${REPAIR_INTENTS.map((intent) => intent.id).join(', ')}`,
    },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const only = String(ctx.args.only ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const exitCode = await runDoctorRepair({
      format,
      verbose: Boolean(ctx.args.verbose),
      quiet: Boolean(ctx.args.quiet),
      dryRun: Boolean(ctx.args['dry-run']),
      authorized: Boolean(ctx.args.yes),
      only: only.length > 0 ? only : undefined,
    });
    return await exitWithFlush(exitCode);
  },
});
