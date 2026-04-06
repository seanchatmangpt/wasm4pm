import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@wasm4pm/engine';

const VALID_TASKS = [
  'next-activity',
  'remaining-time',
  'outcome',
  'drift',
  'features',
  'resource',
] as const;

type PredictTask = (typeof VALID_TASKS)[number];

export interface PredictOptions extends OutputOptions {
  input?: string;
  activityKey?: string;
  prefix?: string;
  topK?: number;
}

export const predict = defineCommand({
  meta: {
    name: 'predict',
    description: 'Run predictive process mining on an event log',
  },
  args: {
    task: {
      type: 'positional',
      description:
        'Prediction task (next-activity, remaining-time, outcome, drift, features, resource)',
      required: true,
    },
    input: {
      type: 'string',
      description: 'Path to XES event log file (required)',
      required: true,
      alias: 'i',
    },
    'activity-key': {
      type: 'string',
      description: 'Activity attribute key (default: concept:name)',
      default: 'concept:name',
    },
    prefix: {
      type: 'string',
      description: 'Comma-separated activity prefix for case-level predictions',
    },
    'top-k': {
      type: 'string',
      description: 'Number of top predictions to return (default: 3)',
      default: '3',
    },
    format: {
      type: 'string',
      description: 'Output format (human or json)',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      alias: 'q',
    },
  },
  async run(ctx) {
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Step 1: Validate task
      const task = ctx.args.task as string;
      if (!VALID_TASKS.includes(task as PredictTask)) {
        const message = `Unknown task: "${task}". Valid tasks: ${VALID_TASKS.join(', ')}`;
        formatter.error(message);
        process.exit(EXIT_CODES.source_error);
      }

      // Step 2: Validate input file
      const inputPath = ctx.args.input as string;
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const topK = parseInt(ctx.args['top-k'] as string, 10) || 3;
      const prefixActivities = ctx.args.prefix
        ? (ctx.args.prefix as string).split(',').map((s) => s.trim())
        : undefined;

      // Step 3: Load WASM module
      if (formatter instanceof HumanFormatter) {
        formatter.info(`Running prediction task: ${task}`);
      }

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Step 4: Read and parse XES file
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Loading event log from: ${inputPath}`);
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.parse_xes(xesContent);

      // Step 5: Execute prediction task
      const result = await executePredictionTask(
        wasm,
        task as PredictTask,
        logHandle,
        activityKey,
        topK,
        prefixActivities
      );

      // Step 6: Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success(`Prediction complete: ${task}`, {
          task,
          input: inputPath,
          activityKey,
          ...result,
        });
      } else {
        formatter.success(`Prediction complete: ${task}`);
        formatHumanOutput(formatter, task as PredictTask, result);
      }

      // Step 7: Free handles
      try {
        wasm.free_handle(logHandle);
      } catch {
        // Best-effort cleanup
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Prediction failed', error);
      } else {
        formatter.error(
          `Prediction failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

/**
 * Dispatch to the appropriate WASM prediction function based on the task.
 */
async function executePredictionTask(
  wasm: Record<string, any>,
  task: PredictTask,
  logHandle: string,
  activityKey: string,
  topK: number,
  prefixActivities?: string[]
): Promise<Record<string, unknown>> {
  switch (task) {
    case 'next-activity': {
      const predictorHandle: string = wasm.build_ngram_predictor(logHandle, activityKey, 3);
      const prefix = prefixActivities ?? [];
      const raw: string = wasm.predict_next_activity(predictorHandle, JSON.stringify(prefix));
      const predictions: Array<{ activity: string; probability: number }> = JSON.parse(raw);
      const topPredictions = predictions.slice(0, topK);
      try { wasm.free_handle(predictorHandle); } catch { /* best-effort */ }
      return { predictions: topPredictions };
    }

    case 'remaining-time': {
      const raw: string = wasm.extract_prefix_features(
        logHandle,
        activityKey,
        'time:timestamp',
        prefixActivities ? prefixActivities.length : 5
      );
      const features: Array<Record<string, unknown>> = JSON.parse(raw);
      return { prefixFeatures: features.slice(0, topK) };
    }

    case 'outcome': {
      // Build a DFG for anomaly scoring, then score traces
      const dfgResult = wasm.discover_dfg(logHandle, activityKey);
      const dfgHandle: string = dfgResult.handle ?? dfgResult;

      if (prefixActivities && prefixActivities.length > 0) {
        // Score a single trace prefix
        const score = wasm.score_trace_anomaly(dfgHandle, JSON.stringify(prefixActivities));
        const likelihoodRaw: string = wasm.score_trace_likelihood
          ? (() => {
              const ph: string = wasm.build_ngram_predictor(logHandle, activityKey, 3);
              const ll = wasm.score_trace_likelihood(ph, JSON.stringify(prefixActivities));
              try { wasm.free_handle(ph); } catch { /* best-effort */ }
              return String(ll);
            })()
          : '0';
        try { wasm.free_handle(dfgHandle); } catch { /* best-effort */ }
        return {
          anomalyScore: typeof score === 'number' ? score : parseFloat(String(score)),
          logLikelihood: parseFloat(likelihoodRaw),
        };
      } else {
        // Score all traces in the log
        const raw: string = wasm.score_log_anomalies(logHandle, dfgHandle, activityKey);
        const anomalies: Array<Record<string, unknown>> = JSON.parse(raw);
        try { wasm.free_handle(dfgHandle); } catch { /* best-effort */ }
        return { anomalies: anomalies.slice(0, topK) };
      }
    }

    case 'drift': {
      const raw = wasm.detect_drift
        ? wasm.detect_drift(logHandle, activityKey, 50)
        : wasm.detect_concept_drift(logHandle, activityKey, 50);
      const driftPoints: Array<Record<string, unknown>> = JSON.parse(
        typeof raw === 'string' ? raw : JSON.stringify(raw)
      );
      return { driftPoints };
    }

    case 'features': {
      const prefixLen = prefixActivities ? prefixActivities.length : 5;
      const raw: string = wasm.extract_prefix_features(
        logHandle,
        activityKey,
        'time:timestamp',
        prefixLen
      );
      const features: Array<Record<string, unknown>> = JSON.parse(raw);
      return { features: features.slice(0, topK) };
    }

    case 'resource': {
      const raw = wasm.analyze_resource_utilization(logHandle, 'org:resource', activityKey);
      const utilization: Record<string, unknown> = JSON.parse(
        typeof raw === 'string' ? raw : JSON.stringify(raw)
      );
      return { resourceUtilization: utilization };
    }

    default:
      throw new Error(`Unhandled task: ${task}`);
  }
}

/**
 * Format results for human-readable output.
 */
function formatHumanOutput(
  formatter: HumanFormatter,
  task: PredictTask,
  result: Record<string, unknown>
): void {
  switch (task) {
    case 'next-activity': {
      const preds = result.predictions as Array<{
        activity: string;
        probability: number;
      }>;
      if (!preds || preds.length === 0) {
        formatter.info('No predictions available for the given prefix.');
        return;
      }
      formatter.log('');
      formatter.log('  Rank  Activity                   Probability');
      formatter.log('  ────  ─────────────────────────  ───────────');
      preds.forEach((p, i) => {
        const rank = String(i + 1).padStart(4);
        const act = p.activity.padEnd(25);
        const prob = (p.probability * 100).toFixed(1).padStart(8) + '%';
        formatter.log(`  ${rank}  ${act}  ${prob}`);
      });
      formatter.log('');
      break;
    }

    case 'remaining-time': {
      const features = result.prefixFeatures as Array<Record<string, unknown>>;
      if (!features || features.length === 0) {
        formatter.info('No prefix features extracted.');
        return;
      }
      formatter.log('');
      formatter.log(`  Extracted ${features.length} prefix feature vector(s)`);
      for (const f of features.slice(0, 3)) {
        formatter.log(`  ${JSON.stringify(f)}`);
      }
      formatter.log('');
      break;
    }

    case 'outcome': {
      if (result.anomalyScore !== undefined) {
        formatter.log('');
        formatter.log(`  Anomaly score:   ${(result.anomalyScore as number).toFixed(4)}`);
        formatter.log(`  Log-likelihood:  ${(result.logLikelihood as number).toFixed(4)}`);
        formatter.log('');
      } else {
        const anomalies = result.anomalies as Array<Record<string, unknown>>;
        if (!anomalies || anomalies.length === 0) {
          formatter.info('No anomalies found.');
          return;
        }
        formatter.log('');
        formatter.log('  Case ID              Score     Steps');
        formatter.log('  ───────────────────  ────────  ─────');
        for (const a of anomalies) {
          const caseId = String(a.case_id).padEnd(19);
          const score = (a.score as number).toFixed(4).padStart(8);
          const steps = String(a.steps).padStart(5);
          formatter.log(`  ${caseId}  ${score}  ${steps}`);
        }
        formatter.log('');
      }
      break;
    }

    case 'drift': {
      const points = result.driftPoints as Array<Record<string, unknown>>;
      if (!points || points.length === 0) {
        formatter.info('No concept drift detected.');
        return;
      }
      formatter.log('');
      formatter.log(`  Detected ${points.length} drift point(s):`);
      for (const dp of points) {
        const pos = dp.position ?? dp.index ?? '?';
        const dist = typeof dp.distance === 'number' ? dp.distance.toFixed(4) : String(dp.distance ?? '');
        formatter.log(`    Position ${pos}  distance=${dist}`);
      }
      formatter.log('');
      break;
    }

    case 'features': {
      const features = result.features as Array<Record<string, unknown>>;
      if (!features || features.length === 0) {
        formatter.info('No features extracted.');
        return;
      }
      formatter.log('');
      formatter.log(`  Extracted ${features.length} feature vector(s)`);
      for (const f of features.slice(0, 5)) {
        formatter.log(`  ${JSON.stringify(f)}`);
      }
      formatter.log('');
      break;
    }

    case 'resource': {
      const util = result.resourceUtilization as Record<string, unknown>;
      formatter.log('');
      formatter.log('  Resource utilization analysis:');
      for (const [key, value] of Object.entries(util)) {
        formatter.log(`    ${key}: ${JSON.stringify(value)}`);
      }
      formatter.log('');
      break;
    }
  }
}
