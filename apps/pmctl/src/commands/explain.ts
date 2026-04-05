import { defineCommand } from 'citty';
import { resolveConfig as loadConfig } from '@wasm4pm/config';
import { getFormatter, HumanFormatter, JSONFormatter } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import type { OutputOptions } from '../output.js';

export interface ExplainOptions extends OutputOptions {
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
    const formatter = getFormatter({
      format: ctx.args.format as 'human' | 'json',
      verbose: ctx.args.verbose,
      quiet: ctx.args.quiet,
    });

    try {
      // Step 1: Validate input
      if (!ctx.args.model && !ctx.args.algorithm && !ctx.args.config) {
        if (formatter instanceof JSONFormatter) {
          formatter.error(
            'No model, algorithm, or config specified. Use --model, --algorithm, or --config'
          );
        } else {
          formatter.warn(
            'No model, algorithm, or config specified. Use --model, --algorithm, or --config'
          );
        }
        process.exit(EXIT_CODES.source_error);
      }

      // Step 2: Generate explanation content
      let explanationContent = '';
      const level = (ctx.args.level || 'detailed') as 'brief' | 'detailed' | 'academic';

      if (ctx.args.model) {
        // Model explanation - placeholder for now
        explanationContent = `Model explanation for: ${ctx.args.model}\n\nPlaceholder content (awaiting planner integration)`;
      } else if (ctx.args.config) {
        // Config explanation
        try {
          const configPath = ctx.args.config || process.cwd();
          const config = await loadConfig({
            configSearchPaths: [configPath],
          });

          // Configuration is already validated by loadConfig
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
        // Algorithm explanation
        explanationContent = getAlgorithmExplanation(
          ctx.args.algorithm,
          level
        );
      }

      // Step 3: Format output
      const explanationResult = {
        subject: ctx.args.model || ctx.args.algorithm || 'execution plan',
        level,
        content: explanationContent,
        timestamp: new Date().toISOString(),
      };

      if (formatter instanceof JSONFormatter) {
        formatter.success('Explanation generated', {
          subject: explanationResult.subject,
          level: explanationResult.level,
          content: explanationResult.content,
        });
      } else {
        formatter.info(`Explanation: ${explanationResult.subject}`);
        formatter.log('');
        formatter.log(explanationResult.content);
        formatter.log('');
      }

      process.exit(EXIT_CODES.success);
    } catch (error) {
      if (formatter instanceof JSONFormatter) {
        formatter.error('Failed to generate explanation', error);
      } else {
        formatter.error(
          `Failed to generate explanation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

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
4. Outputs the graph as a Petri net or process model

**Characteristics**:
- **Speed**: Very fast (linear time complexity)
- **Memory**: Minimal memory usage
- **Accuracy**: Best for simple processes, poor for complex control flows
- **Advantages**: Fast, interpretable, handles large logs
- **Disadvantages**: Cannot discover implicit dependencies, loops, or concurrent activities

**Best for**: Quick process overview, real-time analysis, large event logs`,
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

**Fitness evaluation**:
- Traces replayed through model
- Count: correctly executed, partially executed, failed traces
- Fitness = (correct + 0.5×partial) / total

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
    ilp: {
      brief: `**Integer Linear Programming** - Optimal model discovery. Maximum quality but computationally expensive.`,
      detailed: `## ILP-based Process Mining

**Overview**: Formulates process discovery as an optimization problem. Finds provably optimal process models by solving integer linear programs. Best quality but slow for large logs.

**Formulation**:
- Variables: edges/nodes in model
- Objective: maximize fitness - λ × complexity
- Constraints: model validity (Petri net rules), replay constraints

**Advantages**:
- Provably optimal solution
- Precise control over trade-offs
- Can handle complex constraints

**Disadvantages**:
- Very slow for large logs (NP-hard)
- Requires ILP solver
- Limited to smaller logs (typically < 10k events)`,
      academic: `## Integer Linear Programming Formulation

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
  const algo = Object.keys(explanations).find((k) =>
    algoKey.includes(k) || k.includes(algoKey)
  );

  if (!algo || !explanations[algo]) {
    return `No detailed explanation available for algorithm: ${algorithm}`;
  }

  return explanations[algo][level] || explanations[algo].detailed;
}
