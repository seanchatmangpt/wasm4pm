import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { executePlan } from '../../engines/orchestrator/execute.js';
import { latestPipelineBundlePath, loadPipelineBundle } from '../../engines/orchestrator/bundle.js';
import type { ExecutionReport } from '../../engines/orchestrator/types.js';
import { EXIT_CODES } from '../../exit-codes.js';
import { makeRegistryDispatcher } from './registry-dispatcher.js';

export const resumeVerb = defineVerb({
  noun: 'pipeline',
  verb: 'resume',
  summary: 'Show the last saved receipt so a previous pipeline run can be inspected/continued manually',
  args: {
    'receipts-dir': { type: 'string', description: 'Receipts directory (default: .wasm4pm/receipts)' },
  } as const,
  handler: async (args) => {
    const receiptsDir = (args['receipts-dir'] as string | undefined) ?? '.wasm4pm/receipts';
    const latestBundle = latestPipelineBundlePath(receiptsDir);
    try {
      await fs.access(latestBundle);
    } catch {
      throw NounVerbError.invalidInput(
        `No pipeline checkpoint found at ${latestBundle}. Older receipt-only runs cannot be resumed; run 'wpm pipeline run' first.`
      );
    }

    let checkpoint;
    try {
      checkpoint = loadPipelineBundle(latestBundle);
    } catch (error) {
      throw NounVerbError.invalidInput(
        `Pipeline checkpoint verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (checkpoint.status === 'ok') {
      return {
        schema_version: 'wasm4pm.pipeline-resume.v1',
        resumed: false,
        standing: 'ALIVE',
        planId: checkpoint.plan.planId,
        planHash: checkpoint.plan.planHash,
        chainHash: checkpoint.chainHash,
        evidenceHash: checkpoint.evidenceHash,
        bundlePath: latestBundle,
        note: 'The latest pipeline is already complete and its checkpoint verified; no actuation was performed.',
      };
    }

    const canonicalBundle = path.join(path.dirname(latestBundle), `${checkpoint.plan.planId}.json`);
    const report = await executePlan(checkpoint.plan, makeRegistryDispatcher(), {
      bundlePath: canonicalBundle,
      receiptsDir,
      resumeFrom: checkpoint,
    });
    const exitCode = report.status === 'ok'
      ? undefined
      : report.status === 'partial'
        ? EXIT_CODES.partial_failure
        : EXIT_CODES.execution_error;
    return exitCode === undefined
      ? ({ ...report, resumed: true } satisfies ExecutionReport & { resumed: true })
      : ({ ...report, resumed: true, exitCode } satisfies ExecutionReport & { resumed: true; exitCode: number });
  },
});
