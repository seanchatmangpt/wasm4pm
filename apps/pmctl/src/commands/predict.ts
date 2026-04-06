import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@wasm4pm/engine';
import { loadPmctlConfig, buildCliOverrides } from '../config-loader.js';
import { savePredictionResult } from './results.js';

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
      description: 'Activity attribute key (default: from config or concept:name)',
    },
    prefix: {
      type: 'string',
      description: 'Comma-separated activity prefix for case-level predictions',
    },
    'top-k': {
      type: 'string',
      description: 'Number of top predictions to return (default: 3)',
    },
    'ngram-order': {
      type: 'string',
      description: 'N-gram order for next-activity prediction (default: from config or 2)',
    },
    'drift-window': {
      type: 'string',
      description: 'Window size for drift detection (default: from config or 10)',
    },
    config: {
      type: 'string',
      description: 'Path to configuration file',
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
    'no-save': {
      type: 'boolean',
      description: 'Do not persist the result to .wasm4pm/results/',
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
        formatter.error(`Unknown task: "${task}". Valid tasks: ${VALID_TASKS.join(', ')}`);
        process.exit(EXIT_CODES.source_error);
      }

      // Step 2: Load config to get prediction defaults
      const cliOverrides = buildCliOverrides({
        config: ctx.args.config,
        predictionActivityKey: ctx.args['activity-key'],
        predictionNgramOrder: ctx.args['ngram-order'],
        predictionDriftWindow: ctx.args['drift-window'],
      });
      const config = await loadPmctlConfig(cliOverrides, formatter);
      const pred = config.prediction;

      // Resolve parameters: CLI flag > config > hardcoded default
      const activityKey = (ctx.args['activity-key'] as string) || pred?.activityKey || 'concept:name';
      const topK = parseInt(ctx.args['top-k'] as string ?? '3', 10) || 3;
      const ngramOrder = parseInt(ctx.args['ngram-order'] as string ?? '0', 10) || pred?.ngramOrder || 2;
      const driftWindow = parseInt(ctx.args['drift-window'] as string ?? '0', 10) || pred?.driftWindowSize || 10;
      const prefixActivities = ctx.args.prefix
        ? (ctx.args.prefix as string).split(',').map((s) => s.trim())
        : undefined;

      // Step 3: Validate input file
      const inputPath = ctx.args.input as string;
      try {
        await fs.access(inputPath);
      } catch {
        formatter.error(`Input file not found: ${inputPath}`);
        process.exit(EXIT_CODES.source_error);
      }

      // Step 4: Load WASM module
      if (formatter instanceof HumanFormatter) {
        formatter.info(`Running prediction task: ${task}`);
      }

      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Step 5: Read and parse XES file
      if (formatter instanceof HumanFormatter) {
        formatter.debug(`Loading event log from: ${inputPath}`);
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Step 6: Execute prediction task
      const result = await executePredictionTask(
        wasm,
        task as PredictTask,
        logHandle,
        activityKey,
        topK,
        ngramOrder,
        driftWindow,
        prefixActivities,
      );

      // Step 7: Output results
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

      // Step 8: Persist result (unless --no-save)
      if (!ctx.args['no-save']) {
        const savedPath = await savePredictionResult(task, inputPath, activityKey, result);
        if (savedPath && formatter instanceof HumanFormatter) {
          formatter.debug(`Result saved: ${savedPath}`);
        }
      }

      // Step 9: Free handles
      try { wasm.delete_object(logHandle); } catch { /* best-effort */ }

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
  ngramOrder: number,
  driftWindow: number,
  prefixActivities?: string[],
): Promise<Record<string, unknown>> {
  switch (task) {
    case 'next-activity': {
      const predictorHandle: string = wasm.build_ngram_predictor(logHandle, activityKey, ngramOrder);
      const prefix = prefixActivities ?? [];
      const raw: string = wasm.predict_next_activity(predictorHandle, JSON.stringify(prefix));
      const predictions: Array<{ activity: string; probability: number }> = JSON.parse(raw);
      const topPredictions = predictions.slice(0, topK);
      try { wasm.delete_object(predictorHandle); } catch { /* best-effort */ }
      return { predictions: topPredictions };
    }

    case 'remaining-time': {
      const modelHandle: string = wasm.build_remaining_time_model(logHandle, activityKey, 'time:timestamp');
      if (prefixActivities && prefixActivities.length > 0) {
        const raw: string = wasm.predict_case_duration(modelHandle, JSON.stringify(prefixActivities));
        const prediction = JSON.parse(raw);
        try { wasm.delete_object(modelHandle); } catch { /* best-effort */ }
        return { prediction };
      } else {
        try { wasm.delete_object(modelHandle); } catch { /* best-effort */ }
        return { message: 'Remaining-time model built. Use --prefix "Activity1,Activity2" to predict case duration.' };
      }
    }

    case 'outcome': {
      // Use discover_dfg_handle (stores the DFG) so score_anomaly can access it
      const dfgHandle: string = wasm.discover_dfg_handle(logHandle, activityKey);

      if (prefixActivities && prefixActivities.length > 0) {
        // Score the given prefix as an anomaly
        const anomalyRaw: string = wasm.score_anomaly(dfgHandle, JSON.stringify(prefixActivities));
        const anomaly = JSON.parse(anomalyRaw);
        // Also score log-likelihood with n-gram
        const ngramHandle: string = wasm.build_ngram_predictor(logHandle, activityKey, ngramOrder);
        const logLikelihood: number = wasm.score_trace_likelihood(ngramHandle, JSON.stringify(prefixActivities));
        try { wasm.delete_object(ngramHandle); } catch { /* best-effort */ }
        try { wasm.delete_object(dfgHandle); } catch { /* best-effort */ }
        return { anomaly, logLikelihood };
      } else {
        // Score all traces in the log
        const raw: string = wasm.score_log_anomalies(logHandle, dfgHandle, activityKey);
        const anomalies: Array<Record<string, unknown>> = JSON.parse(raw);
        try { wasm.delete_object(dfgHandle); } catch { /* best-effort */ }
        return { anomalies: anomalies.slice(0, topK) };
      }
    }

    case 'drift': {
      const raw: string = wasm.detect_drift(logHandle, activityKey, driftWindow);
      const driftResult = JSON.parse(raw);
      return { driftResult };
    }

    case 'features': {
      const raw: string = wasm.build_transition_probabilities(logHandle, activityKey);
      const transitions = JSON.parse(raw);
      // Also extract prefix features if prefix given
      if (prefixActivities && prefixActivities.length > 0) {
        const prefixRaw: string = wasm.extract_prefix_features_wasm(JSON.stringify(prefixActivities));
        const prefixFeatures = JSON.parse(prefixRaw);
        return { transitions, prefixFeatures };
      }
      return { transitions };
    }

    case 'resource': {
      // Estimate queue delay using M/M/1 model
      // Arrival and service rates derived from default demonstration values
      const arrivalRate = 0.7;
      const serviceRate = 1.0;
      const queueRaw: string = wasm.estimate_queue_delay(arrivalRate, serviceRate);
      const queueStats = JSON.parse(queueRaw);
      // Show transition structure for context
      const transRaw: string = wasm.build_transition_probabilities(logHandle, activityKey);
      const transitions = JSON.parse(transRaw);
      return { queueStats, transitionCount: Array.isArray(transitions) ? transitions.length : 0 };
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
  result: Record<string, unknown>,
): void {
  switch (task) {
    case 'next-activity': {
      const preds = result.predictions as Array<{ activity: string; probability: number }>;
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
      if (result.prediction) {
        const pred = result.prediction as Record<string, unknown>;
        const remainingMs = (pred.remaining_ms as number) ?? 0;
        const remainingH = remainingMs / 3_600_000;
        const confidence = ((pred.confidence as number) ?? 0) * 100;
        formatter.log('');
        formatter.log(`  Estimated remaining time:  ${remainingH.toFixed(1)} hours`);
        formatter.log(`  Confidence:                ${confidence.toFixed(1)}%`);
        formatter.log(`  Method:                    ${pred.method ?? 'unknown'}`);
        formatter.log('');
      } else {
        formatter.info((result.message as string) ?? 'Use --prefix to predict case duration.');
      }
      break;
    }

    case 'outcome': {
      if (result.anomaly) {
        const a = result.anomaly as Record<string, unknown>;
        formatter.log('');
        formatter.log(`  Anomaly score:    ${(a.score as number).toFixed(4)}`);
        formatter.log(`  Is anomalous:     ${a.is_anomalous}`);
        formatter.log(`  Threshold:        ${a.threshold}`);
        formatter.log(`  Log-likelihood:   ${(result.logLikelihood as number).toFixed(4)}`);
        formatter.log('');
      } else {
        const anomalies = result.anomalies as Array<Record<string, unknown>>;
        if (!anomalies || anomalies.length === 0) {
          formatter.info('No anomalous traces found.');
          return;
        }
        formatter.log('');
        formatter.log('  Case ID              Score     Anomalous');
        formatter.log('  ───────────────────  ────────  ─────────');
        for (const a of anomalies) {
          const caseId = String(a.case_id ?? a.trace_id ?? '?').padEnd(19);
          const score = (a.score as number ?? 0).toFixed(4).padStart(8);
          const flag = a.is_anomalous ? 'yes' : 'no';
          formatter.log(`  ${caseId}  ${score}  ${flag}`);
        }
        formatter.log('');
      }
      break;
    }

    case 'drift': {
      const dr = result.driftResult as Record<string, unknown>;
      const drifts = dr?.drifts as Array<Record<string, unknown>> ?? [];
      if (drifts.length === 0) {
        formatter.info('No concept drift detected.');
        return;
      }
      formatter.log('');
      formatter.log(`  Detected ${drifts.length} drift point(s) (method: ${dr?.method ?? 'jaccard_window'}):`);
      for (const dp of drifts) {
        const pos = dp.position ?? '?';
        const dist = typeof dp.distance === 'number' ? dp.distance.toFixed(4) : String(dp.distance ?? '');
        formatter.log(`    Position ${pos}  distance=${dist}  type=${dp.type ?? 'concept_drift'}`);
      }
      formatter.log('');
      break;
    }

    case 'features': {
      const transitions = result.transitions as Array<Record<string, unknown>>;
      formatter.log('');
      if (Array.isArray(transitions)) {
        formatter.log(`  Transition probabilities: ${transitions.length} edge(s)`);
        for (const t of transitions.slice(0, 5)) {
          formatter.log(`    ${JSON.stringify(t)}`);
        }
        if (transitions.length > 5) formatter.log(`    ... (${transitions.length - 5} more)`);
      } else {
        formatter.log(`  ${JSON.stringify(transitions)}`);
      }
      if (result.prefixFeatures) {
        formatter.log('');
        formatter.log(`  Prefix features: ${JSON.stringify(result.prefixFeatures)}`);
      }
      formatter.log('');
      break;
    }

    case 'resource': {
      const qs = result.queueStats as Record<string, unknown>;
      formatter.log('');
      formatter.log('  M/M/1 Queue Model Estimate:');
      formatter.log(`    Wait time:    ${(qs?.wait_time as number ?? 0).toFixed(2)}s`);
      formatter.log(`    Utilization:  ${((qs?.utilization as number ?? 0) * 100).toFixed(1)}%`);
      formatter.log(`    Stable:       ${qs?.is_stable ?? false}`);
      formatter.log(`  Transitions in model: ${result.transitionCount}`);
      formatter.log('');
      break;
    }
  }
}
