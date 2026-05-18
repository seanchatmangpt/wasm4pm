import { defineCommand } from 'citty';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { emitResult, makeResult, makeErrorResult, ConsoleProjection } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan, withSpanRaw } from './_otel.js';

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
          // Accept positional <algorithm> as alias for --algorithm
          if (
            !ctx.args.algorithm &&
            typeof ctx.args.target === 'string' &&
            ctx.args.target.length > 0
          ) {
            ctx.args.algorithm = ctx.args.target;
          }

          // Step 1: Zero-arg mode — show algorithm menu instead of a bare error
          if (!ctx.args.model && !ctx.args.algorithm && !ctx.args.config) {
            const menuContent = getAlgorithmMenu();
            const payload = {
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
            explanationContent = `Model explanation for: ${ctx.args.model}\n\nPlaceholder content (awaiting planner integration)`;
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
          const resolvedAlgo = ctx.args.algorithm as string | undefined;
          const algoKey = resolvedAlgo
            ? resolvedAlgo.toLowerCase().replace(/[+*-]/g, '')
            : undefined;
          const metaKey = algoKey
            ? Object.keys(ALGO_META).find((k) => algoKey.includes(k) || k.includes(algoKey))
            : undefined;
          const meta = metaKey ? ALGO_META[metaKey] : undefined;

          const payload = {
            subject: ctx.args.model || ctx.args.algorithm || 'execution plan',
            level,
            content: explanationContent,
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
          const result = makeErrorResult(
            'explain',
            error,
            EXIT_CODES.execution_error,
            'EXPLAIN_ERROR'
          );
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
  fitness: string; // High | Medium | Low
  precision: string; // High | Medium | Low
  generalization: string; // High | Medium | Low
  simplicity: string; // High | Medium | Low
  deploymentProfiles: string[]; // fast | balanced | quality | stream
  whenToUse: string;
  alternatives: string;
}

const ALGO_META: Record<string, AlgoMeta> = {
  dfg: {
    speedScore: 5,
    qualityScore: 30,
    outputType: 'dfg',
    fitness: 'High (100% on training log by construction)',
    precision: 'Low (allows many unobserved paths)',
    generalization: 'Low (overfits to sample)',
    simplicity: 'High (one node per activity)',
    deploymentProfiles: ['fast', 'balanced', 'quality', 'stream'],
    whenToUse: 'First look at a new log; real-time dashboards; logs with 1M+ events.',
    alternatives:
      'Use heuristic_miner when noise filtering matters; inductive_miner when you need a sound model.',
  },
  alpha: {
    speedScore: 20,
    qualityScore: 45,
    outputType: 'petrinet',
    fitness: 'High (fits all non-looping traces)',
    precision: 'Medium (handles some concurrency)',
    generalization: 'Medium',
    simplicity: 'Medium (Petri net, more structure than DFG)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Processes with true parallelism (AND-splits); when a Petri net is required for downstream tools.',
    alternatives: 'Use inductive_miner for guaranteed soundness; heuristic_miner for noisy logs.',
  },
  heuristic: {
    speedScore: 25,
    qualityScore: 50,
    outputType: 'dfg',
    fitness: 'Medium (filters low-frequency traces)',
    precision: 'Medium',
    generalization: 'High (threshold removes outliers)',
    simplicity: 'Medium',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse: 'Noisy logs (many rare variants); when you need a quick but noise-robust overview.',
    alternatives: 'Use dfg for maximum speed; inductive_miner for structurally sound models.',
  },
  inductive: {
    speedScore: 30,
    qualityScore: 55,
    outputType: 'tree',
    fitness: 'High (complete by construction)',
    precision: 'Medium (may over-generalise on noisy logs)',
    generalization: 'High (block structure captures future behaviour)',
    simplicity: 'High (process tree is the most readable output)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Structured workflows (BPMN-like); automated conformance checking; when soundness must be guaranteed.',
    alternatives:
      'Use heuristic_miner when logs are noisy; ilp when maximum fitness/precision is the goal.',
  },
  genetic: {
    speedScore: 75,
    qualityScore: 80,
    outputType: 'dfg',
    fitness: 'High',
    precision: 'High (evolves models that avoid spurious paths)',
    generalization: 'High (population diversity reduces overfitting)',
    simplicity: 'Low (larger search space → more complex models)',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Best-quality model where runtime > 1 min is acceptable; complex processes with loops and concurrency.',
    alternatives:
      'Use ilp for provably optimal models; pso or aco for faster population-based search.',
  },
  ilp: {
    speedScore: 80,
    qualityScore: 90,
    outputType: 'petrinet',
    fitness: 'High (optimal by formulation)',
    precision: 'High (ILP objective penalises spurious transitions)',
    generalization: 'Medium (can overfit small logs)',
    simplicity: 'Low (ILP can produce large Petri nets)',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Gold-standard benchmarking; regulatory compliance where optimal precision matters; small-to-medium logs.',
    alternatives:
      'Use genetic_algorithm for large logs; inductive_miner for a simpler sound model.',
  },
  astar: {
    speedScore: 60,
    qualityScore: 70,
    outputType: 'dfg',
    fitness: 'High (heuristic guides toward high-fitness models)',
    precision: 'Medium-High',
    generalization: 'Medium',
    simplicity: 'Medium',
    deploymentProfiles: ['quality'],
    whenToUse:
      'When you want near-optimal quality faster than ILP; medium-sized logs with defined budget.',
    alternatives: 'Use ilp for optimal result; aco/pso for swarm-based exploration.',
  },
  hill: {
    speedScore: 40,
    qualityScore: 55,
    outputType: 'dfg',
    fitness: 'Medium (local optimum only)',
    precision: 'Medium',
    generalization: 'Medium',
    simplicity: 'High (starts from a simple seed)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Refining a model from a fast algorithm; quick improvement pass before deeper analysis.',
    alternatives: 'Use annealing to escape local optima; genetic_algorithm for global search.',
  },
  annealing: {
    speedScore: 55,
    qualityScore: 65,
    outputType: 'dfg',
    fitness: 'Medium-High (escapes local optima)',
    precision: 'Medium',
    generalization: 'Medium-High',
    simplicity: 'Medium',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Complex processes where hill climbing gets stuck; balancing exploration and exploitation.',
    alternatives:
      'Use genetic_algorithm for population-based search; aco for pheromone-guided exploration.',
  },
  aco: {
    speedScore: 65,
    qualityScore: 75,
    outputType: 'dfg',
    fitness: 'High',
    precision: 'High (pheromone trails converge on frequent paths)',
    generalization: 'High',
    simplicity: 'Low',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Complex process structures with hidden patterns; when pheromone convergence is a good fit.',
    alternatives:
      'Use pso for faster convergence on smooth landscapes; genetic_algorithm for explicit fitness tuning.',
  },
  pso: {
    speedScore: 70,
    qualityScore: 75,
    outputType: 'dfg',
    fitness: 'High',
    precision: 'High',
    generalization: 'High',
    simplicity: 'Low',
    deploymentProfiles: ['quality'],
    whenToUse:
      'Continuous model space; when global best sharing matters; parallelisable workloads.',
    alternatives:
      'Use aco for discrete process structures; genetic_algorithm for explicit crossover/mutation.',
  },
  skeleton: {
    speedScore: 3,
    qualityScore: 25,
    outputType: 'dfg',
    fitness: 'Medium (filters low-frequency edges)',
    precision: 'High (minimal model = high precision)',
    generalization: 'Low (loses rare but important paths)',
    simplicity: 'Very High (skeleton is the most compact output)',
    deploymentProfiles: ['fast', 'balanced', 'quality', 'stream'],
    whenToUse:
      'Executive overview; noise filtering before deeper analysis; mobile/IoT deployments.',
    alternatives:
      'Use dfg for the full picture; heuristic_miner for threshold-controlled filtering.',
  },
  declare: {
    speedScore: 35,
    qualityScore: 50,
    outputType: 'declare',
    fitness: 'Medium (constraint-based, not replay-based)',
    precision: 'High (each constraint is individually verifiable)',
    generalization: 'High (constraints generalise naturally)',
    simplicity: 'Very High (business-friendly constraint names)',
    deploymentProfiles: ['balanced', 'quality'],
    whenToUse:
      'Compliance checking; flexible processes (healthcare, research); regulatory monitoring.',
    alternatives:
      'Use inductive_miner for a procedural block model; heuristic_miner for DFG-based overview.',
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
  };

  const algoKey = algorithm.toLowerCase().replace(/[+*-]/g, '');
  const algo = Object.keys(explanations).find((k) => algoKey.includes(k) || k.includes(algoKey));

  if (!algo || !explanations[algo]) {
    // Unknown algorithm — list what is available so the user knows what to type next
    const available = Object.keys(explanations).join(', ');
    return (
      `No explanation available for '${algorithm}'.\n\n` +
      `Algorithms with explanations: ${available}\n\n` +
      `Examples:\n` +
      `  wpm explain dfg          — simplest/fastest algorithm\n` +
      `  wpm explain heuristic    — balanced, noise-robust\n` +
      `  wpm explain ilp          — highest quality\n` +
      `  wpm explain              — show full algorithm menu`
    );
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
