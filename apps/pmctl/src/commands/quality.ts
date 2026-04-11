import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';
import { WasmLoader } from '@pictl/engine';

export interface QualityOptions extends OutputOptions {
  input?: string;
  metrics?: string;
  activityKey?: string;
}

export const quality = defineCommand({
  meta: {
    name: 'quality',
    description: 'Assess multi-dimensional quality of a process model (fitness, precision, generalization, simplicity)',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to XES event log file',
      required: false,
    },
    file: {
      type: 'string',
      description: 'Path to XES event log file (named alternative to positional)',
      alias: 'i',
    },
    metrics: {
      type: 'string',
      description: 'Comma-separated quality metrics to compute (default: fitness,precision,generalization,simplicity)',
      default: 'fitness,precision,generalization,simplicity',
    },
    'activity-key': {
      type: 'string',
      description: 'XES activity attribute key (default: concept:name)',
      default: 'concept:name',
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
      // Resolve input path (positional OR --file/-i)
      const inputPath: string | undefined =
        (ctx.args.input as string | undefined) || (ctx.args.file as string | undefined);

      if (!inputPath) {
        formatter.error(
          'Input file required.\n\nUsage:  pictl quality <log.xes>\n        pictl quality <log.xes> --metrics fitness,precision\n\nRun "pictl quality --help" for details.'
        );
        process.exit(EXIT_CODES.source_error);
      }

      // Validate input file exists
      try {
        await fs.access(inputPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        formatter.error(`Input file not found: ${inputPath} — ${message}`);
        process.exit(EXIT_CODES.source_error);
      }

      const activityKey = (ctx.args['activity-key'] as string) || 'concept:name';
      const metricsRaw = (ctx.args.metrics as string) || 'fitness,precision,generalization,simplicity';
      const requestedMetrics = metricsRaw.split(',').map((m) => m.trim().toLowerCase());

      const validMetrics = ['fitness', 'precision', 'generalization', 'simplicity'];
      const invalidMetrics = requestedMetrics.filter((m) => !validMetrics.includes(m));
      if (invalidMetrics.length > 0) {
        formatter.error(
          `Invalid metric(s): ${invalidMetrics.join(', ')}. Valid: ${validMetrics.join(', ')}`
        );
        process.exit(EXIT_CODES.config_error);
      }

      if (formatter instanceof HumanFormatter) {
        formatter.info(`Quality assessment: ${inputPath}`);
        formatter.debug(`Metrics: ${requestedMetrics.join(', ')}`);
      }

      // Load WASM module
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get();

      // Parse XES and load log
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Loading event log from XES file...');
      }

      const xesContent = await fs.readFile(inputPath, 'utf-8');
      const logHandle: string = wasm.load_eventlog_from_xes(xesContent);

      // Discover a model for quality assessment (use heuristic miner)
      if (formatter instanceof HumanFormatter) {
        formatter.debug('Discovering process model with heuristic miner...');
      }

      const rawModel = wasm.discover_heuristic_miner(logHandle, activityKey, 0.5);
      const model = typeof rawModel === 'string' ? JSON.parse(rawModel) : rawModel;

      // Compute quality metrics — fail fast if any metric computation fails
      const qualityScores: Record<string, number> = {};

      if (formatter instanceof HumanFormatter) {
        formatter.debug('Computing quality metrics...');
      }

      // Fitness
      if (requestedMetrics.includes('fitness')) {
        const rawFitness = wasm.compute_quality_fitness(logHandle, activityKey, JSON.stringify(model));
        const fitnessResult = typeof rawFitness === 'string' ? JSON.parse(rawFitness) : rawFitness;
        qualityScores.fitness = (fitnessResult as Record<string, unknown>).fitness as number;
      }

      // Precision
      if (requestedMetrics.includes('precision')) {
        const rawPrecision = wasm.compute_quality_precision(logHandle, activityKey, JSON.stringify(model));
        const precisionResult = typeof rawPrecision === 'string' ? JSON.parse(rawPrecision) : rawPrecision;
        qualityScores.precision = (precisionResult as Record<string, unknown>).precision as number;
      }

      // Generalization
      if (requestedMetrics.includes('generalization')) {
        const rawGen = wasm.compute_quality_generalization(logHandle, activityKey, JSON.stringify(model));
        const genResult = typeof rawGen === 'string' ? JSON.parse(rawGen) : rawGen;
        qualityScores.generalization = (genResult as Record<string, unknown>).generalization as number;
      }

      // Simplicity
      if (requestedMetrics.includes('simplicity')) {
        const rawSimplicity = wasm.compute_quality_simplicity(logHandle, activityKey, JSON.stringify(model));
        const simplicityResult = typeof rawSimplicity === 'string' ? JSON.parse(rawSimplicity) : rawSimplicity;
        qualityScores.simplicity = (simplicityResult as Record<string, unknown>).simplicity as number;
      }

      // Compute aggregate quality score
      const scores = Object.values(qualityScores);
      const aggregate = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.0;

      // Free log handle — fail if cleanup fails (resource leak is critical)
      wasm.delete_object(logHandle);

      // Build result
      const result = {
        status: 'success',
        input: inputPath,
        activityKey,
        metrics: requestedMetrics,
        scores: qualityScores,
        aggregate: {
          score: aggregate,
          level: aggregate >= 0.8 ? 'excellent' : aggregate >= 0.6 ? 'good' : aggregate >= 0.4 ? 'fair' : 'poor',
        },
        model: {
          type: 'heuristic_miner',
          nodes: (model as Record<string, unknown>).nodes ? (model.nodes as unknown[]).length : 0,
          edges: (model as Record<string, unknown>).edges ? (model.edges as unknown[]).length : 0,
        },
      };

      // Output results
      if (formatter instanceof JSONFormatter) {
        formatter.success('Quality assessment complete', result);
      } else {
        printHumanQuality(formatter as HumanFormatter, result);
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Quality assessment failed', error);
      } else {
        formatter.error(
          `Quality assessment failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

function printHumanQuality(formatter: HumanFormatter, result: Record<string, unknown>): void {
  const scores = result.scores as Record<string, number>;
  const aggregate = result.aggregate as Record<string, unknown>;
  const modelInfo = result.model as Record<string, unknown>;

  formatter.log('');
  formatter.success(`Quality Assessment — ${result.input as string}`);
  formatter.log(`  Activity key: ${result.activityKey as string}`);
  formatter.log(`  Model: ${modelInfo.type as string} (${modelInfo.nodes} nodes, ${modelInfo.edges} edges)`);
  formatter.log('');

  // ASCII bar chart for quality scores
  const sparkBar = (value: number, width = 20): string => {
    const filled = Math.round(value * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  };

  const scoreLabel = (score: number): string => {
    if (score >= 0.8) return '✓';
    if (score >= 0.6) return '○';
    return '✗';
  };

  formatter.log('  Quality Scores:');
  for (const [metric, score] of Object.entries(scores)) {
    const bar = sparkBar(score);
    const label = scoreLabel(score);
    formatter.log(`    ${metric.padEnd(15)} ${score.toFixed(3).padStart(6)}  ${label}  ${bar}`);
  }
  formatter.log('');

  // Aggregate score
  const aggScore = aggregate.score as number;
  const aggLevel = aggregate.level as string;
  const aggBar = sparkBar(aggScore);
  const aggLabel = scoreLabel(aggScore);
  formatter.log(`  Aggregate: ${aggScore.toFixed(3).padStart(6)}  ${aggLabel}  ${aggBar}  (${aggLevel})`);
  formatter.log('');

  // Interpretation
  formatter.log('  Interpretation:');
  formatter.log(`    - Fitness:       How well the model can replay the log`);
  formatter.log(`    - Precision:     How much unobserved behavior the model allows`);
  formatter.log(`    - Generalization: How well the model generalizes to unseen behavior`);
  formatter.log(`    - Simplicity:    How simple/complex the model is`);
  formatter.log('');
}
