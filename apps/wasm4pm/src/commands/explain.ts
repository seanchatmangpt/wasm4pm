import { defineCommand } from 'citty';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan, withSpanRaw } from './_otel.js';
import { WASM_FUNCTION_NAMES } from '@wasm4pm/contracts';

export interface ExplainOptions {
  format?: 'human' | 'json';
  verbose?: boolean;
  quiet?: boolean;
  config?: string;
  model?: string;
  algorithm?: string;
  level?: 'brief' | 'detailed' | 'academic';
}

export const explain = defineCommand({
  meta: {
    name: 'explain',
    description: 'Explain a discovered model or algorithm in human-readable terms',
  },
  args: {
    target: {
      type: 'positional',
      description:
        'Algorithm name to explain (dfg, alpha, heuristic, etc.). Equivalent to --algorithm.',
      required: false,
    },
    config: {
      type: 'string',
      description: 'Path to configuration file (optional)',
    },
    model: {
      type: 'string',
      description: 'Path to discovered model file or handle',
      alias: 'm',
    },
    algorithm: {
      type: 'string',
      description: 'Algorithm to explain (dfg, alpha, heuristic, genetic, ilp, etc)',
      alias: 'a',
    },
    level: {
      type: 'string',
      description: 'Explanation level (brief, detailed, academic)',
      default: 'detailed',
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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);

    // Determine algorithm early (positional may override --algorithm)
    const earlyAlgo =
      (ctx.args.algorithm as string | undefined) ??
      (typeof ctx.args.target === 'string' && ctx.args.target.length > 0
        ? ctx.args.target
        : undefined);
    const level = (ctx.args.level || 'detailed') as string;

    return withSpan(
      'explain',
      {
        algorithm: earlyAlgo ?? '',
        level,
        has_model: Boolean(ctx.args.model),
        has_config: Boolean(ctx.args.config),
        format,
      },
      async () => {
        try {
          // Validate --level: only brief|detailed|academic are accepted.
          // An unrecognised value is a configuration error (exit 1).
          const VALID_LEVELS = ['brief', 'detailed', 'academic'];
          if (ctx.args.level && !VALID_LEVELS.includes(ctx.args.level as string)) {
            const result = makeErrorResult(
              'explain',
              `Invalid level: "${ctx.args.level}". Must be one of: brief, detailed, academic`,
              EXIT_CODES.config_error,
              'INVALID_LEVEL'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          }

          // Intercept subcommands: "compare <alg1> <alg2>" and "concepts"
          // These override all other logic and are detected by the positional target.
          if (typeof ctx.args.target === 'string') {
            const subcmd = ctx.args.target.toLowerCase().trim();

            // wpm explain concepts — process mining fundamentals glossary
            if (subcmd === 'concepts') {
              const conceptsContent = getConceptsGlossary();
              const payload = {
                algorithm: null,
                subject: 'concepts',
                level: 'detailed' as const,
                content: conceptsContent,
                concepts: PROCESS_MINING_CONCEPTS,
              };
              const result = makeResult('explain', payload, performance.now() - t0, EXIT_CODES.success);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const p = res.payload as typeof payload;
                projection.log(p.content);
              });
              return await exitWithFlush(result.exit_code);
            }

            // wpm explain compare <alg1> <alg2>
            // The two algorithm names arrive via process.argv because citty only captures one positional.
            if (subcmd === 'compare') {
              // Pull alg1 and alg2 from raw process.argv after 'compare'
              const explainIdx = process.argv.indexOf('explain');
              const compareIdx = process.argv.indexOf('compare', explainIdx);
              const afterCompare = compareIdx >= 0 ? process.argv.slice(compareIdx + 1).filter(a => !a.startsWith('-')) : [];
              const alg1 = afterCompare[0];
              const alg2 = afterCompare[1];

              if (!alg1 || !alg2) {
                const result = makeErrorResult(
                  'explain',
                  'Usage: wpm explain compare <algorithm1> <algorithm2>',
                  EXIT_CODES.config_error,
                  'MISSING_COMPARE_ARGS'
                );
                emitResult(result, { format, verbose, quiet });
                return await exitWithFlush(result.exit_code);
              }

              const knownAlgorithms = Object.keys(WASM_FUNCTION_NAMES);
              for (const [argName, algId] of [['algorithm1', alg1], ['algorithm2', alg2]] as const) {
                if (!knownAlgorithms.includes(algId)) {
                  const result = makeErrorResult(
                    'explain',
                    `Unknown algorithm for ${argName}: '${algId}'\n\nKnown algorithms: ${knownAlgorithms.join(', ')}`,
                    EXIT_CODES.config_error,
                    'UNKNOWN_ALGORITHM'
                  );
                  emitResult(result, { format, verbose, quiet });
                  return await exitWithFlush(result.exit_code);
                }
              }

              const comparison = buildAlgorithmComparison(alg1, alg2);
              const result = makeResult('explain', comparison, performance.now() - t0, EXIT_CODES.success);
              emitResult(result, { format, verbose, quiet }, (res, projection) => {
                const p = res.payload as typeof comparison;
                projection.log(formatComparisonOutput(p));
              });
              return await exitWithFlush(result.exit_code);
            }
          }

          // Accept positional <algorithm> as alias for --algorithm.
          // ctx.args is typed readonly by citty, but aliasing the positional
          // onto the named flag here is intentional so every downstream
          // `ctx.args.algorithm` read sees it.
          if (
            !ctx.args.algorithm &&
            typeof ctx.args.target === 'string' &&
            ctx.args.target.length > 0
          ) {
            (ctx.args as { algorithm?: string }).algorithm = ctx.args.target;
          }

          // Step 1: Zero-arg mode — show algorithm menu instead of a bare error
          if (!ctx.args.model && !ctx.args.algorithm && !ctx.args.config) {
            const menuContent = getAlgorithmMenu();
            const payload = {
              algorithm: null,
              subject: 'algorithm-menu',
              level: 'brief' as const,
              content: menuContent,
            };
            const result = makeResult(
              'explain',
              payload,
              performance.now() - t0,
              EXIT_CODES.success
            );
            emitResult(result, { format, verbose, quiet }, (res, projection) => {
              const p = res.payload as typeof payload;
              projection.log(p.content);
              projection.log('');
              projection.log(
                '  Run "wpm explain <algorithm>"   — detailed explanation of one algorithm'
              );
              projection.log(
                '  Run "wpm explain <algorithm> --level academic" — formal definitions'
              );
              projection.log(
                '  Run "wpm algorithms"            — full list with speed/quality scores'
              );
            });
            return await exitWithFlush(result.exit_code);
          }

          // Step 2: Generate explanation content
          let explanationContent = '';
          const level = (ctx.args.level || 'detailed') as 'brief' | 'detailed' | 'academic';

          if (ctx.args.model) {
            const result = makeErrorResult(
              'explain',
              'Model-file explanation (--model) is not yet implemented in this build',
              EXIT_CODES.execution_error,
              'NOT_IMPLEMENTED',
              'Use wpm explain <algorithm> for algorithm guidance, or wpm interpret for metric help'
            );
            emitResult(result, { format, verbose, quiet });
            return await exitWithFlush(result.exit_code);
          } else if (ctx.args.config) {
            try {
              const configPath = ctx.args.config || process.cwd();
              const config = await loadConfig({
                configSearchPaths: [configPath],
              });

              explanationContent = `Configuration explanation:\n\n`;
              explanationContent += `Profile: ${config.execution.profile}\n`;
              explanationContent += `Timeout: ${config.execution.timeout}ms\n`;
              explanationContent += `Max Memory: ${config.execution.maxMemory} bytes\n`;
              explanationContent += `Watch Enabled: ${config.watch?.enabled ?? false}\n`;
              explanationContent += `Output Format: ${config.output?.format ?? 'human'}\n`;
            } catch (error) {
              throw new Error(
                `Failed to explain config: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          } else if (ctx.args.algorithm) {
            explanationContent = await withSpanRaw(
              'explain.algorithm',
              { 'explain.algorithm': String(ctx.args.algorithm), 'explain.level': level },
              async () => getAlgorithmExplanation(ctx.args.algorithm as string, level)
            );
          }

          // Step 3: Build result and emit
          // Resolve algo meta for JSON output and the quality trade-offs section.
          // Use exact-key lookup (no bidirectional substring match) to avoid false positives.
          const resolvedAlgo = ctx.args.algorithm as string | undefined;
          const algoKeyNorm = resolvedAlgo
            ? resolvedAlgo.toLowerCase().replace(/[+*-]/g, '').replace(/_/g, '')
            : undefined;
          // Canonical registry ID → ALGO_META short key for algorithms whose meta key differs
          // from the registry ID (e.g. simd_streaming_dfg → simd_dfg, hill_climbing → hill).
          const META_CANONICAL_MAP: Record<string, string> = {
            simdstreamingdfg: 'simd_dfg',
            hillclimbing: 'hill',
          };
          const metaKeyNorm = algoKeyNorm
            ? META_CANONICAL_MAP[algoKeyNorm] ?? algoKeyNorm
            : undefined;
          // Build a map of normalised-key → original ALGO_META key for exact lookup.
          const metaNormMap = Object.fromEntries(
            Object.keys(ALGO_META).map((k) => [k.replace(/_/g, ''), k])
          );
          const metaKey = metaKeyNorm ? metaNormMap[metaKeyNorm.replace(/_/g, '')] ?? metaNormMap[metaKeyNorm] : undefined;
          const meta = metaKey ? ALGO_META[metaKey] : undefined;

          const payload = {
            // Van der Aalst-contract fields — present in JSON output for all known algorithms.
            algorithm: resolvedAlgo ?? null,
            subject: ctx.args.model || ctx.args.algorithm || 'execution plan',
            level,
            content: explanationContent,
            description: meta
              ? `${resolvedAlgo ?? ''} — speed: ${meta.speedScore}/100 quality: ${meta.qualityScore}/100 output: ${meta.outputType}`
              : null,
            // Structured metadata from ALGO_META — populated when explaining a known algorithm.
            strengths: meta?.strengths ?? null,
            weaknesses: meta?.weaknesses ?? null,
            use_cases: meta?.use_cases ?? null,
            complexity: meta?.complexity ?? null,
            parameters: meta?.parameters ?? null,
            // Registry-sourced scores — populated when explaining a known algorithm.
            quality_score: meta?.qualityScore ?? null,
            speed_score: meta?.speedScore ?? null,
            output_type: meta?.outputType ?? null,
            quality_dimensions: meta
              ? {
                  fitness: meta.fitness,
                  precision: meta.precision,
                  generalization: meta.generalization,
                  simplicity: meta.simplicity,
                }
              : null,
            deployment_profiles: meta?.deploymentProfiles ?? null,
            when_to_use: meta?.whenToUse ?? null,
            alternatives: meta?.alternatives ?? null,
            // Tier labels derived from registry scores — "fast"/"balanced"/"quality"
            speed_tier: meta ? deriveSpeedTier(meta.speedScore) : null,
            quality_tier: meta ? deriveQualityTier(meta.qualityScore) : null,
          };

          const result = makeResult('explain', payload, performance.now() - t0, EXIT_CODES.success);
          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            const p = res.payload as typeof payload;
            projection.info(`Explanation: ${p.subject}`);
            projection.log('');
            projection.log(p.content);

            // Quality trade-offs section — only when we have metadata for the algorithm.
            if (p.quality_dimensions && p.quality_score !== null && p.speed_score !== null) {
              projection.log('');
              projection.log('Quality trade-offs (Van der Aalst 4 dimensions):');
              projection.log(`  Fitness        — ${p.quality_dimensions.fitness}`);
              projection.log(`  Precision      — ${p.quality_dimensions.precision}`);
              projection.log(`  Generalization — ${p.quality_dimensions.generalization}`);
              projection.log(`  Simplicity     — ${p.quality_dimensions.simplicity}`);
              projection.log('');
              projection.log(
                `Registry scores  — speed: ${p.speed_score}/100 (lower=faster)  quality: ${p.quality_score}/100  output: ${p.output_type}`
              );
            }

            if (p.deployment_profiles && p.deployment_profiles.length > 0) {
              projection.log('');
              projection.log(`Deployment profiles — ${p.deployment_profiles.join(', ')}`);
              projection.log(
                '  (Use wpm init --preset <profile> to scaffold a matching config file)'
              );
            }

            if (p.when_to_use) {
              projection.log('');
              projection.log(`When to use — ${p.when_to_use}`);
            }

            if (p.alternatives) {
              projection.log(`Alternatives — ${p.alternatives}`);
            }

            projection.log('');
          });
          return await exitWithFlush(result.exit_code);
        } catch (error) {
          // UNKNOWN_ALGORITHM is a user argument error — emit config_error (exit 1).
          // All other errors fall through to execution_error (exit 3).
          const isUnknownAlgo =
            error instanceof Error &&
            (error as Error & { code?: string }).code === 'UNKNOWN_ALGORITHM';
          const exitCode = isUnknownAlgo ? EXIT_CODES.config_error : EXIT_CODES.execution_error;
          const errorCode = isUnknownAlgo ? 'UNKNOWN_ALGORITHM' : 'EXPLAIN_ERROR';
          const result = makeErrorResult('explain', error, exitCode, errorCode);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(result.exit_code);
        }
      }
    ); // end withSpan
  },
});

/**
 * Static metadata for each algorithm: quality dimensions, deployment profiles, scores.
 * These values mirror the kernel registry (packages/kernel/src/registry.ts) and are
 * used to populate the "Quality trade-offs" section without importing the registry at
 * CLI runtime (avoids the heavy WASM bootstrap path for a pure explain invocation).
 */
interface AlgoMeta {
  speedScore: number; // 1–100, lower = faster
  qualityScore: number; // 0–100, higher = better model quality
  outputType: string; // dfg | petrinet | declare | tree | ml_result
  complexity?: string; // Big-O complexity string
  fitness: string; // High | Medium | Low
  precision: string; // High | Medium | Low
  generalization: string; // High | Medium | Low
  simplicity: string; // High | Medium | Low
  deploymentProfiles: string[]; // fast | balanced | quality | stream
  whenToUse: string;
  alternatives: string;
  // Structured JSON contract fields — present in payload for all known algorithms
  strengths?: string[];
  weaknesses?: string[];
  use_cases?: string[];
  parameters?: Array<{ name: string; type: string; description: string; required?: boolean; default?: string }>;
}

const ALGO_META: Record<string, AlgoMeta> = {
  dfg: {
    speedScore: 5,
    qualityScore: 30,
    outputType: 'dfg',
    complexity: 'O(|E|)',
    fitness: 'High (100% on training log by construction)',
    precision: 'Low (allows many unobserved paths)',
    generalization: 'Low (overfits to sample)',
    simplicity: 'High (one node per activity)',
    deploymentProfiles: ['fast', 'balanced', 'quality', 'stream'],
    whenToUse: 'First look at a new log; real-time dashboards; logs with 1M+ events.',
    alternatives:
      'Use heuristic_miner when noise filtering matters; inductive_miner when you need a sound model.',
    strengths: [
      'Linear time complexity — extremely fast',
      'Interpretable: every edge is a directly-observed succession',
      'Handles logs with millions of events without memory issues',
    ],
    weaknesses: [
      'Cannot model parallel activities, long-distance dependencies, or invisible tasks',
      'Overfits to the sample: low generalization on unseen traces',
      'Low precision — allows many paths never observed in the log',
    ],
    use_cases: [
      'Initial exploratory analysis of a new event log',
      'Real-time process dashboards requiring sub-second refresh',
      'Structural comparison of two logs via wpm diff',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label (default: concept:name per XES standard)',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  alpha: {
    speedScore: 20,
    qualityScore: 45,
    outputType: 'petrinet',
    complexity: 'O(n² × |E|)',
    fitness: 'High (fits all non-looping traces)',
    precision: 'Medium (handles some concurrency)',
    generalization: 'Medium',
    simplicity: 'Medium (Petri net, more structure than DFG)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Processes with true parallelism (AND-splits); when a Petri net is required for downstream tools.',
    alternatives: 'Use inductive_miner for guaranteed soundness; heuristic_miner for noisy logs.',
    strengths: [
      'Discovers concurrent (parallel) activities that DFG cannot model',
      'Produces a formal Petri net compatible with downstream verification tools',
      'Classic algorithm — well understood in the process mining literature',
    ],
    weaknesses: [
      'Cannot handle long-term loops or duplicate activities',
      'Sensitive to noise: rare events corrupt the ordering relations',
      'No soundness guarantee — may produce unsound Petri nets on real logs',
    ],
    use_cases: [
      'Structured processes with known parallelism (e.g., procurement with parallel approvals)',
      'When Petri net output is required for formal model checking or simulation',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  heuristic: {
    speedScore: 25,
    qualityScore: 50,
    outputType: 'dfg',
    complexity: 'O(n² × |E|)',
    fitness: 'Medium (filters low-frequency traces)',
    precision: 'Medium',
    generalization: 'High (threshold removes outliers)',
    simplicity: 'Medium',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse: 'Noisy logs (many rare variants); when you need a quick but noise-robust overview.',
    alternatives: 'Use dfg for maximum speed; inductive_miner for structurally sound models.',
    strengths: [
      'Robust to noise: threshold filters out infrequent, likely erroneous edges',
      'Good generalization — rare exceptions are excluded, keeping the model lean',
      'Dependency metric (0–1) gives transparent control over filtering',
    ],
    weaknesses: [
      'Threshold requires manual tuning (0.2–0.8 range depending on log quality)',
      'Output is a causal net, not a fully formal Petri net — limited verification support',
      'May miss legitimate rare paths when threshold is set too high',
    ],
    use_cases: [
      'Real-world noisy logs from ERP systems or ticketing systems',
      'First model when you expect many exception/workaround variants',
      'Preprocessing step before conformance checking on a cleaned model',
    ],
    parameters: [
      {
        name: 'dependency_threshold',
        type: 'number',
        description: 'Minimum dependency score [0–1] for an arc to be included. Lower = more edges, higher = fewer edges.',
        required: false,
        default: '0.5',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  inductive: {
    speedScore: 30,
    qualityScore: 55,
    outputType: 'tree',
    complexity: 'O(|L| × |A|)',
    fitness: 'High (complete by construction)',
    precision: 'Medium (may over-generalise on noisy logs)',
    generalization: 'High (block structure captures future behaviour)',
    simplicity: 'High (process tree is the most readable output)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Structured workflows (BPMN-like); automated conformance checking; when soundness must be guaranteed.',
    alternatives:
      'Use heuristic_miner when logs are noisy; ilp when maximum fitness/precision is the goal.',
    strengths: [
      'Soundness guaranteed by construction — no deadlocks or livelocks possible',
      'Produces a human-readable process tree (→, ×, ∧, ↻ operators)',
      'Handles loops and exclusive choices natively',
    ],
    weaknesses: [
      'May add "skip" arcs on noisy logs to force soundness, reducing precision',
      'Block structure may not match the real concurrent structure of some processes',
      'Slower than DFG or heuristic miner on very large logs',
    ],
    use_cases: [
      'BPMN-like structured workflows (ERP, BPM system outputs)',
      'Automated conformance checking pipelines that require sound models',
      'Educational settings where a clear hierarchical process structure is needed',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  genetic: {
    speedScore: 75,
    qualityScore: 80,
    outputType: 'dfg',
    complexity: 'O(G × P × |log| × |model|)',
    fitness: 'High',
    precision: 'High (evolves models that avoid spurious paths)',
    generalization: 'High (population diversity reduces overfitting)',
    simplicity: 'Low (larger search space → more complex models)',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Best-quality model where runtime > 1 min is acceptable; complex processes with loops and concurrency.',
    alternatives:
      'Use ilp for provably optimal models; pso or aco for faster population-based search.',
    strengths: [
      'High model quality — evolutionary search explores a wide model space',
      'Population diversity reduces risk of local optima',
      'Flexible fitness function can encode domain-specific trade-offs',
    ],
    weaknesses: [
      'Slowest of the practical algorithms — exponential worst-case',
      'Results are non-deterministic without a fixed random seed',
      'Impractical for logs with more than 5 000 events without a strong machine',
    ],
    use_cases: [
      'Gold-standard benchmarking where maximum quality is required',
      'Complex processes with loops, concurrency, and many exception paths',
      'Offline batch analysis where runtime is not a constraint',
    ],
    parameters: [
      {
        name: 'population_size',
        type: 'number',
        description: 'Number of candidate models per generation',
        required: false,
        default: '20',
      },
      {
        name: 'iterations',
        type: 'number',
        description: 'Number of evolutionary generations',
        required: false,
        default: '10',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ilp: {
    speedScore: 80,
    qualityScore: 90,
    outputType: 'petrinet',
    complexity: 'NP-hard',
    fitness: 'High (optimal by formulation)',
    precision: 'High (ILP objective penalises spurious transitions)',
    generalization: 'Medium (can overfit small logs)',
    simplicity: 'Low (ILP can produce large Petri nets)',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Gold-standard benchmarking; regulatory compliance where optimal precision matters; small-to-medium logs.',
    alternatives:
      'Use genetic_algorithm for large logs; inductive_miner for a simpler sound model.',
    strengths: [
      'Provably optimal fitness/precision trade-off for the given log',
      'Formal Petri net output supports downstream verification',
      'Configurable λ weight lets you tune fitness vs simplicity',
    ],
    weaknesses: [
      'Exponential worst-case — impractical beyond ~5 000 events',
      'Can overfit small logs (high precision on training, poor generalization)',
      'Produces larger Petri nets than inductive_miner',
    ],
    use_cases: [
      'Regulatory compliance audits requiring a provably optimal model',
      'Benchmarking other algorithms — ILP provides the quality ceiling',
      'Small high-stakes processes where optimality justifies the runtime cost',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  astar: {
    speedScore: 60,
    qualityScore: 70,
    outputType: 'dfg',
    complexity: 'O(b^d)',
    fitness: 'High (heuristic guides toward high-fitness models)',
    precision: 'Medium-High',
    generalization: 'Medium',
    simplicity: 'Medium',
    deploymentProfiles: ['quality'],
    whenToUse:
      'When you want near-optimal quality faster than ILP; medium-sized logs with defined budget.',
    alternatives: 'Use ilp for optimal result; aco/pso for swarm-based exploration.',
    strengths: [
      'Near-optimal quality with a fraction of ILP runtime when heuristic is good',
      'Principled best-first search — avoids poor regions of the model space',
      'Can be bounded by iteration limit for time-constrained runs',
    ],
    weaknesses: [
      'Quality depends heavily on heuristic admissibility — poor heuristics give poor results',
      'Memory-intensive: open/closed sets grow with search depth',
      'Not as interpretable as inductive_miner output',
    ],
    use_cases: [
      'Medium-complexity logs where ILP runtime is prohibitive but quality matters',
      'Pipeline stages where you have a strict time budget but need better than heuristic_miner',
    ],
    parameters: [
      {
        name: 'max_iterations',
        type: 'number',
        description: 'Maximum search iterations before stopping',
        required: false,
        default: '1000',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  hill: {
    speedScore: 40,
    qualityScore: 55,
    outputType: 'dfg',
    complexity: 'O(K × |E| × |model|)',
    fitness: 'Medium (local optimum only)',
    precision: 'Medium',
    generalization: 'Medium',
    simplicity: 'High (starts from a simple seed)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Refining a model from a fast algorithm; quick improvement pass before deeper analysis.',
    alternatives: 'Use annealing to escape local optima; genetic_algorithm for global search.',
    strengths: [
      'Fast refinement — improves an existing model with minimal computation',
      'Simple and predictable: deterministic given the same seed model',
      'Good for post-processing a DFG or heuristic model',
    ],
    weaknesses: [
      'Cannot escape local optima — results depend entirely on the starting model',
      'No exploration of diverse model families',
      'Quality ceiling lower than genetic or ILP',
    ],
    use_cases: [
      'Quick quality improvement of a DFG result before presentation',
      'Iterative refinement loop: fast algorithm → hill climbing → check conformance',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  annealing: {
    speedScore: 55,
    qualityScore: 65,
    outputType: 'dfg',
    complexity: 'O(S × |model|)',
    fitness: 'Medium-High (escapes local optima)',
    precision: 'Medium',
    generalization: 'Medium-High',
    simplicity: 'Medium',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Complex processes where hill climbing gets stuck; balancing exploration and exploitation.',
    alternatives:
      'Use genetic_algorithm for population-based search; aco for pheromone-guided exploration.',
    strengths: [
      'Escapes local optima via probabilistic acceptance of worse solutions at high temperature',
      'Theoretically converges to global optimum with slow enough cooling schedule',
      'More robust than hill climbing on complex fitness landscapes',
    ],
    weaknesses: [
      'Cooling schedule requires tuning — poor schedule = poor result',
      'Non-deterministic without fixed seed',
      'Slower to converge than hill climbing on smooth landscapes',
    ],
    use_cases: [
      'Complex processes with many local optima where hill climbing consistently gets stuck',
      'Exploratory analysis before committing to the slower genetic algorithm',
    ],
    parameters: [
      {
        name: 'temperature',
        type: 'number',
        description: 'Initial temperature T₀ controlling exploration rate',
        required: false,
        default: '1.0',
      },
      {
        name: 'cooling_rate',
        type: 'number',
        description: 'Geometric cooling factor α ∈ (0,1)',
        required: false,
        default: '0.95',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  aco: {
    speedScore: 65,
    qualityScore: 75,
    outputType: 'dfg',
    complexity: 'O(I × K × |E|)',
    fitness: 'High',
    precision: 'High (pheromone trails converge on frequent paths)',
    generalization: 'High',
    simplicity: 'Low',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Complex process structures with hidden patterns; when pheromone convergence is a good fit.',
    alternatives:
      'Use pso for faster convergence on smooth landscapes; genetic_algorithm for explicit fitness tuning.',
    strengths: [
      'Pheromone trails provide natural bias toward frequently used paths',
      'Good at discovering hidden structures in complex logs',
      'Parallelizable across ants for faster wall-clock time',
    ],
    weaknesses: [
      'Multiple hyperparameters (α, β, ρ) require tuning',
      'Pheromone convergence can cause premature stagnation on some landscapes',
      'Slower than heuristic_miner for simple logs',
    ],
    use_cases: [
      'Complex multi-path processes where pheromone dynamics model real traffic well',
      'When swarm-style exploration is preferred over population crossover (vs genetic)',
    ],
    parameters: [
      {
        name: 'num_ants',
        type: 'number',
        description: 'Number of ants per iteration',
        required: false,
        default: '20',
      },
      {
        name: 'iterations',
        type: 'number',
        description: 'Number of colony iterations',
        required: false,
        default: '10',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  pso: {
    speedScore: 70,
    qualityScore: 75,
    outputType: 'dfg',
    complexity: 'O(G × P × |E|)',
    fitness: 'High',
    precision: 'High',
    generalization: 'High',
    simplicity: 'Low',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Continuous model space; when global best sharing matters; parallelisable workloads.',
    alternatives:
      'Use aco for discrete process structures; genetic_algorithm for explicit crossover/mutation.',
    strengths: [
      'Fast convergence on smooth fitness landscapes compared to genetic algorithm',
      'Global best sharing accelerates convergence across the swarm',
      'Parallelizable — each particle is independent',
    ],
    weaknesses: [
      'Velocity update requires careful tuning of inertia and cognitive/social coefficients',
      'Can converge prematurely to sub-optimal global best on rugged landscapes',
      'Not as effective as ACO on discrete graph-structured process spaces',
    ],
    use_cases: [
      'Continuous optimisation of model parameters rather than discrete structure search',
      'When parallel execution is available and fast convergence is preferred',
    ],
    parameters: [
      {
        name: 'population_size',
        type: 'number',
        description: 'Number of particles in the swarm',
        required: false,
        default: '30',
      },
      {
        name: 'iterations',
        type: 'number',
        description: 'Number of swarm iterations',
        required: false,
        default: '20',
      },
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  skeleton: {
    speedScore: 3,
    qualityScore: 25,
    outputType: 'dfg',
    complexity: 'O(|E| + |V|·log|V|)',
    fitness: 'Medium (filters low-frequency edges)',
    precision: 'High (minimal model = high precision)',
    generalization: 'Low (loses rare but important paths)',
    simplicity: 'Very High (skeleton is the most compact output)',
    deploymentProfiles: ['fast', 'balanced', 'quality', 'stream'],
    whenToUse:
      'Executive overview; noise filtering before deeper analysis; mobile/IoT deployments.',
    alternatives:
      'Use dfg for the full picture; heuristic_miner for threshold-controlled filtering.',
    strengths: [
      'Fastest structural algorithm — near-linear time, minimal memory',
      'High precision: only the most frequent paths are retained',
      'Produces the most compact and readable model of any algorithm',
    ],
    weaknesses: [
      'Low generalization: rare but important paths are discarded',
      'Fixed frequency threshold — less configurable than heuristic_miner',
      'May not capture the full process behavior for conformance checking',
    ],
    use_cases: [
      'Executive-level process overview requiring a clean single-page view',
      'Pre-processing step to identify the core happy path before deeper analysis',
      'Mobile and IoT deployments where model size matters most',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  declare: {
    speedScore: 35,
    qualityScore: 50,
    outputType: 'declare',
    complexity: 'O(|templates| × |A|² × |E|)',
    fitness: 'Medium (constraint-based, not replay-based)',
    precision: 'High (each constraint is individually verifiable)',
    generalization: 'High (constraints generalise naturally)',
    simplicity: 'Very High (business-friendly constraint names)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Compliance checking; flexible processes (healthcare, research); regulatory monitoring.',
    alternatives:
      'Use inductive_miner for a procedural block model; heuristic_miner for DFG-based overview.',
    strengths: [
      'Business-readable constraint names (response, precedence, succession)',
      'Naturally handles flexible processes with no fixed ordering',
      'Each constraint is independently verifiable for compliance monitoring',
    ],
    weaknesses: [
      'Fitness is not token-replay-based — cannot do standard conformance checking',
      'Constraint explosion on complex logs: too many constraints reduces interpretability',
      'Requires domain knowledge to interpret which constraints are meaningful',
    ],
    use_cases: [
      'Regulatory compliance checking in healthcare, finance, or legal domains',
      'Flexible knowledge-intensive processes where strict ordering is not enforced',
      'Process monitoring dashboards where individual constraint violations must be tracked',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_cluster: {
    speedScore: 35,
    qualityScore: 55,
    outputType: 'ml_result',
    complexity: 'O(n²)',
    fitness: 'N/A (clustering, not process replay)',
    precision: 'N/A',
    generalization: 'High (distance-based grouping)',
    simplicity: 'Medium',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Discovering trace variants automatically; segmenting cases by behavior; finding anomalous clusters.',
    alternatives: 'Use ml_anomaly for outlier detection; dfg for a direct process overview.',
    strengths: [
      'Automatically groups similar traces without a prior model',
      'Reveals hidden behavioral segments in a heterogeneous log',
      'Silhouette score provides an objective measure of cluster quality',
    ],
    weaknesses: [
      'Number of clusters k must be specified or estimated',
      'Cluster assignments are not directly interpretable as process models',
      'High-dimensional feature spaces may reduce cluster quality',
    ],
    use_cases: [
      'Segmenting customers by process behavior in CRM logs',
      'Identifying process variants before per-variant conformance checking',
      'Detecting behavioral drift by clustering time windows',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_anomaly: {
    speedScore: 30,
    qualityScore: 55,
    outputType: 'ml_result',
    complexity: 'O(n × |features|)',
    fitness: 'N/A (anomaly scoring, not process replay)',
    precision: 'N/A',
    generalization: 'High',
    simplicity: 'Medium',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Finding rare or suspicious cases; fraud detection; identifying process deviations without a reference model.',
    alternatives:
      'Use conformance checking when a normative model exists; ml_cluster for grouping rather than scoring.',
    strengths: [
      'Identifies outliers without requiring a reference process model',
      'Returns per-case anomaly scores for risk prioritization',
      'EMA smoothing reduces sensitivity to noise in the feature signal',
    ],
    weaknesses: [
      'Anomaly score threshold requires domain knowledge to interpret',
      'Cannot explain why a case is anomalous — only that it is',
      'High false positive rate on logs with many legitimate rare variants',
    ],
    use_cases: [
      'Fraud detection in financial process logs',
      'Quality control: flagging production cases that deviate from typical behavior',
      'Predictive monitoring: early warning on cases likely to become exceptions',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_classify: {
    speedScore: 35,
    qualityScore: 55,
    outputType: 'ml_result',
    complexity: 'O(n × |features|)',
    fitness: 'N/A (supervised classification, not process replay)',
    precision: 'N/A',
    generalization: 'High (cross-validated)',
    simplicity: 'Medium',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Predicting case outcomes (on-time/delayed, compliant/non-compliant) from labeled historical data.',
    alternatives:
      'Use ml_regress for continuous outcomes; conformance checking when a normative model is available.',
    strengths: [
      'Supervised learning produces directly actionable outcome predictions',
      'Works with any categorical label derived from case attributes',
      'Cross-validation provides reliable accuracy and F1 estimates',
    ],
    weaknesses: [
      'Requires labeled training data — manual labeling effort may be significant',
      'Cannot explain why a case receives a label (black-box for k-NN)',
      'Sensitive to class imbalance in training set',
    ],
    use_cases: [
      'Predicting whether a case will meet its SLA deadline',
      'Classifying customer cases by satisfaction outcome',
      'Identifying non-compliant traces based on historical audit results',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_forecast: {
    speedScore: 30,
    qualityScore: 55,
    outputType: 'ml_result',
    complexity: 'O(n × p)',
    fitness: 'N/A (time-series regression, not process replay)',
    precision: 'N/A',
    generalization: 'Medium (extrapolation degrades outside training range)',
    simplicity: 'High (linear model is interpretable)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Capacity planning, SLA monitoring, throughput trend analysis — any KPI forecast from the event log.',
    alternatives:
      'Use predict remaining-time for individual case prediction; ml_regress for case-level continuous outcomes.',
    strengths: [
      'Produces interpretable trend forecasts with confidence intervals',
      'Works on aggregate KPIs without per-case labels',
      'Fast to fit and re-fit as new data arrives',
    ],
    weaknesses: [
      'Extrapolation outside training range is unreliable',
      'Assumes stationarity — concept drift will degrade accuracy',
      'Time bucketing granularity (hourly/daily) requires domain knowledge',
    ],
    use_cases: [
      'Monthly capacity planning from historical event log throughput',
      'Forecasting SLA breach risk based on recent event rate trends',
      'Detecting throughput decline before it becomes critical',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_regress: {
    speedScore: 30,
    qualityScore: 55,
    outputType: 'ml_result',
    complexity: 'O(n × p²)',
    fitness: 'N/A (regression, not process replay)',
    precision: 'N/A',
    generalization: 'Medium',
    simplicity: 'High (linear coefficients are interpretable)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Remaining-time prediction, cost estimation, any continuous outcome prediction from trace features.',
    alternatives:
      'Use ml_classify for categorical outcomes; predict remaining-time for Weibull-based estimation.',
    strengths: [
      'Coefficients directly show which activities most influence the outcome',
      'Fast to fit and interpret — OLS has a closed-form solution',
      'R² and MAE provide clear quality signals',
    ],
    weaknesses: [
      'Assumes linear relationship between features and outcome',
      'Sensitive to outliers — ridge regularization can help',
      'Does not capture non-linear or interaction effects',
    ],
    use_cases: [
      'Remaining cycle-time prediction from prefix activity counts',
      'Cost estimation from process feature vectors',
      'Identifying the activities most correlated with long or expensive cases',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  ml_pca: {
    speedScore: 25,
    qualityScore: 50,
    outputType: 'ml_result',
    complexity: 'O(n × p²)',
    fitness: 'N/A (dimensionality reduction, not process replay)',
    precision: 'N/A',
    generalization: 'High (captures dominant variance directions)',
    simplicity: 'Very High (reduces many features to a few components)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Visualizing process behavior in 2D/3D; preprocessing before ml_cluster; identifying dominant variance sources.',
    alternatives:
      'Use ml_cluster directly if clustering is the goal; use ml_anomaly for outlier detection without dimensionality reduction.',
    strengths: [
      'Reduces noise and collinearity — improves downstream model quality',
      'Variance-explained per component gives clear interpretability',
      'Works on any high-dimensional feature matrix without labels',
    ],
    weaknesses: [
      'Principal components are linear combinations — hard to interpret as activities',
      'Loses information when variance-explained is below 80%',
      'Does not preserve local neighborhood structure (use UMAP/t-SNE for that)',
    ],
    use_cases: [
      'Visualizing trace clusters in 2D scatter plot before ml_cluster',
      'Preprocessing step when feature matrix has many correlated activity counts',
      'Identifying which activity dimensions drive process variability',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  simd_dfg: {
    speedScore: 1,
    qualityScore: 30,
    outputType: 'dfg',
    complexity: 'O(|E| / w) where w = SIMD width',
    fitness: 'High (100% on training log by construction)',
    precision: 'Low (same as standard DFG)',
    generalization: 'Low (same as standard DFG)',
    simplicity: 'High',
    deploymentProfiles: ['stream', 'balanced', 'quality'],
    whenToUse: 'Real-time dashboards, IoT/edge deployments, logs >1M events, streaming scenarios.',
    alternatives: 'Use dfg for maximum compatibility; process_skeleton for a more compact model.',
    strengths: [
      'Fastest algorithm in the registry — SIMD vectorisation processes 4–8 events per CPU cycle',
      'Streaming: works on continuous event feeds without loading the full log',
      'Identical output to standard DFG — same interpretation, same downstream tooling',
    ],
    weaknesses: [
      'Inherits all DFG limitations: no parallelism, loops, or formal soundness',
      'Available only in fog and browser WASM profiles (not mobile/iot/edge by default)',
      'SIMD fallback to scalar mode if CPU lacks AVX2/SSE4',
    ],
    use_cases: [
      'Real-time process dashboards requiring sub-millisecond latency',
      'Streaming event log analysis with wpm watch',
      'Edge deployments where fast DFG snapshots are needed continuously',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
  optimized_dfg: {
    speedScore: 70,
    qualityScore: 85,
    outputType: 'dfg',
    complexity: 'NP-Hard',
    fitness: 'High',
    precision: 'High (optimisation removes noise edges)',
    generalization: 'Medium',
    simplicity: 'Medium (fewer edges than standard DFG)',
    deploymentProfiles: ['quality'],
    whenToUse: 'When you want DFG-family speed with significantly better precision; pre-conformance-checking cleaning.',
    alternatives: 'Use dfg for full fidelity; ilp for provably optimal Petri net.',
    strengths: [
      'Highest quality DFG variant — 85/100 quality score vs 30/100 for standard DFG',
      'Removes noise edges via probability-normalised scoring',
      'Cleaner output than standard DFG — better for presentation and conformance',
    ],
    weaknesses: [
      'NP-hard optimisation pass — significantly slower than standard DFG',
      'Does not scale to large logs (>100k events)',
      'May remove legitimate rare paths when optimising for precision',
    ],
    use_cases: [
      'Pre-processing before conformance checking to get a cleaner reference model',
      'Process presentation when the standard DFG is too noisy',
      'Benchmarking: compare optimised DFG quality vs ILP Petri net',
    ],
    parameters: [
      {
        name: 'activity_key',
        type: 'string',
        description: 'Event attribute used as the activity label',
        required: false,
        default: 'concept:name',
      },
    ],
  },
};

/**
 * Generates algorithm explanation at specified level
 */
function getAlgorithmExplanation(
  algorithm: string,
  level: 'brief' | 'detailed' | 'academic'
): string {
  const explanations: Record<string, Record<string, string>> = {
    dfg: {
      brief: `**Directly-Follows Graph (DFG)** - Simplest algorithm. Maps which activities directly follow each other in the event log.`,
      detailed: `## Directly-Follows Graph (DFG)

**Overview**: The DFG is the simplest and fastest process discovery algorithm. It creates a directed graph where nodes represent activities and edges represent direct succession relationships.

**How it works**:
1. Scans the event log chronologically
2. For each trace, records which activities directly follow each other
3. Creates weighted edges where edge weight = frequency of succession
4. Outputs a directed graph

**Output — how to read the result**:
- Each node is an activity (e.g., "Register Order", "Ship Item")
- Each directed edge A → B means A was directly followed by B at least once
- Edge weight = how many times that succession occurred
- High-weight edges are the main process flow; low-weight edges are exceptions

**When to use**:
- You have a large event log (>10 000 traces) and need a fast first look
- You want to compare two logs structurally (use with \`wpm diff\`)
- You need a process overview in under a second
- Avoid when: you need to model parallel activities, loops, or formal verification

**Characteristics**:
- **Speed**: Very fast (linear time complexity)
- **Memory**: Minimal memory usage
- **Accuracy**: Best for simple processes, poor for complex control flows
- **Advantages**: Fast, interpretable, handles large logs
- **Disadvantages**: Cannot discover implicit dependencies, loops, or concurrent activities`,
      academic: `## Directly-Follows Graph Discovery Algorithm

**Definition**: Let E be an event log with traces T. The DFG is constructed as follows:

Let S = {(a, b) | ∃t ∈ T, a directly precedes b in t}

The graph G = (V, E) where:
- V = {a | a is an activity in E}
- E = {(a, b) | (a, b) ∈ S}
- weight(a, b) = |{t ∈ T | (a, b) occurs in t}|

**Theoretical Properties**:
- Time complexity: O(|E|) where |E| is event count
- Space complexity: O(|V| + |E|) where |V| = activity count
- Completeness: Discovers only explicit direct relationships
- Fitness: 100% on training log by construction

**References**: van der Aalst (2011), Process Mining: Discovery, Conformance and Enhancement`,
    },
    alpha: {
      brief: `**Alpha Algorithm** - Classic algorithm that discovers concurrent activities. Builds Petri nets from direct-follows relationships.`,
      detailed: `## Alpha Algorithm

**Overview**: The Alpha algorithm builds on DFG by discovering concurrent activities and constructing a Petri net model. It uses ordering relations between activities to infer implicit control flow.

**How it works**:
1. Extracts direct-follows, causality, and parallel relations from log
2. Defines causality: a → b if a directly precedes b but b does not precede a
3. Defines parallel: a || b if a → b AND b → a
4. Discovers input/output places and transitions
5. Constructs Petri net

**Characteristics**:
- **Accuracy**: Better than DFG for concurrent processes
- **Limitations**: Cannot discover long-term loops, duplicate tasks
- **Best for**: Processes with parallelism, moderate complexity

**Variants**: Alpha+ (fixes long-term dependencies), Alpha# (handles invisible tasks)`,
      academic: `## Alpha Algorithm: Petri Net Discovery

**Ordering relations**:
- Direct succession: a >b iff (∃t ∈ T) [a directly precedes b in t]
- Causality: a → b iff (a > b) ∧ ¬(b > a)
- Parallel: a || b iff (a > b) ∧ (b > a)
- Choice: a # b iff ¬(a > b) ∧ ¬(b > a)

**Petri net construction**:
Places are defined as tuples (A, B) where A ⊆ activities, B ⊆ activities
Transitions correspond to activities

**Time complexity**: O(n² × |E|) where n = activity count

**Fitness guarantee**: Discovers model fitting 100% on acyclic traces`,
    },
    heuristic: {
      brief: `**Heuristic Miner** - Focuses on frequently occurring patterns. More robust to noise than Alpha.`,
      detailed: `## Heuristic Miner

**Overview**: Discovers process models by mining frequently occurring patterns. More robust to noise and imperfect logs than Alpha algorithm.

**Key features**:
- Threshold-based filtering of infrequent relations
- Metrics for edge strength (dependency measure)
- Handles noise and outliers gracefully
- Produces causal nets or Petri nets

**Algorithm**:
1. Calculate direct-follows relations with frequencies
2. Calculate dependency metrics between activities
3. Filter using significance threshold
4. Construct causal net
5. Optionally convert to Petri net

**Output — how to read the result**:
- A causal net: nodes are activities, arcs have dependency scores in [0,1]
- Arcs close to 1.0 are strong causal dependencies (keep these)
- Arcs close to 0 are weak/coincidental (filtered out by threshold)
- Start and end activities are marked explicitly

**Parameters — what to set**:
- \`dependency_threshold\` (0.0–1.0, default 0.5): higher = stricter, fewer edges
  - Try 0.2–0.4 for noisy real-world logs; 0.6–0.8 for clean lab logs
  - If the model looks too sparse (missing paths), lower the threshold
  - If the model looks like a spaghetti mess, raise the threshold

**When to use**:
- Your log contains noise, recording errors, or exceptional cases
- You want a quick model without spending time on parameter tuning
- Your log has 1 000–100 000 events
- Avoid when: you need formal soundness guarantees (use Inductive Miner instead)

**Advantages**:
- Robust to noise and errors
- Discovers main process flow without outliers
- Configurable sensitivity via threshold`,
      academic: `## Heuristic Miner: Dependency Measure

**Dependency metric**:
dep(a,b) = (|a>b| - |b>a|) / (|a>b| + |b>a| + 1)

where |a>b| = count of a directly followed by b

**Significance threshold**: θ ∈ [0, 1]
Include edge (a, b) if dep(a,b) > θ

**Length-two-loops**: Special handling for a → b → a patterns

**Completeness**: Discovers main causal structure, filtering weak dependencies`,
    },
    genetic: {
      brief: `**Genetic Algorithm** - Population-based search optimizing model quality. Best quality models but slower.`,
      detailed: `## Genetic Algorithm for Process Mining

**Overview**: Uses evolutionary computation to evolve process models that maximize fitness and minimize complexity. Produces high-quality models but computationally expensive.

**Algorithm**:
1. Initialize random population of candidate models
2. Evaluate each model: fitness(log, model) + penalty(complexity)
3. Select best performers
4. Apply genetic operations: crossover, mutation
5. Repeat until convergence

**Output — how to read the result**:
- A Petri net: places (circles), transitions (rectangles), and directed arcs
- A token fired at the start place flows through transitions matching events
- Places between transitions represent intermediate states
- Final fitness score tells you what fraction of the log the model can replay

**Parameters — what to set**:
- \`population_size\` (default 20): number of candidate models per generation
  - Start with 20; increase to 50–100 for better quality at the cost of time
  - Larger populations explore more of the model space
- \`iterations\` / generations (default 10–20): how long to evolve
  - Use 20–50 for production; 5–10 for quick exploration
  - Watch for fitness plateau — more iterations won't help past that point

**Fitness evaluation**:
- Traces replayed through model
- Count: correctly executed, partially executed, failed traces
- Fitness = (correct + 0.5×partial) / total

**When to use**:
- You need the highest quality Petri net and have time (minutes, not seconds)
- Your log has fewer than 5 000 events (otherwise runtime becomes impractical)
- You want to benchmark other algorithms — genetic is often the quality ceiling
- Avoid when: you need results in under 10 seconds (use DFG or Heuristic instead)

**Optimization**:
- Minimize tokens needed to replay log
- Minimize model size (arc/node count)
- Maximize replay success rate`,
      academic: `## Genetic Algorithm Process Mining

**Population**:
P(t) = {M₁, M₂, ..., Mₙ} where M = (P, T, F, m₀)

**Fitness function**:
f(M) = fitness(log, M) - penalty × |P ∪ T|

**Selection**: Tournament selection with crossover rate pc, mutation rate pm

**Termination**: Convergence after G generations or improvement plateau

**Computational complexity**: O(G × P × |log| × |model|)`,
    },
    inductive: {
      brief: `**Inductive Miner** - Guaranteed sound block-structured process trees. Recursive partitioning based on cut detection.`,
      detailed: `## Inductive Miner

**Overview**: The Inductive Miner discovers block-structured process trees by recursively partitioning the event log. It guarantees soundness (no deadlocks, no livelocks) by construction.

**How it works**:
1. Detect the base case (single activity log)
2. Try to find a cut in the activity ordering (sequential, parallel, exclusive, loop)
3. Partition traces according to the cut
4. Recursively apply to each partition
5. Build a process tree from the cuts

**Output — how to read the result**:
- A process tree: a hierarchy of operators and leaf activities
- Operators: → (sequence), × (exclusive choice), ∧ (parallel), ↻ (loop)
- Example: → ( A, × ( B, C ), D ) means "do A, then choose B or C, then do D"
- No deadlocks or livelocks possible — the tree structure guarantees this
- Can be converted to a Petri net for token replay conformance checking

**Cut types**:
- **Sequential cut**: Activities in traces follow a fixed order
- **Parallel cut**: Activities occur in any order (concurrent)
- **Exclusive cut**: Traces contain different subsets of activities (choice)
- **Loop cut**: A block of activities repeats

**When to use**:
- You need formal soundness guarantees (no deadlocks) — Inductive Miner is the only algorithm that guarantees this by construction
- You will run conformance checking after discovery
- Your log comes from a well-structured process (ERP, BPM, workflow engine)
- Avoid when: your log is very noisy — Inductive Miner may add "skip" or "redo" arcs to force soundness, reducing precision

**Characteristics**:
- **Speed**: Linear time complexity O(n)
- **Soundness**: Guaranteed — model is always sound
- **Quality**: Excellent on well-structured logs
- **Limitations**: May over-split on noisy logs (non-local choices)`,
      academic: `## Inductive Miner: Process Tree Discovery

**Definition**: Let L be an event log. The Inductive Miner recursively applies:
IM(L) = base case OR detect cut → partition → recurse → compose

**Cut detection**:
- Sequential: ∃π such that ∀t∈L: π(t) = a₁ → a₂ → ... → aₙ
- Exclusive: ∃π such that ∀t∈L: π(t) ∈ {a₁, a₂, ..., aₙ}
- Parallel: ∃π such that ∀t∈L: π(t) is a multiset of {a₁, ..., aₙ}
- Loop: t = <body>* → [redo]*

**Process tree**: T = leaf(a) | →(T₁, ..., Tₙ) | ×(T₁, ..., Tₙ) | ○(T₁, T₂)

**Theoretical Properties**:
- Time complexity: O(|L| × |A|) where |A| = activity count
- Soundness: Guaranteed by construction
- Completeness: Can represent any block-structured process

**References**: Leemans et al. (2013), "Discovering Block-Structured Process Models from Event Logs"`,
    },
    astar: {
      brief: `**A* Search** - Heuristic search using best-first exploration with cost estimation. Finds optimal or near-optimal process models.`,
      detailed: `## A* Search Process Mining

**Overview**: Uses the A* graph search algorithm to explore the space of possible process models, guided by a cost heuristic. Finds models that balance fitness and complexity.

**How it works**:
1. Start from an initial process model state
2. Evaluate the cost function f(n) = g(n) + h(n) where:
   - g(n) = cost from start to current node (fitness so far)
   - h(n) = estimated cost to goal (admissible heuristic)
3. Expand the lowest-cost node
4. Generate successor models (add/remove transitions)
5. Continue until goal state or iteration limit

**Characteristics**:
- **Speed**: Moderate (depends on heuristic quality and search space)
- **Memory**: Higher than greedy (maintains open/closed sets)
- **Quality**: Can find optimal solutions with admissible heuristic
- **Advantages**: Optimal with good heuristic, memory-bounded variants exist

**Best for**: Model search when quality is important and time budget allows`,
      academic: `## A* Search for Process Model Discovery

**Search space**: G = (S, E) where S = set of model states, E = state transitions

**Cost function**: f(n) = g(n) + h(n)
- g(n) = Σ replay costs on log traces
- h(n) = estimated remaining cost (must be admissible: h(n) ≤ h*(n))

**Expansion**: Successors generated by:
1. Adding a transition (a, b)
2. Removing a transition (a, b)
3. Splitting/merging places

**Memory**: O(|open| + |closed|) — can be bounded by beam width

**Optimality**: A* finds optimal solution when heuristic is admissible

**Complexity**: Worst-case O(b^d) where b = branching factor, d = solution depth`,
    },
    aco: {
      brief: `**Ant Colony Optimization (ACO)** - Swarm intelligence algorithm inspired by ant foraging. Pheromone trails discover complex process structures.`,
      detailed: `## Ant Colony Optimization

**Overview**: Simulates ant colony foraging behavior to discover process models. Ants traverse the activity space, depositing pheromones on promising transitions. Over iterations, pheromone concentration converges on the optimal model.

**Algorithm**:
1. Initialize pheromone matrix for all activity pairs
2. For each iteration:
   a. Release ants to construct candidate solutions
   b. Each ant builds a model by following pheromone + heuristic
   c. Evaluate model fitness against the event log
   d. Update pheromone trails (evaporation + deposit)
3. Return best model found

**Parameters**:
- Ants: number of ants per iteration (default: 20)
- Iterations: number of generations (default: 10)
- Evaporation rate (ρ): pheromone decay factor
- α, β: relative importance of pheromone vs heuristic

**Best for**: Complex process structures, noisy logs, discovering hidden patterns`,
      academic: `## Ant Colony Optimization for Process Mining

**Pheromone update**:
τ(a,b) ← (1-ρ) · τ(a,b) + Σ Δτᵢ(a,b)

where ρ ∈ [0,1] is evaporation rate, Δτᵢ is deposit from ant i

**Transition probability**:
P(a→b) = [τ(a,b)]^α · [η(a,b)]^β / Σ_c [τ(a,c)]^α · [η(a,c)]^β

where η(a,b) is heuristic desirability (e.g., frequency)

**Complexity**: O(I × K × |E|) where I = iterations, K = ants, |E| = event count

**Convergence**: Guaranteed under sufficient iterations with positive evaporation`,
    },
    hill: {
      brief: `**Hill Climbing** - Local optimization starting from a heuristic seed model. Iteratively improves fitness by making small changes.`,
      detailed: `## Hill Climbing Process Mining

**Overview**: Starts with an initial process model (usually from a fast algorithm like DFG or Heuristic Miner) and iteratively improves it by making small local modifications that increase fitness.

**Algorithm**:
1. Generate initial model (seed) using fast algorithm
2. Evaluate fitness against the event log
3. Generate neighbors by:
   - Adding a transition
   - Removing a transition
   - Changing a place
4. Select best neighbor
5. If fitness improved, accept and repeat
6. If no improvement, stop (local optimum found)

**Characteristics**:
- **Speed**: Fast (linear per iteration, few iterations)
- **Memory**: Low (stores only current + neighbor states)
- **Quality**: Good for refinement, but may get stuck in local optima
- **Advantages**: Simple, fast, effective as a post-processing step

**Best for**: Refining models from fast algorithms, noise filtering, quick optimization`,
      academic: `## Hill Climbing: Local Search Optimization

**Neighbor generation**: N(s) = {s' : s' differs from s by one transition add/remove}

**Fitness evaluation**:
f(s) = fitness(log, s) = (correct + 0.5·partial) / total

**Acceptance criterion**:
s' accepted if f(s') > f(s) (steepest ascent)

**Termination**: No neighbor improves fitness (local optimum)

**Complexity**: O(K × |E| × |model|) where K = iterations until convergence

**Limitation**: Cannot escape local optima (unlike simulated annealing)`,
    },
    annealing: {
      brief: `**Simulated Annealing** - Temperature-based optimization that can escape local optima. Gradually reduces acceptance probability for worse solutions.`,
      detailed: `## Simulated Annealing Process Mining

**Overview**: Inspired by the annealing process in metallurgy. Starts at a high "temperature" where worse solutions are accepted with high probability, then gradually cools down, converging on a high-quality model.

**Algorithm**:
1. Initialize model (from DFG or random)
2. Set initial temperature T = T₀
3. While T > T_min:
   a. Generate random neighbor model
   b. Compute ΔE = f(neighbor) - f(current)
   c. If ΔE > 0: accept (improvement)
   d. If ΔE ≤ 0: accept with probability e^(ΔE/T)
   e. Cool: T ← α × T
4. Return best model found

**Parameters**:
- Initial temperature (T₀): controls initial exploration (default: 1.0)
- Cooling rate (α): how fast temperature decreases (default: 0.95)
- Minimum temperature: stopping criterion

**Best for**: Avoiding local optima, balancing exploration and exploitation`,
      academic: `## Simulated Annealing Process Mining

**Acceptance probability**:
P(accept) = 1                              if ΔE ≥ 0
P(accept) = exp(ΔE / T)                    if ΔE < 0

**Cooling schedule**:
T(t) = α · T(t-1)  (geometric cooling)

**Boltzmann criterion**: At high T, nearly all moves accepted → exploration
At low T, only improvements accepted → exploitation

**Complexity**: O(S × |model|) where S = number of steps = O(log(T₀/T_min)/log(1/α))

**Optimality**: Converges to global optimum if cooling is slow enough (theoretical guarantee)`,
    },
    pso: {
      brief: `**Particle Swarm Optimization (PSO)** - Swarm-based optimization where particles explore the model space, guided by personal and global best positions.`,
      detailed: `## Particle Swarm Optimization

**Overview**: Maintains a population of "particles" that fly through the model space. Each particle remembers its best position and is influenced by the swarm's global best. Combines local search with global information sharing.

**Algorithm**:
1. Initialize swarm of particles with random models
2. Evaluate fitness of each particle
3. Update personal best (pBest) and global best (gBest)
4. For each particle:
   a. Compute velocity: v = w·v + c₁·r₁·(pBest - x) + c₂·r₂·(gBest - x)
   b. Update position: x = x + v
   c. Clip to valid model space
5. Repeat until convergence or iteration limit

**Parameters**:
- Swarm size: number of particles (default: 30)
- Iterations: number of generations (default: 20)
- w: inertia weight (momentum)
- c₁, c₂: cognitive and social coefficients

**Best for**: Continuous optimization problems, fast convergence, parallelizable`,
      academic: `## PSO Process Mining

**Velocity update**:
vᵢ(t+1) = w·vᵢ(t) + c₁·r₁·(pBestᵢ - xᵢ(t)) + c₂·r₂·(gBest - xᵢ(t))

**Position update**:
xᵢ(t+1) = xᵢ(t) + vᵢ(t+1)

**Parameters**:
- w: inertia weight (typically 0.4-0.9)
- c₁: cognitive coefficient (typically 1.5-2.0)
- c₂: social coefficient (typically 1.5-2.0)
- r₁, r₂: random ∈ [0,1]

**Complexity**: O(G × P × |E|) where G = generations, P = swarm size

**Convergence**: Generally faster than genetic algorithms for smooth fitness landscapes`,
    },
    skeleton: {
      brief: `**Process Skeleton** - Fast structural abstraction that extracts the minimal process structure. Filters noise and focuses on core workflow.`,
      detailed: `## Process Skeleton

**Overview**: Extracts the minimal, essential structure of a process by filtering low-frequency edges and isolating the core workflow skeleton. Balances completeness with simplicity.

**How it works**:
1. Build a directly-follows graph from the event log
2. Apply frequency-based filtering (remove edges below threshold)
3. Identify start and end activities
4. Extract the connected core structure
5. Output a simplified process model

**Characteristics**:
- **Speed**: Very fast (near-linear time)
- **Memory**: Minimal (operates on compressed graph)
- **Quality**: Good overview, may lose rare but important paths
- **Advantages**: Fastest structural algorithm, handles noise well

**Best for**: Quick process overview, noise filtering, initial exploration, real-time analysis`,
      academic: `## Process Skeleton Extraction

**Formal definition**:
Given DFG G = (A, →, freq), skeleton S is constructed by:
1. Remove edges where freq(e) < θ (threshold)
2. Compute weakly connected components
3. Extract the largest connected component
4. Verify start/end node constraints

**Filtering criterion**:
e ∈ S iff freq(e) ≥ θ · max(freq)

**Complexity**: O(|E| + |V|·log|V|) — dominated by sorting/traversal

**Theoretical property**: Skeleton is a subgraph of DFG containing the most frequent process behavior`,
    },
    declare: {
      brief: `**DECLARE** - Constraint-based process model. Discovers temporal and logical constraints (response, precedence, etc.) from the event log.`,
      detailed: `## DECLARE Constraint Discovery

**Overview**: Discovers a declarative process model consisting of temporal and logical constraints between activities. Unlike procedural models (Petri nets, process trees), DECLARE describes what behavior is allowed rather than what must happen.

**Constraint types discovered**:
- **Response**: If A occurs, B must eventually follow
- **Precedence**: B can only occur if A occurred before
- **Succession**: A must be directly followed by B
- **Co-existence**: A and B either both occur or neither does
- **Chain response**: A must be directly followed by B
- **Choice**: Between A and B, at most one can occur

**How it works**:
1. Compute support and confidence for each constraint template
2. Filter by minimum support/confidence thresholds
3. Output the constraint set as the model

**Characteristics**:
- **Speed**: Fast for constraint counting, moderate for all templates
- **Flexibility**: Very high — handles flexible processes well
- **Interpretability**: Business-friendly constraint names

**Best for**: Compliance checking, flexible processes, regulatory monitoring`,
      academic: `## DECLARE Constraint Discovery

**Constraint support**:
sup(C) = |{t ∈ L : t satisfies C}| / |L|

**Constraint confidence**:
conf(A →▷ B) = |{t : A∈t ∧ B after A}| / |{t : A∈t}|

**Discovery algorithm**:
For each template T and activity pair (a, b):
1. Compute support sup(T(a,b)) over log L
2. Compute confidence conf(T(a,b))
3. If sup ≥ θ_sup AND conf ≥ θ_conf → include constraint

**Complexity**: O(|templates| × |A|² × |E|)

**References**: van der Aalst et al. (2009), "Supporting Interoperability through DECLARE"`,
    },
    ml_cluster: {
      brief: `**ML Clustering (ml_cluster)** — Unsupervised grouping of traces by behavioral similarity. Discovers natural process variants without a prior model.`,
      detailed: `## ML Clustering (ml_cluster)

**Overview**: Groups event traces into clusters based on behavioral similarity features extracted from the event log. Reveals hidden process variants and behavioral segments without requiring a reference model.

**How it works**:
1. Extract feature vectors from each case: activity frequencies, transition counts, timing statistics
2. Normalise features to [0, 1] range for distance calculation
3. Apply k-means or similar clustering algorithm
4. Assign each case to its nearest cluster centroid
5. Report cluster assignments and silhouette score

**Output — how to read the result**:
- Cluster assignments: each case ID → cluster index
- Silhouette score [−1, 1]: higher = tighter, better-separated clusters
- Centroid features: the "average trace" for each cluster
- Cases near centroid boundaries are ambiguous variants

**Parameters — what to set**:
- \`activity_key\` (default: concept:name): event attribute used as activity label

**When to use**:
- Discovering behavioral segments in a heterogeneous log
- Identifying process variants before per-variant conformance checking
- Segmenting customers by process behavior in CRM or e-commerce logs
- Avoid when: you have a normative model — use conformance checking instead

**Advantages**:
- No prior model required — discovers structure from data alone
- Silhouette score gives an objective quality measure
- Can reveal hidden sub-processes and exception clusters`,
      academic: `## ML Clustering: Trace Behavioral Segmentation

**Feature space**: f(t) = [freq(a₁), freq(a₂), ..., freq(aₙ), dur(t), rework(t)]

**Silhouette coefficient**:
s(i) = (b(i) − a(i)) / max(a(i), b(i))
where a(i) = mean intra-cluster distance, b(i) = mean nearest-cluster distance

**K-means objective**: Minimize Σᵢ Σₓ∈Cᵢ ||x − μᵢ||²

**Complexity**: O(n²) per iteration where n = number of cases

**References**: Van der Aalst et al., "Process Mining Manifesto" (2012); Leemans et al., trace clustering section`,
    },
    ml_anomaly: {
      brief: `**ML Anomaly Detection (ml_anomaly)** — Scores each case by how much it deviates from the typical process behavior. No reference model required.`,
      detailed: `## ML Anomaly Detection (ml_anomaly)

**Overview**: Computes an anomaly score for each case based on how much it differs from the statistical baseline of the event log. Useful for fraud detection, quality control, and early warning on deviating cases.

**How it works**:
1. Extract behavioral features from each case
2. Estimate the normal distribution using EMA (Exponential Moving Average) smoothing
3. Compute information-theoretic or distance-based anomaly score per case
4. Return sorted list: highest scores are the most anomalous cases

**Output — how to read the result**:
- Per-case anomaly score [0, ∞): higher = more anomalous
- Threshold is domain-specific: start with the top 5–10% of scores
- Cases with score > 2× median are typically worth investigating
- Use with \`wpm predict outcome\` for combined risk signals

**When to use**:
- Fraud detection in financial process logs
- Quality control: flagging production cases that deviate from typical behavior
- No normative model available — use anomaly detection instead of conformance
- Avoid when: a reference model exists (conformance checking is more precise)

**Advantages**:
- No prior model required — purely data-driven
- Returns per-case scores for risk prioritization
- EMA smoothing reduces sensitivity to noise`,
      academic: `## ML Anomaly Detection: Information-Theoretic Scoring

**Feature extraction**: f(t) = [freq(a), transition(a→b), timing stats]

**EMA smoothing**: μ̂ₜ = α·xₜ + (1−α)·μ̂ₜ₋₁

**Anomaly score**:
s(t) = KL(P(t) || P̂_baseline) or Mahalanobis distance

**Threshold**: Set at (μ + k·σ) for k ∈ {2, 3} under Gaussian assumption

**Complexity**: O(n × |features|)

**References**: Van der Aalst, "Data Science in Action" (2016), anomaly detection section`,
    },
    ml_classify: {
      brief: `**ML Classification (ml_classify)** — Predicts a categorical outcome label for each trace using supervised learning on log features.`,
      detailed: `## ML Classification (ml_classify)

**Overview**: Trains a classifier on labeled event log traces to predict outcomes (e.g., "compliant" vs "non-compliant", "on-time" vs "delayed"). Requires a labeled training set.

**How it works**:
1. Extract feature vectors from labeled traces
2. Train a classifier (k-NN, decision tree, or naive Bayes) on the labeled set
3. Evaluate with cross-validation (accuracy, F1 score)
4. Predict labels for unlabeled traces

**When to use**:
- Predicting case outcomes when labeled historical data is available
- Building a process monitoring model from past cases
- Classifying trace variants into named behavioral categories

**Output**: Class assignments per case, accuracy/F1 score on validation set`,
      academic: `## ML Classification: Supervised Trace Labeling

**Feature space**: f(t) = activity frequency vectors + temporal statistics

**Accuracy**: acc = |{t : ŷ(t) = y(t)}| / |T|

**F1 score**: F1 = 2 · (precision · recall) / (precision + recall)

**Complexity**: O(n × |features|) per prediction for k-NN; O(depth × |features|) for decision tree`,
    },
    ml_forecast: {
      brief: `**ML Forecasting (ml_forecast)** — Time-series regression on process KPIs (throughput, event rate) to predict future values.`,
      detailed: `## ML Forecasting (ml_forecast)

**Overview**: Fits a time-series regression model to process KPI data derived from the event log. Forecasts future throughput, event rates, or activity frequencies over a user-specified horizon.

**How it works**:
1. Aggregate events into time-bucketed KPI series (hourly, daily, weekly)
2. Fit regression model: linear, polynomial, or exponential
3. Extrapolate the fitted curve to the forecast horizon
4. Report forecast values with confidence intervals

**When to use**:
- Capacity planning: forecast expected case load next month
- SLA monitoring: predict throughput to detect upcoming SLA breaches
- Trend analysis: identify whether process throughput is growing or declining

**Output**: Forecasted values per time bucket, MAE/RMSE on training period`,
      academic: `## ML Forecasting: Time-Series Process KPI Prediction

**Model**: ŷₜ = f(t; θ) for linear/polynomial/exponential family

**Loss**: MAE = (1/n) Σ|yₜ − ŷₜ|, RMSE = √((1/n) Σ(yₜ − ŷₜ)²)

**MAPE**: (1/n) Σ|yₜ − ŷₜ|/|yₜ| × 100%

**Complexity**: O(n × p) for polynomial degree p regression`,
    },
    ml_regress: {
      brief: `**ML Regression (ml_regress)** — Predicts a continuous outcome (e.g., remaining time, cost) from trace features using linear regression.`,
      detailed: `## ML Regression (ml_regress)

**Overview**: Predicts a continuous outcome variable for each case using linear regression on behavioral features extracted from the event log. Commonly used for remaining-time prediction and cost estimation.

**How it works**:
1. Extract feature vectors from cases (prefix activity counts, elapsed time, etc.)
2. Fit a linear (or ridge) regression model on labeled training cases
3. Report coefficients — which features most strongly predict the outcome
4. Predict outcome for new cases

**When to use**:
- Remaining-time prediction on running cases
- Cost estimation from process features
- Identifying which activities most influence cycle time

**Output**: Predicted continuous values, R², MAE per case`,
      academic: `## ML Regression: Continuous Outcome Prediction from Trace Features

**Model**: ŷ = β₀ + β₁x₁ + ... + βₚxₚ

**OLS objective**: Minimize ||y − Xβ||²

**R²**: 1 − Σ(yᵢ − ŷᵢ)² / Σ(yᵢ − ȳ)²

**Complexity**: O(n × p²) for OLS; O(n × p) for stochastic gradient descent`,
    },
    ml_pca: {
      brief: `**ML PCA (ml_pca)** — Dimensionality reduction via Principal Component Analysis. Projects high-dimensional trace feature vectors to a low-dimensional space for visualization and analysis.`,
      detailed: `## ML PCA (ml_pca)

**Overview**: Applies Principal Component Analysis to the trace feature matrix to reduce dimensionality. Useful for visualizing process behavior, identifying dominant variance sources, and preprocessing before clustering or classification.

**How it works**:
1. Extract high-dimensional feature vectors from all cases
2. Center and scale features
3. Compute the covariance matrix and its eigenvectors
4. Project features onto the top k principal components
5. Report variance explained per component

**When to use**:
- Visualizing process behavior in 2D/3D (plot first two components)
- Identifying which features capture the most process variability
- Preprocessing before ml_cluster to reduce high-dimensional noise

**Output**: Reduced-dimension feature vectors, variance explained per component, loadings matrix`,
      academic: `## PCA: Trace Feature Dimensionality Reduction

**Covariance matrix**: C = (1/n) X^T X (after centering)

**Eigen decomposition**: C = Q Λ Q^T

**Projection**: Z = X Q_k (first k eigenvectors)

**Variance explained**: VE(k) = Σᵢ₌₁ᵏ λᵢ / Σᵢ₌₁ⁿ λᵢ

**Complexity**: O(n × p²) for covariance; O(p³) for eigen decomposition`,
    },
    ilp: {
      brief: `**Integer Linear Programming (ILP)** - Finds the optimal process model by formulating discovery as a mathematical optimization problem. Highest quality but slower.`,
      detailed: `## Integer Linear Programming

**Overview**: Formulates process model discovery as an optimization problem with binary decision variables for potential edges and trace fitness. Solves exactly using ILP solvers for guaranteed optimality.

**Algorithm**:
1. Build candidate edge set from event log
2. Define binary variables xₑ for each edge inclusion
3. Define fitness variables yₜ for each trace
4. Set objective: maximize fitness minus model complexity
5. Add structural and feasibility constraints
6. Solve with ILP solver (branch-and-bound)

**Output — how to read the result**:
- A Petri net: the provably optimal balance of fitness and simplicity
- Fitness score will be the highest achievable for this log/model trade-off
- Fewer arcs than genetic algorithm (ILP optimises both simultaneously)
- Use this output as the benchmark when evaluating other algorithms

**Parameters — what to set**:
- The λ (lambda) penalty weight balances fitness vs simplicity:
  - Low λ (e.g., 0.1): prioritise fitness, allow a more complex model
  - High λ (e.g., 1.0): prioritise simplicity, accept lower fitness
  - Default λ = 0.5 is a reasonable starting point
- ILP runtime scales with log size — budget 30–120 seconds for logs >1 000 events

**When to use**:
- You need the provably optimal Petri net and have time to wait
- Your log has fewer than 5 000 events (ILP becomes impractical beyond this)
- You are benchmarking other algorithms and need a quality ceiling reference
- You require formal verification of the discovered model (Petri nets support this)
- Avoid when: you need results quickly or your log is large (use Heuristic or DFG)

**Characteristics**:
- **Quality**: Optimal — provably best fitness/precision trade-off
- **Speed**: Slowest — exponential in worst case
- **Interpretability**: Standard Petri net output`,
      academic: `## ILP Process Mining

**Decision variables**:
xₑ ∈ {0, 1} for each potential edge e
yₜ ∈ {0, 1} for each trace fitness
λ ∈ ℝ parameter balancing fitness/simplicity

**Objective**:
Maximize: Σ yₜ - λ × Σ xₑ

**Constraints**:
- Petri net structure constraints
- Trace feasibility constraints: yₜ ≤ f(t, model)
- Domain constraints: xₑ ∈ {0, 1}

**Complexity**: NP-hard, exponential in model size`,
    },
    simd_dfg: {
      brief: `**SIMD-Accelerated Streaming DFG** — Ultra-fast DFG using CPU SIMD instructions for streaming event ingestion. Lowest possible latency for real-time monitoring.`,
      detailed: `## SIMD-Accelerated Streaming DFG (simd_streaming_dfg)

**Overview**: The fastest algorithm in the registry. Uses SIMD (Single Instruction, Multiple Data) CPU vector instructions to process multiple events simultaneously, enabling sub-millisecond DFG construction even on large streaming event logs.

**How it works**:
1. Ingest events in a streaming fashion — no need to load the full log into memory
2. Apply SIMD-vectorized directly-follows counting on batches of events
3. Maintain a compact DFG representation with atomic edge weight updates
4. Produce the same DFG output as the standard \`dfg\` algorithm, but faster

**Output — how to read the result**:
- Identical to the standard DFG: directed graph of activity nodes and directly-follows edges
- Edge weights represent occurrence counts
- Use the same interpretation as \`wpm explain dfg\`

**When to use**:
- Real-time process dashboards where sub-millisecond latency is critical
- IoT and edge deployments with constrained CPU and no GPU available
- Large logs (>1M events) where even the standard DFG becomes slow
- Streaming scenarios where events arrive continuously (use with \`wpm watch\`)
- Avoid when: your CPU does not support SIMD extensions (the algorithm falls back to scalar mode)

**Characteristics**:
- **Speed**: Fastest in the registry (tier 1/80)
- **Quality**: Same as DFG (30/100) — inherits all DFG limitations
- **WASM profile**: Available in \`fog\` and \`browser\` profiles only`,
      academic: `## SIMD-Accelerated Directly-Follows Graph

**Same formal definition as DFG**:
Let E be an event log. DFG G = (V, E_dfg) where:
- V = {a | a is an activity in E}
- E_dfg = {(a, b) | ∃t ∈ T: a directly precedes b in t}
- weight(a, b) = |{events where a→b occurs}|

**SIMD optimisation**:
Vectorised edge count updates using AVX2/SSE4 instructions:
- Processes 8 (AVX2) or 4 (SSE4) event pairs per CPU cycle
- Reduces memory bandwidth by batching writes to the weight array

**Theoretical Properties**:
- Time complexity: O(|E| / w) where w = SIMD vector width (8 for AVX2)
- Space complexity: O(|V|²) — same as DFG
- Output: identical to standard DFG (correctness preserved)

**References**: van der Aalst (2011), DFG definition; SIMD intrinsics: Intel Intrinsics Guide`,
    },
    optimized_dfg: {
      brief: `**Optimised DFG** — An enhanced DFG variant with quality-optimised edge filtering. Higher precision than the standard DFG while maintaining near-linear speed.`,
      detailed: `## Optimised DFG (optimized_dfg)

**Overview**: A refined variant of the Directly-Follows Graph that applies quality-focused post-processing to improve precision and reduce noise. Produces a DFG with higher quality scores (85/100) than the standard DFG (30/100) at the cost of slightly more computation.

**How it works**:
1. Build the standard DFG from the event log
2. Apply frequency-normalised edge scoring
3. Remove edges that violate structural consistency checks
4. Re-weight surviving edges to reflect conditional probabilities
5. Output an optimised directed graph

**Output — how to read the result**:
- Same structure as the standard DFG: activity nodes and directed edges
- Edges represent only the most consistent directly-follows relationships
- Edge weights are probability-normalised (each outgoing edge set sums to 1.0)
- Fewer "noise" edges than standard DFG — cleaner for presentation

**When to use**:
- When you want DFG speed with better precision than the standard DFG
- Pre-conformance-checking step: cleaner model → more meaningful conformance results
- When the standard DFG produces too many low-weight noise edges
- Avoid when: you need full fidelity (all observed paths) — use standard dfg instead

**Quality score**: 85/100 — highest quality DFG variant in the registry
**Speed**: Moderate (tier 70/80) — NP-hard optimisation pass adds overhead`,
      academic: `## Optimised DFG: Quality-Aware Edge Selection

**Standard DFG base**: G₀ = (V, E₀, freq)

**Edge quality score**:
q(a, b) = freq(a→b) / (Σ_c freq(a→c)) — conditional probability of b after a

**Optimisation step** (NP-hard formulation):
Select E* ⊆ E₀ to maximise:
  Σ_{(a,b)∈E*} q(a,b)  subject to structural consistency constraints

**Precision gain**:
P(G*) ≥ P(G₀) by construction — removing low-probability edges reduces allowed behaviour

**Theoretical Properties**:
- Complexity: NP-hard (edge selection is a variant of the minimum weight subgraph problem)
- Output: subgraph of the standard DFG with higher precision
- Quality: 85/100 (vs 30/100 for standard DFG)`,
    },
  };

  const algoKey = algorithm.toLowerCase().replace(/[+*-]/g, '').replace(/_/g, '');

  // Match priority:
  // 1. Exact match on the normalised key (e.g. "dfg" → "dfg")
  // 2. Exact match after normalising both sides (e.g. "ml_cluster" → "mlcluster" after stripping _)
  // 3. Known alias expansions (e.g. "heuristic_miner" → "heuristic")
  // We intentionally do NOT use bidirectional substring matching (includes) because it causes
  // "simdstreamingdfg" to match "dfg".
  const ALGO_ALIASES: Record<string, string> = {
    heuristicminer: 'heuristic',
    inductiveminer: 'inductive',
    geneticalgorithm: 'genetic',
    simulatedannealing: 'annealing',
    antcolony: 'aco',
    processskeleton: 'skeleton',
    alphaplus: 'alpha',
    alphaplusplus: 'alpha',
    // Canonical kernel registry IDs → short alias used as explanation key
    hillclimbing: 'hill',
    simdstreamingdfg: 'simd_dfg',
    optimizeddfg: 'optimized_dfg',
  };
  const normalizedKeys = Object.fromEntries(
    Object.keys(explanations).map((k) => [k.replace(/_/g, ''), k])
  );
  const algo =
    normalizedKeys[algoKey] ??
    (ALGO_ALIASES[algoKey] ? explanations[ALGO_ALIASES[algoKey]] && ALGO_ALIASES[algoKey] : undefined);

  if (!algo || !explanations[algo]) {
    const INTERNAL_TO_CANONICAL: Record<string, string> = {
      simd_dfg: 'simd_streaming_dfg',
      optimized_dfg: 'optimized_dfg',
    };
    const available = Object.keys(explanations)
      .map((k) => INTERNAL_TO_CANONICAL[k] ?? k)
      .join(', ');
    return `Unknown algorithm: '${algorithm}'.\n\n` +
      `Algorithms with explanations: ${available}\n\n` +
      `Examples:\n` +
      `  wpm explain dfg          — simplest/fastest algorithm\n` +
      `  wpm explain heuristic    — balanced, noise-robust\n` +
      `  wpm explain ilp          — highest quality\n` +
      `  wpm explain              — show full algorithm menu`;
  }

  return explanations[algo][level] || explanations[algo].detailed;
}

/**
 * Returns a curated comparison table for zero-arg `wpm explain` invocations.
 * The goal is to answer the first question a practitioner has:
 * "Which algorithm should I use for my situation?"
 */
function getAlgorithmMenu(): string {
  return `
wpm explain — Process Mining Algorithm Guide
============================================

When to use which algorithm (Van der Aalst quality dimensions):

  SITUATION                          RECOMMENDED ALGORITHM     WHY
  ─────────────────────────────────────────────────────────────────────────────
  First look at a new log            dfg                       Linear time, instant overview
  Noisy log (many variants)          heuristic                 Threshold filters outliers
  Structured workflow (BPMN-like)    inductive                 Guaranteed sound process tree
  Need Petri net, quick              alpha                     Classic algorithm, parallelism
  Best possible model (slow ok)      ilp                       Optimal fitness/precision trade-off
  Population-based refinement        genetic                   Balances quality + flexibility
  Avoid local optima                 annealing                 Escapes local optima via temperature
  Swarm-style exploration            aco or pso                Pheromone/particle global search
  Declarative / compliance rules     declare                   Constraint names (response, precedence)
  Compressed skeleton view           skeleton                  Core structure, low noise
  Real-time / streaming              simd-dfg                  SIMD-accelerated, lowest latency

Quality vs Speed trade-off:
  Speed:    dfg > skeleton > simd-dfg > alpha > heuristic > inductive > hill-climbing
            > annealing > a_star > aco > pso > genetic > ilp
  Quality:  ilp > genetic > pso > aco > a_star > annealing > heuristic > inductive
            > alpha > skeleton > dfg

Van der Aalst quality dimensions:
  Fitness      — model can replay what was observed (>0.85 is good)
  Precision    — model does not allow too much unobserved behaviour
  Simplicity   — fewer places/transitions is better (Occam's razor)
  Generalization — model covers future behaviour, not just the sample

Available algorithms with explanations:
  dfg, alpha, heuristic, inductive, astar, aco, hill, annealing, pso,
  skeleton, declare, ilp, genetic`.trim();
}

// ---------------------------------------------------------------------------
// Speed / quality tier derivation
// ---------------------------------------------------------------------------

/** Derive a human speed tier label from a numeric score (lower = faster). */
function deriveSpeedTier(speedScore: number): 'fast' | 'balanced' | 'slow' {
  if (speedScore <= 20) return 'fast';
  if (speedScore <= 50) return 'balanced';
  return 'slow';
}

/** Derive a human quality tier label from a numeric score (higher = better). */
function deriveQualityTier(qualityScore: number): 'exploratory' | 'balanced' | 'quality' {
  if (qualityScore <= 40) return 'exploratory';
  if (qualityScore <= 65) return 'balanced';
  return 'quality';
}

// ---------------------------------------------------------------------------
// Algorithm comparison subcommand
// ---------------------------------------------------------------------------

interface AlgorithmComparison {
  algorithm_a: string;
  algorithm_b: string;
  subject: 'compare';
  comparison: {
    speed: { winner: string; ratio: string; score_a: number; score_b: number };
    quality: { winner: string; margin: string; score_a: number; score_b: number };
    soundness: { [key: string]: boolean };
    output_types: { [key: string]: string };
    recommendation: string;
  };
}

/** Return true if the algorithm produces a provably sound model. */
function isAlgorithmSound(algoKey: string): boolean {
  const SOUND_ALGORITHMS = new Set(['inductive', 'inductiveminer', 'ilp', 'astar', 'a_star']);
  return SOUND_ALGORITHMS.has(algoKey.toLowerCase().replace(/[_\-+*]/g, ''));
}

/** Normalise user input to an ALGO_META key, returning undefined if unknown. */
function normaliseToMetaKey(input: string): string | undefined {
  const key = input.toLowerCase().replace(/[+*\- ]/g, '').replace(/_/g, '');
  const COMPARE_ALIAS_MAP: Record<string, string> = {
    simdstreamingdfg: 'simd_dfg',
    hillclimbing: 'hill',
    heuristicminer: 'heuristic',
    inductiveminer: 'inductive',
    geneticalgorithm: 'genetic',
    simulatedannealing: 'annealing',
    antcolony: 'aco',
    processskeleton: 'skeleton',
    alphaplus: 'alpha',
    alphaplusplus: 'alpha',
  };
  const mapped = COMPARE_ALIAS_MAP[key] ?? key;
  // Find in ALGO_META by normalised key
  const normMap = Object.fromEntries(Object.keys(ALGO_META).map((k) => [k.replace(/_/g, ''), k]));
  return normMap[mapped.replace(/_/g, '')] ?? undefined;
}

function buildAlgorithmComparison(alg1: string, alg2: string): AlgorithmComparison {
  const key1 = normaliseToMetaKey(alg1);
  const key2 = normaliseToMetaKey(alg2);

  const meta1 = key1 ? ALGO_META[key1] : undefined;
  const meta2 = key2 ? ALGO_META[key2] : undefined;

  const speed1 = meta1?.speedScore ?? 50;
  const speed2 = meta2?.speedScore ?? 50;
  const quality1 = meta1?.qualityScore ?? 50;
  const quality2 = meta2?.qualityScore ?? 50;

  // Speed: lower score = faster
  const speedWinner = speed1 <= speed2 ? alg1 : alg2;
  const speedDiff = Math.abs(speed1 - speed2);
  const speedRatio =
    speedDiff === 0
      ? 'equal speed'
      : speed1 < speed2
        ? `~${Math.round((speed2 / Math.max(speed1, 1)) * 10) / 10}x faster`
        : `~${Math.round((speed1 / Math.max(speed2, 1)) * 10) / 10}x faster`;

  // Quality: higher score = better
  const qualityWinner = quality1 >= quality2 ? alg1 : alg2;
  const qualityDiff = Math.abs(quality1 - quality2);
  const qualityMargin =
    qualityDiff === 0
      ? 'equal quality'
      : `+${qualityDiff} quality score (${quality1 >= quality2 ? alg1 : alg2} wins)`;

  const sound1 = isAlgorithmSound(alg1);
  const sound2 = isAlgorithmSound(alg2);

  // Build recommendation
  let recommendation: string;
  if (speedWinner === qualityWinner) {
    recommendation = `${speedWinner} is both faster and higher quality — prefer it unless you need a specific output type.`;
  } else {
    recommendation = `Use ${speedWinner} for exploration/quick iteration; use ${qualityWinner} for final analysis or publication.`;
  }

  return {
    algorithm_a: alg1,
    algorithm_b: alg2,
    subject: 'compare',
    comparison: {
      speed: { winner: speedWinner, ratio: speedRatio, score_a: speed1, score_b: speed2 },
      quality: { winner: qualityWinner, margin: qualityMargin, score_a: quality1, score_b: quality2 },
      soundness: { [alg1]: sound1, [alg2]: sound2 },
      output_types: {
        [alg1]: meta1?.outputType ?? 'unknown',
        [alg2]: meta2?.outputType ?? 'unknown',
      },
      recommendation,
    },
  };
}

function formatComparisonOutput(p: AlgorithmComparison): string {
  const { algorithm_a: a, algorithm_b: b, comparison: c } = p;
  const lines: string[] = [
    '',
    `Algorithm Comparison: ${a} vs ${b}`,
    '='.repeat(50),
    '',
    `SPEED`,
    `  ${a}: ${c.speed.score_a}/100 (lower=faster)`,
    `  ${b}: ${c.speed.score_b}/100 (lower=faster)`,
    `  Winner: ${c.speed.winner} — ${c.speed.ratio}`,
    '',
    `QUALITY`,
    `  ${a}: ${c.quality.score_a}/100`,
    `  ${b}: ${c.quality.score_b}/100`,
    `  Winner: ${c.quality.winner} — ${c.quality.margin}`,
    '',
    `SOUNDNESS (provably correct model)`,
    `  ${a}: ${c.soundness[a] ? 'Yes ✓' : 'No ✗'}`,
    `  ${b}: ${c.soundness[b] ? 'Yes ✓' : 'No ✗'}`,
    '',
    `OUTPUT TYPE`,
    `  ${a}: ${c.output_types[a]}`,
    `  ${b}: ${c.output_types[b]}`,
    '',
    `RECOMMENDATION`,
    `  ${c.recommendation}`,
    '',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Concepts subcommand — process mining fundamentals glossary
// ---------------------------------------------------------------------------

const PROCESS_MINING_CONCEPTS: Record<string, string> = {
  event_log:
    'A collection of traces, each representing one execution of a business process. The primary input to all process mining algorithms.',
  trace:
    'An ordered sequence of events belonging to a single case (process instance), such as all steps taken to handle one customer order.',
  activity:
    'A named step or action within a process (e.g., "Approve Purchase", "Send Invoice"). The building block of traces and models.',
  fitness:
    'A quality dimension (0–1) measuring how well a model can replay observed traces. A value >0.85 is considered good practice (van der Aalst, 2016).',
  precision:
    'A quality dimension (0–1) measuring how much unseen behaviour the model allows. Low precision means the model is too permissive.',
  generalization:
    'A quality dimension (0–1) measuring whether the model applies beyond the training log. Avoids overfitting to the sample.',
  simplicity:
    'A quality dimension favouring models with fewer nodes and arcs (Occam\'s razor). A simpler model is easier to validate with domain experts.',
  variant:
    'A unique trace pattern. A log with many variants indicates high process variability or noncompliance. Use "wpm run" to count variants.',
  directly_follows:
    'A relation A→B meaning activity A is immediately followed by B with no intermediate activity in between. The foundation of DFG discovery.',
  conformance:
    'The degree to which actual process executions (the log) match a normative model. Measured via token replay or alignments (wpm conformance).',
};

function getConceptsGlossary(): string {
  const lines: string[] = [
    '',
    'Process Mining Concepts — Fundamental Terminology',
    '='.repeat(52),
    '  Reference: van der Aalst (2016) Process Mining: Data Science in Action',
    '',
  ];

  for (const [term, definition] of Object.entries(PROCESS_MINING_CONCEPTS)) {
    lines.push(`${term.toUpperCase().replace(/_/g, ' ')}`);
    lines.push(`  ${definition}`);
    lines.push('');
  }

  lines.push('  Run "wpm explain <algorithm>" for algorithm-specific guidance.');
  lines.push('  Run "wpm conformance --help" for conformance checking options.');
  lines.push('');

  return lines.join('\n');
}
