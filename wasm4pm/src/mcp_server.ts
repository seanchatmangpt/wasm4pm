/**
 * MCP Server Integration for wasm4pm
 *
 * Exposes wasm4pm process mining capabilities as Model Context Protocol (MCP) tools.
 * Enables Claude and other MCP clients to use wasm4pm for process discovery, analysis, and visualization.
 *
 * Usage:
 *   const server = new Wasm4pmMCPServer();
 *   await server.start();
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as wasm from '../pkg/wasm4pm.js';

interface ToolInput {
  [key: string]: unknown;
}

/**
 * wasm4pm MCP Server
 *
 * Provides MCP interface to wasm4pm functionality including:
 * - Process discovery (18 algorithms)
 * - Conformance checking
 * - Process analysis and visualization
 * - Event log import/export
 */
export class Wasm4pmMCPServer {
  private server: Server;
  private transport: StdioServerTransport;

  constructor() {
    this.server = new Server(
      {
        name: 'wasm4pm',
        version: '0.5.4',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.transport = new StdioServerTransport();

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAvailableTools(),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.executeTool(request.params.name, (request.params.arguments ?? {}) as ToolInput);
    });
  }

  /**
   * Get all available MCP tools
   */
  private getAvailableTools() {
    return [
      // Discovery Algorithms
      {
        name: 'discover_dfg',
        description:
          'Discover a Directly-Follows Graph (DFG) from an event log. A DFG shows which activities directly follow which, with frequency counts. Returns JSON with: nodes[] (activities with their frequency), edges[] (each with from, to, frequency — how many times activity A was directly followed by B), start_activities (activities that begin cases with counts), end_activities (activities that end cases with counts). Use min_frequency (0-1) to filter rare edges. For human-readable output, use encode_dfg_as_text instead.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            min_frequency: {
              type: 'number',
              description:
                'Minimum edge frequency as fraction of total edges (0-1). Default: 0.0 (include all edges). Use 0.1 to show only edges that appear in >= 10% of cases.',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_alpha_plus_plus',
        description:
          'Discover a Petri Net using Alpha++ algorithm. Balanced accuracy and performance.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_ilp_optimization',
        description:
          'Discover optimal process model using Integer Linear Programming. Highest quality but slower.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            timeout_ms: {
              type: 'number',
              description: 'Timeout in milliseconds. Default: 30000',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_genetic_algorithm',
        description:
          'Discover process model using evolutionary algorithm. Good for complex processes.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            population_size: {
              type: 'number',
              description: 'Population size. Default: 50',
            },
            generations: {
              type: 'number',
              description: 'Number of generations. Default: 100',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_variants',
        description: 'Discover all unique trace variants in the event log and their frequencies.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
          },
          required: ['xes_content'],
        },
      },
      // Analysis
      {
        name: 'check_conformance',
        description:
          'Check if event log conforms to a Petri Net process model using token-based replay. Returns fitness, precision, and per-trace deviations. NOTE: model_json must be an opaque Petri Net handle returned by discover_alpha_plus_plus, discover_genetic_algorithm, discover_ilp_optimization, or similar discovery tools — it is not raw JSON.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            model_json: {
              type: 'string',
              description:
                'Opaque Petri Net handle returned by a discovery tool in the same session (e.g., from discover_alpha_plus_plus). Not raw JSON.',
            },
          },
          required: ['xes_content', 'model_json'],
        },
      },
      {
        name: 'analyze_statistics',
        description:
          'Analyze event log statistics: trace count, event count, duration, activities, etc.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'detect_bottlenecks',
        description: 'Identify activities that are process bottlenecks based on execution time.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            threshold: {
              type: 'number',
              description: 'Threshold in seconds. Default: 3600 (1 hour)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Visualization
      {
        name: 'encode_dfg_as_text',
        description:
          'Discover a Directly-Follows Graph from the event log and encode it as human-readable English text suitable for an LLM. Describes which activities exist, which start/end the process, and which activity-to-activity flows are most common with percentage frequencies. Use this when you want to describe a process in natural language rather than raw JSON.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content (a DFG will be discovered internally)',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Utilities
      {
        name: 'compare_algorithms',
        description:
          'Compare multiple discovery algorithms on the same event log. Returns fitness and execution time for each.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            algorithms: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Algorithms to compare. Options: dfg, alpha_plus_plus, genetic, ilp, pso, a_star, declare, heuristic, inductive, hill_climbing, ant_colony, simulated_annealing, process_skeleton. Note: heuristic uses dependency_threshold=0.3 (safe default; 0.8 filters almost everything on real logs).',
            },
          },
          required: ['xes_content'],
        },
      },
      // OCEL / Object-Centric Process Mining
      {
        name: 'load_ocel',
        description:
          'Load an Object-Centric Event Log from JSON (OCEL 2.0 standard). Returns an opaque handle for subsequent OCEL operations.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ocel_json: {
              type: 'string',
              description: 'OCEL 2.0 JSON content with events, objects, objectTypes, eventTypes',
            },
          },
          required: ['ocel_json'],
        },
      },
      {
        name: 'flatten_ocel',
        description:
          'Project an OCEL onto a single object type, producing a classic EventLog handle.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ocel_handle: {
              type: 'string',
              description: 'Handle to a loaded OCEL (from load_ocel)',
            },
            object_type: {
              type: 'string',
              description: 'Object type to project onto (e.g., "Order", "Item")',
            },
          },
          required: ['ocel_handle', 'object_type'],
        },
      },
      {
        name: 'discover_ocel_dfg_per_type',
        description: 'Discover a separate Directly-Follows Graph for each object type in an OCEL.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ocel_handle: {
              type: 'string',
              description: 'Handle to a loaded OCEL',
            },
          },
          required: ['ocel_handle'],
        },
      },
      {
        name: 'discover_oc_petri_net',
        description:
          'Discover Object-Centric Petri Nets from an OCEL. Supports alpha++ and heuristic algorithms.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ocel_handle: {
              type: 'string',
              description: 'Handle to a loaded OCEL',
            },
            algorithm: {
              type: 'string',
              description: 'Discovery algorithm: "alpha++" (default) or "heuristic"',
            },
          },
          required: ['ocel_handle'],
        },
      },
      {
        name: 'encode_ocel_as_text',
        description:
          'Convert an OCEL into an LLM-readable summary with event types, object types, and statistics.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            ocel_handle: {
              type: 'string',
              description: 'Handle to a loaded OCEL (from load_ocel)',
            },
          },
          required: ['ocel_handle'],
        },
      },
      // Predictive Process Mining
      {
        name: 'predict_next_activity',
        description:
          'Given an activity prefix, predict the top-k most likely next activities with probabilities. Builds an n-gram model from the log on-the-fly. Claude uses this to answer "Given Submit→Review, what comes next?"',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content used to train the predictor',
            },
            prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Sequence of activity names seen so far, e.g. ["Register", "Check"]',
            },
            k: {
              type: 'number',
              description: 'Number of top candidates to return. Default: 5',
            },
            n: {
              type: 'number',
              description: 'N-gram context size (how many preceding activities to use). Default: 2',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content', 'prefix'],
        },
      },
      {
        name: 'predict_case_duration',
        description:
          'Predict the remaining time (ms) for a running case given its activity prefix. Builds a bucket-based remaining-time model from the log. Claude uses this to answer "How long until this case closes?"',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content used to train the model (completed cases)',
            },
            prefix: {
              type: 'array',
              items: { type: 'string' },
              description: 'Activity names executed so far in the running case',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content', 'prefix'],
        },
      },
      {
        name: 'score_trace_anomaly',
        description:
          'Score a trace (sequence of activity names) for anomaly against the reference DFG discovered from the log. Returns a normalized 0-1 score and an is_anomalous flag. Claude uses this to answer "Is this trace unusual?"',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content used as reference (the "normal" process)',
            },
            trace: {
              type: 'array',
              items: { type: 'string' },
              description: 'The trace to evaluate, e.g. ["Register", "Skip Approval", "Close"]',
            },
          },
          required: ['xes_content', 'trace'],
        },
      },
      // Concept Drift Detection (van der Aalst's 4th prediction perspective)
      {
        name: 'detect_concept_drift',
        description:
          'Detect concept drift in a process log using windowed Jaccard distance and EWMA smoothing (α=0.3). Returns drift points, trend direction (rising/stable/falling), and an interpretation. Claude uses this to answer "Has the process changed over time?"',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content to analyze for drift',
            },
            window_size: {
              type: 'number',
              description: 'Number of traces per sliding window (default: 50)',
            },
            alpha: {
              type: 'number',
              description:
                'EWMA smoothing factor α ∈ (0,1] (default: 0.3). Higher = more weight on recent windows.',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Feature Extraction
      {
        name: 'extract_case_features',
        description:
          'Extract ML-ready feature vectors from an event log for predictive process mining.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            features: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Features to extract: trace_length, elapsed_time, activity_counts, rework_count, unique_activities, avg_inter_event_time',
            },
            target: {
              type: 'string',
              description:
                'Target variable: "remaining_time", "outcome", or "next_activity". Default: "outcome"',
            },
          },
          required: ['xes_content'],
        },
      },
      // ML Tools (native process intelligence)
      {
        name: 'ml_classify_traces',
        description:
          'Classify traces using ML (k-NN or logistic regression). Extracts features automatically, trains a classifier, and returns per-trace predictions with confidence scores.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            method: {
              type: 'string',
              enum: ['knn', 'logistic_regression'],
              description: 'Classification method (default: knn)',
            },
            k: {
              type: 'number',
              description: 'Number of neighbors for k-NN (default: 5)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'ml_cluster_traces',
        description:
          'Cluster traces by similarity using ML (k-means or DBSCAN). Automatically extracts features and groups traces into clusters.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            method: {
              type: 'string',
              enum: ['kmeans', 'dbscan'],
              description: 'Clustering method (default: kmeans)',
            },
            k: {
              type: 'number',
              description: 'Number of clusters for k-means (default: 3)',
            },
            eps: {
              type: 'number',
              description: 'DBSCAN epsilon (default: 1.0)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'ml_forecast_throughput',
        description:
          'Forecast future process throughput and detect seasonal patterns using trend analysis and seasonal decomposition.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            forecast_periods: {
              type: 'number',
              description: 'Number of future periods to forecast (default: 5)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'ml_detect_anomalies',
        description:
          'Enhanced anomaly detection using peak finding and seasonal decomposition on drift distance series. Identifies anomalous process windows.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'ml_regress_remaining_time',
        description:
          'Predict remaining case time using linear regression on extracted trace features. Returns per-trace predictions with R-squared and error metrics.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'ml_pca_reduce',
        description:
          'Reduce high-dimensional trace features to fewer dimensions using PCA. Returns transformed data, explained variance, and component loadings.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            n_components: {
              type: 'number',
              description: 'Number of PCA components (default: 2)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Advanced Discovery
      {
        name: 'discover_dfg_simd',
        description:
          'Discover a Directly-Follows Graph using SIMD-accelerated edge computation. Significantly faster than standard DFG for large logs (10k+ traces).',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            min_frequency: {
              type: 'number',
              description: 'Minimum edge frequency (0-1). Default: 0.0 (include all edges)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_dfg_hierarchical',
        description:
          'Discover a hierarchical Directly-Follows Graph by splitting the log into chunks and computing a DFG per chunk. Reveals how the process behavior changes across different trace windows. The underlying WASM function takes num_chunks, not a depth level.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            num_chunks: {
              type: 'number',
              description:
                'Number of trace-window chunks to split the log into. Default: 3. Minimum: 1.',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'streaming_log_estimate',
        description:
          'Probabilistic streaming log processor that estimates DFG statistics using bounded memory. Suitable for infinite or very large streams where full materialization is impractical.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content (processed incrementally)',
            },
            sample_rate: {
              type: 'number',
              description: 'Sampling rate between 0 and 1. Default: 1.0 (process all traces)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'smart_engine_run',
        description:
          'Smart execution engine with automatic algorithm selection and result caching. Analyzes the log to pick the best algorithm, caches intermediate results, and returns the discovery output with provenance.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            algorithm: {
              type: 'string',
              description:
                'Override automatic algorithm selection. Options: dfg, optimized_dfg, heuristic_miner. Default: dfg (auto-select is not supported; omit this field to use dfg).',
            },
            cache_key: {
              type: 'string',
              description:
                'Optional cache key for deduplication. Default: auto-generated from log hash.',
            },
          },
          required: ['xes_content'],
        },
      },
      // Sequential Pattern Mining (Discovery perspective)
      {
        name: 'mine_sequential_patterns',
        description:
          'Find the most frequent consecutive activity sequences (patterns) in an event log. Answers "What sequences of activities repeat most often?" Returns patterns with support counts, sorted by frequency. Use this to identify common sub-process flows, frequent rework loops, or standard case trajectories. Example: pattern ["Submit","Review","Approve"] with support 0.72 means 72% of traces contain this consecutive sequence.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            min_support: {
              type: 'number',
              description:
                'Minimum fraction of traces that must contain the pattern (0-1). Default: 0.1 (10%). Lower values return more patterns but include rare ones.',
            },
            pattern_length: {
              type: 'number',
              description:
                'Number of consecutive activities per pattern. Default: 2 (bigrams like A→B). Use 3 for trigrams (A→B→C).',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Resource and Intervention — M/M/1 queue and UCB1 bandit (van der Aalst 6th perspective)
      {
        name: 'estimate_queue_delay',
        description:
          'Estimate how long a process activity will wait in queue using the M/M/1 queueing model. Answers "How long will this task wait before a resource handles it?" Pass arrival_rate (tasks arriving per hour) and service_rate (tasks completed per hour). Returns wait_time (expected wait in the same units), utilization (0-1 load factor), and is_stable (false means the queue grows without bound — you need more capacity). Use this to identify resource bottlenecks before they cause SLA breaches.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            arrival_rate: {
              type: 'number',
              description:
                'Average rate at which tasks arrive (e.g., cases per hour). Must be >= 0.',
            },
            service_rate: {
              type: 'number',
              description:
                'Average rate at which a single resource completes tasks (e.g., cases per hour). Must be > 0.',
            },
          },
          required: ['arrival_rate', 'service_rate'],
        },
      },
      {
        name: 'rank_interventions',
        description:
          'Rank candidate interventions by a greedy score that balances utility and exploration. Answers "Which intervention should we try next?" Each intervention has a name and a utility estimate (0-1). The exploitation_weight parameter (0-1) controls how much to favor the highest-utility option over exploring alternatives. Returns interventions sorted by descending score with explicit rank. Use this when you have multiple possible actions (e.g., reassign case, escalate, auto-approve) and need a principled ranking.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            interventions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Intervention name' },
                  utility: {
                    type: 'number',
                    description: 'Estimated utility 0-1 (higher = more beneficial)',
                  },
                },
                required: ['name', 'utility'],
              },
              description: 'List of candidate interventions with utility estimates',
            },
            exploitation_weight: {
              type: 'number',
              description:
                'How strongly to favor the highest-utility option (0-1). Default: 0.7. 1.0 = always pick highest utility; 0.0 = pure exploration.',
            },
          },
          required: ['interventions'],
        },
      },
      {
        name: 'select_intervention',
        description:
          'Select the best intervention using the UCB1 multi-armed bandit algorithm. Answers "Given past rewards across interventions, which one should we try now?" UCB1 automatically balances exploitation (picking what worked before) with exploration (trying underused options). The bandit state tracks pull counts and cumulative rewards per arm. Returns the selected intervention name, its UCB score, mean reward, and exploration bonus. Update the bandit state after observing the outcome to improve future selections.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            bandit_state: {
              type: 'object',
              description:
                'Current bandit state with arms and total_pulls. Arms have name, total_reward, pull_count. Pass empty arms to initialize.',
              properties: {
                arms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      total_reward: { type: 'number' },
                      pull_count: { type: 'number' },
                    },
                  },
                },
                total_pulls: { type: 'number' },
              },
            },
            exploration_factor: {
              type: 'number',
              description:
                'UCB1 exploration constant (default: 1.414 = √2). Higher values explore more aggressively.',
            },
          },
          required: ['bandit_state'],
        },
      },
      // Process boundary analysis — start and end activities
      {
        name: 'analyze_start_end_activities',
        description:
          'Identify which activities start cases, which end them, and the most common start→end pairs. Answers "Where does this process begin and end?" Returns ranked lists of start activities and end activities by frequency, plus the top start/end combination pairs. Essential for understanding process boundaries, detecting missing termination activities, or identifying variant entry points.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Resource perspective — Social Network Mining (van der Aalst 6th perspective)
      {
        name: 'discover_handover_network',
        description:
          'Mine the handover-of-work social network from an event log. Answers "Which resources hand off work to which other resources, and how often?" Each edge (from→to) represents a direct handoff between two resources on the same case. Edge weight is the number of handoffs. Use org:resource as the resource_key for standard XES logs. This is van der Aalst\'s Resource perspective: it reveals collaboration patterns, identifies isolated workers, and surfaces hidden coordination bottlenecks. Returns { nodes: [{id, label}], edges: [{from, to, weight}] }.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            resource_key: {
              type: 'string',
              description:
                'XES attribute key that identifies the resource (default: org:resource). Use org:resource for standard XES logs.',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'discover_working_together_network',
        description:
          'Mine the working-together social network from an event log. Answers "Which resources collaborate by working on the same cases?" Two resources are connected if they both handled at least one event in the same case. Edge weight is the number of cases where both appeared. Complements discover_handover_network: handover shows sequential dependencies, working-together shows case-level co-occurrence. Returns { nodes: [{id, label}], edges: [{from, to, co_occurrences}] }.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            resource_key: {
              type: 'string',
              description:
                'XES attribute key that identifies the resource (default: org:resource). Use org:resource for standard XES logs.',
            },
          },
          required: ['xes_content'],
        },
      },
      // Enhancement perspective — rework detection
      {
        name: 'detect_rework',
        description:
          'Detect rework loops in a process — activities that are repeated within the same case. Answers "Where does this process have rework?" Returns rework_by_activity (which activities are repeated and how often), traces_with_rework (count of cases containing at least one repeated activity), rework_percentage (fraction of all cases with rework), and total_rework_instances. High rework on "Check" or "Approve" activities is a strong indicator of quality problems upstream. Use this as an Enhancement perspective tool to identify where the process loops back unnecessarily.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Social Network Analysis — advanced resource perspective tools
      {
        name: 'compute_network_metrics',
        description:
          'Compute graph-level social network metrics from the handover-of-work network: degree centrality, betweenness centrality, and in/out degree per resource. Answers "Who are the most central or influential resources in this process?" Returns per-node metrics plus aggregate density and average path length. Complements discover_handover_network.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            resource_key: {
              type: 'string',
              description: 'XES attribute key identifying the resource (default: org:resource)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'compute_clustering_coefficient',
        description:
          'Compute the local and global clustering coefficient of the working-together network. Answers "How tightly-knit are the resource groups in this process?" A high clustering coefficient indicates cliques (resources always work together); low indicates a dispersed collaboration structure.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            resource_key: {
              type: 'string',
              description: 'XES attribute key identifying the resource (default: org:resource)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'detect_communities',
        description:
          'Detect resource communities (sub-groups) in the working-together network using connected-component analysis. Answers "Which resources form natural work groups?" Returns groups of resources that frequently work together, enabling organizational insights and role discovery.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            resource_key: {
              type: 'string',
              description: 'XES attribute key identifying the resource (default: org:resource)',
            },
          },
          required: ['xes_content'],
        },
      },
      // LLM-readable text encodings — high-value conversational tools
      {
        name: 'encode_variants_as_text',
        description:
          'Describe the top process variants in human-readable English. Answers "What are the main paths through this process?" Returns a narrative listing the most frequent trace sequences with their occurrence percentages. Use this instead of discover_variants when you want to describe variants in a conversation rather than process raw JSON. Example output: "Top 3 process variants: 1. Register→Check→Approve→Close (45%), 2. Register→Reject→Close (30%), ..."',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
            top_n: {
              type: 'number',
              description: 'Maximum number of variants to describe (default: 10)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'encode_statistics_as_text',
        description:
          'Summarize event log statistics in human-readable English. Answers "What does this event log contain?" Returns a natural-language summary including case count, event count, average events per case, unique activities, and activity frequency rankings. Use this as the first tool when exploring an unknown event log — it gives an immediate natural-language overview without any JSON parsing. Equivalent to analyze_statistics but formatted for conversational output.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
          },
          required: ['xes_content'],
        },
      },
      // Beam search — predictive next-activity sequences
      {
        name: 'predict_beam_paths',
        description:
          'Predict the top-k most likely complete activity sequences (paths) from a prefix using beam search over the n-gram model. Unlike predict_next_activity (which predicts one step), this predicts entire future paths. Answers "What are the most likely ways this case will complete?" Returns sequences sorted by probability with their full activity lists. Use k=3 to get the top 3 predicted paths, depth controls how many future activities to predict (default: 5). Example: prefix ["Register","Check"] might yield paths ["Register","Check","Approve","Close"], ["Register","Check","Reject","Close"], etc.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content used to train the n-gram model',
            },
            prefix: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Activity names seen so far in the running case, e.g. ["Register", "Check"]',
            },
            k: {
              type: 'number',
              description: 'Number of top paths to return (default: 3)',
            },
            depth: {
              type: 'number',
              description: 'Maximum number of future activities to predict per path (default: 5)',
            },
            n: {
              type: 'number',
              description: 'N-gram context size (default: 2)',
            },
          },
          required: ['xes_content', 'prefix'],
        },
      },
      // Registry
      {
        name: 'get_capability_registry',
        description: 'Get the complete catalog of all wasm4pm functions organized by category.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      // Cache management
      {
        name: 'clear_caches',
        description: 'Clear all parsing and encoding caches (parse, columnar, interner).',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'cache_stats',
        description:
          'Get cache hit/miss statistics. Returns parse hits, parse misses, columnar entries, and interner entries.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      // SIMD conformance
      {
        name: 'simd_replay',
        description:
          'SIMD-accelerated token replay for conformance checking. Discovers a DFG from the log, builds a Petri net, then replays every trace and returns fitness/precision/per-case diagnostics.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'Activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Process Discovery — Alpha Miner footprint matrix
      {
        name: 'discover_alpha_footprints',
        description:
          'Compute the Alpha Miner footprint matrix. Answers "What are the causal, parallel, and never-follow relations between activities in this process?" Returns causal pairs (A→B), parallel pairs (A||B), and never-follow pairs for every activity pair in the log.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Conformance Checking — DFG token-replay fitness
      {
        name: 'compute_conformance_fitness',
        description:
          'Compute DFG token-replay fitness for an event log. Answers "How well does this log conform to the process model discovered from it?" Returns a 0–1 fitness score with a quality label (good/partial/poor) and an interpretation. Uses SIMD-accelerated token replay internally.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content as string',
            },
            activity_key: {
              type: 'string',
              description: 'XES activity attribute key (default: concept:name)',
            },
          },
          required: ['xes_content'],
        },
      },
      // Resource and intervention — WASM backend health
      {
        name: 'check_backend_health',
        description:
          'Check whether the process mining WASM backend is initialized and ready to accept discovery and conformance requests. Returns version, feature flags, cache statistics, and a readiness flag.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            force_reinit: {
              type: 'boolean',
              description: 'If true, call wasm.init() even if already initialized (default: false)',
            },
          },
        },
      },
    ];
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(toolName: string, input: ToolInput): Promise<CallToolResult> {
    try {
      let result: unknown;

      switch (toolName) {
        // Discovery algorithms — use WASM functions directly
        case 'discover_dfg': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const minFreq = (input.min_frequency as number) ?? 0;
            if (minFreq > 0) {
              result = wasm.discover_dfg_filtered(logHandle, 'concept:name', minFreq);
            } else {
              result = wasm.discover_dfg(logHandle, 'concept:name');
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_alpha_plus_plus': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            result = wasm.discover_alpha_plus_plus(logHandle, 'concept:name', 0.1);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_ilp_optimization': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            result = wasm.discover_ilp_petri_net(logHandle, 'concept:name');
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_genetic_algorithm': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const popSize = (input.population_size as number) ?? 50;
            const generations = (input.generations as number) ?? 100;
            result = wasm.discover_genetic_algorithm(
              logHandle,
              'concept:name',
              popSize,
              generations
            );
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_variants': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            result = wasm.analyze_trace_variants(logHandle, 'concept:name');
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Analysis
        case 'check_conformance': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const netHandle = input.model_json as string;
            result = wasm.check_token_based_replay(logHandle, netHandle, 'concept:name');
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'analyze_statistics': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            result = wasm.analyze_event_statistics(logHandle);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'detect_bottlenecks': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const threshold = BigInt((input.threshold as number) ?? 3600);
            result = wasm.detect_bottlenecks(
              logHandle,
              'concept:name',
              'time:timestamp',
              threshold
            );
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Visualization / text encoding
        case 'encode_dfg_as_text': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            // discover_dfg_simd_handle stores the DFG in WASM state and returns an
            // opaque handle string — required by encode_dfg_as_text which expects a
            // stored DFG, not serialized JSON.  discover_dfg() returns serialized JSON
            // which cannot be passed directly to encode_dfg_as_text.
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const dfgHandleRaw = wasm.discover_dfg_simd_handle(logHandle, actKey);
            const dfgHandle =
              typeof dfgHandleRaw === 'string' ? dfgHandleRaw : String(dfgHandleRaw);
            try {
              result = wasm.encode_dfg_as_text(dfgHandle);
            } finally {
              try {
                wasm.delete_object(dfgHandle);
              } catch {
                /* best-effort */
              }
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Utilities
        case 'compare_algorithms': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const algorithms = (input.algorithms as string[]) || [
              'dfg',
              'alpha_plus_plus',
              'genetic',
            ];
            result = this.compareAlgorithms(logHandle, algorithms);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // OCEL / Object-Centric Process Mining
        case 'load_ocel': {
          const handle = wasm.load_ocel_from_json(input.ocel_json as string);
          result = { ocel_handle: handle, message: 'OCEL loaded successfully' };
          break;
        }

        case 'flatten_ocel': {
          const logHandle = wasm.flatten_ocel_to_eventlog(
            input.ocel_handle as string,
            input.object_type as string
          );
          result = {
            eventlog_handle: logHandle,
            object_type: input.object_type,
            message: `OCEL flattened to EventLog for object type '${input.object_type}'`,
          };
          break;
        }

        case 'discover_ocel_dfg_per_type': {
          result = wasm.discover_ocel_dfg_per_type(input.ocel_handle as string);
          break;
        }

        case 'discover_oc_petri_net': {
          const algorithm = (input.algorithm as string) || 'alpha++';
          result = wasm.discover_oc_petri_net(input.ocel_handle as string, algorithm);
          break;
        }

        case 'encode_ocel_as_text': {
          result = wasm.encode_ocel_summary_as_text(input.ocel_handle as string);
          break;
        }

        // Predictive Process Mining — all handles freed within this tick (no memory accumulation)
        case 'predict_next_activity': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const n = (input.n as number) ?? 2;
            const k = (input.k as number) ?? 5;
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const predictorHandle = wasm.build_ngram_predictor(logHandle, actKey, n);
            try {
              const prefixJson = JSON.stringify(input.prefix as string[]);
              const raw = wasm.predict_next_k(String(predictorHandle), prefixJson, k);
              const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const prefix = input.prefix as string[];
              const predictions = Array.isArray(parsed) ? parsed : (parsed?.predictions ?? []);
              const top = predictions[0];
              result = {
                predictions,
                interpretation: top
                  ? `After ${prefix.join('→')}, the most likely next activity is "${top.activity}" (probability: ${(top.probability * 100).toFixed(1)}%). ${predictions.length} candidates ranked by ${n}-gram model trained from the log.`
                  : `No prediction available for prefix: ${prefix.join('→')}. The prefix may not appear in the training log.`,
                prefix,
                n_gram_order: n,
              };
            } finally {
              try {
                wasm.delete_object(String(predictorHandle));
              } catch {
                /* best-effort */
              }
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'predict_case_duration': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const modelHandle = wasm.build_remaining_time_model(
              logHandle,
              actKey,
              'time:timestamp'
            );
            try {
              const prefixJson = JSON.stringify(input.prefix as string[]);
              const raw = wasm.predict_case_duration(String(modelHandle), prefixJson);
              const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const prefix = input.prefix as string[];
              const remainingMs =
                typeof parsed === 'number'
                  ? parsed
                  : (parsed?.remaining_ms ?? parsed?.prediction ?? 0);
              const remainingHours = remainingMs / 1000 / 3600;
              result = {
                remaining_ms: remainingMs,
                remaining_hours: parseFloat(remainingHours.toFixed(2)),
                interpretation:
                  remainingMs > 0
                    ? `Based on cases with a similar prefix (${prefix.join('→')}), the expected remaining time is approximately ${remainingHours.toFixed(1)} hours.`
                    : `No duration estimate available for prefix: ${prefix.join('→')}. The prefix may not appear in completed cases.`,
                prefix,
              };
            } finally {
              try {
                wasm.delete_object(String(modelHandle));
              } catch {
                /* best-effort */
              }
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'score_trace_anomaly': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const dfgHandle = wasm.discover_dfg_simd_handle(logHandle, actKey);
            try {
              const trace = input.trace as string[];
              const traceJson = JSON.stringify(trace);
              const raw = wasm.score_trace_anomaly(String(dfgHandle), traceJson);
              const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const score = typeof parsed === 'number' ? parsed : (parsed?.score ?? 0);
              const isAnomalous = score > 0.5;
              result = {
                score: parseFloat(score.toFixed(4)),
                is_anomalous: isAnomalous,
                interpretation: isAnomalous
                  ? `This trace is anomalous (score ${score.toFixed(3)} > 0.5). One or more transitions (${trace.join('→')}) are rare or absent in the reference process model. Consider reviewing this case for deviations.`
                  : `This trace follows normal process patterns (score ${score.toFixed(3)} ≤ 0.5). All transitions appear in the reference model at expected frequencies.`,
                trace,
              };
            } finally {
              try {
                wasm.delete_object(String(dfgHandle));
              } catch {
                /* best-effort */
              }
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Concept Drift Detection
        case 'detect_concept_drift': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const windowSize = (input.window_size as number) ?? 50;
            const alpha = (input.alpha as number) ?? 0.3;
            const driftRaw = wasm.detect_drift(logHandle, actKey, windowSize);
            const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
            const drifts = driftResult?.drifts ?? [];
            const driftCount = driftResult?.drifts_detected ?? drifts.length;
            // Compute EWMA over drift distances
            const distances = drifts.map((d: any) => d.distance ?? 0);
            const ewmaRaw =
              distances.length > 0 ? wasm.compute_ewma(JSON.stringify(distances), alpha) : null;
            const ewmaResult = ewmaRaw
              ? typeof ewmaRaw === 'string'
                ? JSON.parse(ewmaRaw)
                : ewmaRaw
              : { trend: 'stable', last_value: 0, smoothed: [] };
            const trend = ewmaResult?.trend ?? 'stable';
            const ewmaValue = ewmaResult?.last_value ?? 0;
            result = {
              drifts_detected: driftCount,
              drift_points: drifts,
              trend,
              ewma: parseFloat(ewmaValue.toFixed(4)),
              interpretation:
                driftCount === 0
                  ? 'No concept drift detected in this log. The process appears stable across the observation period.'
                  : trend === 'rising'
                    ? `Concept drift detected — ${driftCount} drift point(s) found and the EWMA trend is rising (${ewmaValue.toFixed(3)}). The process is actively changing. Investigate the most recent drift points for root cause.`
                    : trend === 'falling'
                      ? `${driftCount} historical drift point(s) detected, but the process appears to be stabilizing (EWMA trend falling to ${ewmaValue.toFixed(3)}).`
                      : `${driftCount} drift point(s) detected. The EWMA is stable at ${ewmaValue.toFixed(3)}, suggesting historical change that has now plateaued.`,
              window_size: windowSize,
              alpha,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Feature Extraction
        case 'extract_case_features': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const features = (input.features as string[]) || [
              'trace_length',
              'activity_counts',
              'rework_count',
            ];
            const target = (input.target as string) || 'outcome';
            const configJson = JSON.stringify({ features, target });
            result = wasm.extract_case_features(
              logHandle,
              'concept:name',
              'time:timestamp',
              configJson
            );
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // ML Tools (native process intelligence — dynamic import for lazy loading)
        case 'ml_classify_traces': {
          const { classifyTraces } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const configJson = JSON.stringify({
              features: [
                'trace_length',
                'elapsed_time',
                'activity_counts',
                'rework_count',
                'unique_activities',
                'avg_inter_event_time',
              ],
              target: 'outcome',
            });
            const rawFeatures = wasm.extract_case_features(
              logHandle,
              'concept:name',
              'time:timestamp',
              configJson
            );
            const features =
              typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
            result = await classifyTraces(features, {
              method: (input.method as 'knn' | 'logistic_regression') || 'knn',
              k: (input.k as number) ?? 5,
            });
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'ml_cluster_traces': {
          const { clusterTraces } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const configJson = JSON.stringify({
              features: [
                'trace_length',
                'elapsed_time',
                'activity_counts',
                'rework_count',
                'unique_activities',
              ],
            });
            const rawFeatures = wasm.extract_case_features(
              logHandle,
              'concept:name',
              'time:timestamp',
              configJson
            );
            const features =
              typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
            result = await clusterTraces(features, {
              method: (input.method as 'kmeans' | 'dbscan') || 'kmeans',
              k: (input.k as number) ?? 3,
              eps: (input.eps as number) ?? 1.0,
            });
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'ml_forecast_throughput': {
          const { forecastThroughput } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const driftRaw = wasm.detect_drift(logHandle, 'concept:name', 5);
            const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
            const distances = (driftResult?.drifts ?? []).map(
              (d: { distance: number }) => d.distance ?? 0
            );
            result = await forecastThroughput(distances, {
              forecastPeriods: (input.forecast_periods as number) ?? 5,
            });
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'ml_detect_anomalies': {
          const { detectEnhancedAnomalies } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const driftRaw = wasm.detect_drift(logHandle, 'concept:name', 10);
            const driftResult = typeof driftRaw === 'string' ? JSON.parse(driftRaw) : driftRaw;
            const distances = (driftResult?.drifts ?? []).map(
              (d: { distance: number }) => d.distance ?? 0
            );
            result = await detectEnhancedAnomalies(distances);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'ml_regress_remaining_time': {
          const { regressRemainingTime } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const configJson = JSON.stringify({
              features: [
                'trace_length',
                'elapsed_time',
                'rework_count',
                'unique_activities',
                'avg_inter_event_time',
              ],
              target: 'remaining_time',
            });
            const rawFeatures = wasm.extract_case_features(
              logHandle,
              'concept:name',
              'time:timestamp',
              configJson
            );
            const features =
              typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
            result = await regressRemainingTime(features);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'ml_pca_reduce': {
          const { reduceFeaturesPCA } = await import('@wasm4pm/ml');
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const configJson = JSON.stringify({
              features: [
                'trace_length',
                'elapsed_time',
                'activity_counts',
                'rework_count',
                'unique_activities',
                'avg_inter_event_time',
              ],
            });
            const rawFeatures = wasm.extract_case_features(
              logHandle,
              'concept:name',
              'time:timestamp',
              configJson
            );
            const features =
              typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures;
            result = await reduceFeaturesPCA(features, {
              nComponents: (input.n_components as number) ?? 2,
            });
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Advanced Discovery
        case 'discover_dfg_simd': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const minFreq = (input.min_frequency as number) ?? 0;
            if (minFreq > 0) {
              result = wasm.discover_dfg_filtered(logHandle, 'concept:name', minFreq);
            } else {
              result = wasm.discover_dfg_simd(logHandle, 'concept:name');
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_dfg_hierarchical': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            // num_chunks replaces the old max_depth parameter in the schema
            const numChunks = (input.num_chunks as number) ?? (input.max_depth as number) ?? 3;
            result = wasm.discover_dfg_hierarchical(logHandle, 'concept:name', numChunks);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'streaming_log_estimate': {
          // Build a StreamingLog from the XES content by first loading the log,
          // extracting traces, then feeding them into the probabilistic streaming structure.
          // streaming_log_estimate_dfg() takes a StreamingLog handle (from create_streaming_log),
          // NOT an event log handle — they use separate handle spaces.
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const streamHandle = wasm.create_streaming_log();
          try {
            const sampleRate = (input.sample_rate as number) ?? 1.0;
            const rawTraces = wasm.get_traces(logHandle, 'concept:name');
            const traces: string[][] =
              typeof rawTraces === 'string'
                ? JSON.parse(rawTraces)
                : Array.isArray(rawTraces)
                  ? rawTraces
                  : [];
            for (const trace of traces) {
              if (sampleRate >= 1.0 || Math.random() < sampleRate) {
                wasm.streaming_log_add_trace(streamHandle, trace);
              }
            }
            result = wasm.streaming_log_estimate_dfg(streamHandle);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
            try {
              wasm.free_streaming_log(streamHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'smart_engine_run': {
          // smart_engine_run() takes a SmartEngine handle (created via smart_engine_create)
          // and a traces_json argument — it is NOT called with an event log handle.
          // We create a SmartEngine, run the algorithm against the loaded log's traces,
          // then destroy the engine.
          // NOTE: smart_engine_run only accepts 'dfg', 'optimized_dfg', 'heuristic_miner'.
          // The schema previously listed 'auto' as a valid value but it is not — default to 'dfg'.
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          let engineHandle: string | null = null;
          try {
            const requestedAlgo = (input.algorithm as string) || 'dfg';
            // Map legacy / alias names to valid smart_engine algorithm names
            const algoMap: Record<string, string> = {
              auto: 'dfg',
              heuristic: 'heuristic_miner',
              heuristics: 'heuristic_miner',
              optimized: 'optimized_dfg',
              alpha_plus_plus: 'dfg', // not supported; fall back to dfg
              genetic: 'dfg', // not supported; fall back to dfg
              ilp: 'dfg', // not supported; fall back to dfg
              inductive: 'dfg', // not supported; fall back to dfg
            };
            const algorithm = algoMap[requestedAlgo] ?? requestedAlgo;
            const rawTraces = wasm.get_traces(logHandle, 'concept:name');
            const tracesJson =
              typeof rawTraces === 'string' ? rawTraces : JSON.stringify(rawTraces);
            engineHandle = String(wasm.smart_engine_create());
            result = wasm.smart_engine_run(engineHandle, algorithm, tracesJson);
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
            if (engineHandle !== null) {
              try {
                wasm.smart_engine_destroy(engineHandle);
              } catch {
                /* best-effort */
              }
            }
          }
          break;
        }

        // Sequential Pattern Mining — van der Aalst Discovery perspective
        case 'mine_sequential_patterns': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const minSupport = (input.min_support as number) ?? 0.1;
            const patternLength = (input.pattern_length as number) ?? 2;
            const raw = wasm.mine_sequential_patterns(logHandle, actKey, minSupport, patternLength);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const patterns: Array<{ pattern: string[]; count: number; support: number }> =
              parsed?.patterns ?? [];
            const top = patterns[0];
            result = {
              pattern_length: patternLength,
              min_support: minSupport,
              patterns,
              interpretation:
                patterns.length === 0
                  ? `No sequential patterns of length ${patternLength} found with support >= ${(minSupport * 100).toFixed(0)}%. Try lowering min_support or reducing pattern_length.`
                  : top
                    ? `Found ${patterns.length} frequent pattern(s) of length ${patternLength}. Most common: [${top.pattern.join('→')}] appears in ${(top.support * 100).toFixed(1)}% of traces (${top.count} times). ${patterns.length > 1 ? `Second most common: [${patterns[1].pattern.join('→')}] at ${(patterns[1].support * 100).toFixed(1)}%.` : ''}`
                    : `${patterns.length} pattern(s) found.`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Resource and Intervention — van der Aalst 6th prediction perspective
        case 'estimate_queue_delay': {
          const arrivalRate = input.arrival_rate as number;
          const serviceRate = input.service_rate as number;
          const raw = wasm.estimate_queue_delay(arrivalRate, serviceRate);
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const waitTime: number = parsed?.wait_time ?? 0;
          const utilization: number = parsed?.utilization ?? 0;
          const isStable: boolean = parsed?.is_stable ?? false;
          result = {
            wait_time: parseFloat(waitTime.toFixed(4)),
            utilization: parseFloat(utilization.toFixed(4)),
            is_stable: isStable,
            interpretation: isStable
              ? `Queue is stable (utilization ${(utilization * 100).toFixed(1)}%). Expected wait time: ${waitTime.toFixed(2)} time units. At utilization above 80%, delays grow rapidly — consider adding capacity if utilization exceeds 0.8.`
              : `Queue is UNSTABLE (arrival rate ${arrivalRate} >= service rate ${serviceRate}). Tasks accumulate without bound. You must increase service capacity or reduce arrival rate to stabilize the process.`,
          };
          break;
        }

        case 'rank_interventions': {
          const interventions = input.interventions as Array<{ name: string; utility: number }>;
          const exploitationWeight = (input.exploitation_weight as number) ?? 0.7;
          const interventionsJson = JSON.stringify(interventions);
          const raw = wasm.rank_interventions(interventionsJson, exploitationWeight);
          const ranked = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const rankedList: Array<{ name: string; score: number; rank: number }> = Array.isArray(
            ranked
          )
            ? ranked
            : (ranked?.interventions ?? []);
          const top = rankedList[0];
          result = {
            ranked_interventions: rankedList,
            exploitation_weight: exploitationWeight,
            interpretation:
              rankedList.length === 0
                ? 'No interventions to rank.'
                : `Recommended intervention: "${top?.name}" (score: ${top?.score?.toFixed(3)}). ${rankedList.length} candidates ranked with exploitation_weight=${exploitationWeight}. Higher weight favors the highest-utility option; lower weight increases exploration.`,
          };
          break;
        }

        case 'select_intervention': {
          const banditState = input.bandit_state as {
            arms: Array<{ name: string; total_reward: number; pull_count: number }>;
            total_pulls: number;
          };
          const explorationFactor = (input.exploration_factor as number) ?? 1.414;
          const banditJson = JSON.stringify(banditState);
          const raw = wasm.select_intervention(banditJson, explorationFactor);
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const selected: string = parsed?.selected ?? '';
          const ucbScore: number = parsed?.ucb_score ?? 0;
          const meanReward: number = parsed?.mean_reward ?? 0;
          const explorationBonus: number = parsed?.exploration_bonus ?? 0;
          result = {
            selected,
            ucb_score: parseFloat(ucbScore.toFixed(4)),
            mean_reward: parseFloat(meanReward.toFixed(4)),
            exploration_bonus: parseFloat(explorationBonus.toFixed(4)),
            total_pulls: banditState.total_pulls,
            interpretation: selected
              ? `UCB1 selects intervention "${selected}" (UCB score: ${ucbScore.toFixed(3)} = mean reward ${meanReward.toFixed(3)} + exploration bonus ${explorationBonus.toFixed(3)}). After observing the outcome, update this arm's total_reward and pull_count before the next call.`
              : 'No intervention selected. Ensure bandit_state has at least one arm.',
          };
          break;
        }

        // Resource perspective — Social Network Mining
        case 'discover_handover_network': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const resourceKey = (input.resource_key as string) ?? 'org:resource';
            const raw = wasm.discover_handover_network(logHandle, resourceKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const nodes: Array<{ id: string; label: string }> = parsed?.nodes ?? [];
            const edges: Array<{ from: string; to: string; weight: number }> = parsed?.edges ?? [];
            const topEdge = edges.slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
            result = {
              nodes,
              edges,
              node_count: nodes.length,
              edge_count: edges.length,
              interpretation:
                nodes.length === 0
                  ? `No handover network found. Verify the resource_key parameter is "${resourceKey}" and that events in this log include that attribute.`
                  : topEdge
                    ? `Handover-of-work network has ${nodes.length} resource(s) and ${edges.length} handoff edge(s). Most frequent handoff: ${topEdge.from} → ${topEdge.to} (${topEdge.weight} time${topEdge.weight !== 1 ? 's' : ''}). Resources with many outgoing edges are handoff sources; those with many incoming edges are receiving bottlenecks.`
                    : `${nodes.length} resource(s) found, ${edges.length} handoff edge(s).`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'discover_working_together_network': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const resourceKey = (input.resource_key as string) ?? 'org:resource';
            const raw = wasm.discover_working_together_network(logHandle, resourceKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const nodes: Array<{ id: string; label: string }> = parsed?.nodes ?? [];
            const edges: Array<{ from: string; to: string; co_occurrences: number }> =
              parsed?.edges ?? [];
            const topEdge = edges
              .slice()
              .sort((a, b) => (b.co_occurrences ?? 0) - (a.co_occurrences ?? 0))[0];
            result = {
              nodes,
              edges,
              node_count: nodes.length,
              edge_count: edges.length,
              interpretation:
                nodes.length === 0
                  ? `No working-together network found. Verify the resource_key parameter is "${resourceKey}" and that events include that attribute.`
                  : topEdge
                    ? `Working-together network has ${nodes.length} resource(s) and ${edges.length} collaboration edge(s). Most frequent collaboration: ${topEdge.from} and ${topEdge.to} worked together on ${topEdge.co_occurrences} case(s). Resources with the most edges are central collaborators; isolated resources may be working in silos.`
                    : `${nodes.length} resource(s) found, ${edges.length} collaboration edge(s).`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Enhancement perspective — rework detection
        case 'detect_rework': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const raw = wasm.detect_rework(logHandle, actKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const reworkByActivity: Array<{ activity: string; count: number }> =
              parsed?.rework_by_activity ?? [];
            const tracesWithRework: number = parsed?.traces_with_rework ?? 0;
            const reworkPct: number = parsed?.rework_percentage ?? 0;
            const totalInstances: number = parsed?.total_rework_instances ?? 0;
            const topRework = reworkByActivity
              .slice()
              .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
            result = {
              rework_by_activity: reworkByActivity,
              traces_with_rework: tracesWithRework,
              rework_percentage:
                typeof reworkPct === 'number' ? parseFloat(reworkPct.toFixed(2)) : 0,
              total_rework_instances: totalInstances,
              interpretation:
                tracesWithRework === 0
                  ? 'No rework detected. Every activity appears at most once in each case.'
                  : topRework
                    ? `Rework detected in ${tracesWithRework} case(s) (${typeof reworkPct === 'number' ? (reworkPct * 100).toFixed(1) : '?'}% of traces). Most repeated activity: "${topRework.activity}" (${topRework.count} extra occurrences). Rework indicates upstream quality issues — consider root-cause analysis on cases that repeat "${topRework.activity}".`
                    : `Rework found in ${tracesWithRework} case(s) with ${totalInstances} total rework event(s).`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // LLM-readable text encodings
        case 'encode_variants_as_text': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const topN = (input.top_n as number) ?? 10;
            const raw = wasm.encode_variants_as_text(logHandle, actKey, topN);
            result = { text: typeof raw === 'string' ? raw : String(raw) };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'encode_statistics_as_text': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const raw = wasm.encode_statistics_as_text(logHandle);
            result = { text: typeof raw === 'string' ? raw : String(raw) };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Beam search — full path prediction
        case 'predict_beam_paths': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const n = (input.n as number) ?? 2;
            const k = (input.k as number) ?? 3;
            const depth = (input.depth as number) ?? 5;
            const predictorHandle = wasm.build_ngram_predictor(logHandle, actKey, n);
            try {
              const prefixJson = JSON.stringify(input.prefix as string[]);
              const raw = wasm.predict_beam_paths(String(predictorHandle), prefixJson, k, depth);
              const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const paths: Array<{ sequence: string[]; probability: number; length: number }> =
                Array.isArray(parsed) ? parsed : (parsed?.paths ?? []);
              const prefix = input.prefix as string[];
              const top = paths[0];
              result = {
                paths,
                interpretation:
                  paths.length === 0
                    ? `No beam paths found for prefix [${prefix.join('→')}]. The prefix may not appear in the training log. Try a shorter prefix or check the activity_key parameter.`
                    : top
                      ? `Top predicted path: [${top.sequence.join('→')}] (probability ${(top.probability * 100).toFixed(1)}%). Found ${paths.length} candidate path(s) from prefix [${prefix.join('→')}] using ${n}-gram beam search with depth ${depth}.`
                      : `${paths.length} path(s) predicted.`,
                prefix,
                n_gram_order: n,
                beam_width: k,
                max_depth: depth,
              };
            } finally {
              try {
                wasm.delete_object(String(predictorHandle));
              } catch {
                /* best-effort */
              }
            }
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Process boundary analysis — start and end activities
        case 'analyze_start_end_activities': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const raw = wasm.analyze_start_end_activities(logHandle, actKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const startActs: Array<{ activity: string; count: number }> =
              parsed?.start_activities ?? [];
            const endActs: Array<{ activity: string; count: number }> =
              parsed?.end_activities ?? [];
            const pairs: Array<{ start: string; end: string; count: number }> =
              parsed?.start_end_pairs ?? [];
            const topStart = startActs[0];
            const topEnd = endActs[0];
            result = {
              start_activities: startActs,
              end_activities: endActs,
              start_end_pairs: pairs,
              interpretation:
                startActs.length === 0
                  ? 'No activities found. Verify the activity_key parameter.'
                  : `Process has ${startActs.length} distinct start activity(ies) and ${endActs.length} distinct end activity(ies). Most common start: "${topStart?.activity}" (${topStart?.count} traces). Most common end: "${topEnd?.activity}" (${topEnd?.count} traces).${pairs.length > 0 ? ` Most frequent start→end pair: "${pairs[0].start}" → "${pairs[0].end}" (${pairs[0].count} traces).` : ''}`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Social Network Analysis — advanced metrics (handlers were previously missing)
        case 'compute_network_metrics': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const resourceKey = (input.resource_key as string) ?? 'org:resource';
            const raw = wasm.compute_network_metrics(logHandle, resourceKey);
            result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'compute_clustering_coefficient': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const resourceKey = (input.resource_key as string) ?? 'org:resource';
            const raw = wasm.compute_clustering_coefficient(logHandle, resourceKey);
            result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        case 'detect_communities': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const resourceKey = (input.resource_key as string) ?? 'org:resource';
            const raw = wasm.detect_communities(logHandle, resourceKey);
            result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Registry
        case 'get_capability_registry': {
          result = wasm.get_capability_registry();
          break;
        }

        // Cache management
        case 'clear_caches': {
          wasm.clear_all_caches();
          result = { status: 'ok', message: 'All caches cleared' };
          break;
        }

        case 'cache_stats': {
          const rawStats = wasm.get_cache_stats();
          result = typeof rawStats === 'string' ? JSON.parse(rawStats) : rawStats;
          break;
        }

        // SIMD conformance
        case 'simd_replay': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) || 'concept:name';
            const rawReplay = wasm.simd_token_replay(logHandle, actKey);
            result = typeof rawReplay === 'string' ? JSON.parse(rawReplay) : rawReplay;
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Process Discovery — Alpha Miner footprint matrix (T001)
        case 'discover_alpha_footprints': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const raw = wasm.discover_footprints(logHandle, actKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            // Tally relation types across the matrix
            const matrix: string[][] = parsed?.matrix ?? [];
            const activities: string[] = parsed?.activities ?? [];
            let causalPairs = 0;
            let parallelPairs = 0;
            let neverFollowPairs = 0;
            let loopL1 = 0;
            for (let i = 0; i < matrix.length; i++) {
              for (let j = 0; j < (matrix[i]?.length ?? 0); j++) {
                const rel = matrix[i]?.[j];
                if (rel === '>' || rel === 'causal') causalPairs++;
                else if (rel === '||' || rel === 'parallel') parallelPairs++;
                else if (rel === '#' || rel === 'never') neverFollowPairs++;
                // Self-loop on diagonal = length-1 loop
                if (i === j && (rel === '>' || rel === 'causal')) loopL1++;
              }
            }
            const loopL2: number = parsed?.loop_count_l2 ?? 0;
            result = {
              activities,
              matrix,
              causal_pairs: causalPairs,
              parallel_pairs: parallelPairs,
              never_follow_pairs: neverFollowPairs,
              loop_count_l1: loopL1,
              loop_count_l2: loopL2,
              interpretation:
                activities.length === 0
                  ? 'No activities found in the log. Verify the activity_key parameter.'
                  : `Alpha footprint computed over ${activities.length} activities. Found ${causalPairs} causal pair(s) (A→B), ${parallelPairs} parallel pair(s) (A||B), and ${neverFollowPairs} never-follow pair(s) (#). ${loopL1 > 0 ? `${loopL1} length-1 loop(s) detected.` : 'No length-1 loops.'} ${loopL2 > 0 ? `${loopL2} length-2 loop(s) detected.` : ''}`.trim(),
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Conformance Checking — DFG token-replay fitness (T002)
        case 'compute_conformance_fitness': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          try {
            const actKey = (input.activity_key as string) ?? 'concept:name';
            const rawReplay = wasm.simd_token_replay(logHandle, actKey);
            const replayResult = typeof rawReplay === 'string' ? JSON.parse(rawReplay) : rawReplay;
            const fitness: number = replayResult?.fitness ?? replayResult?.avg_fitness ?? 0;
            const precision: number = replayResult?.precision ?? replayResult?.avg_precision ?? 0;
            const testedTraces: number =
              replayResult?.trace_count ?? replayResult?.total_traces ?? 0;
            const conformingTraces: number =
              replayResult?.conforming_traces ?? Math.round(fitness * testedTraces);
            const qualityLabel: 'good' | 'partial' | 'poor' =
              fitness >= 0.8 ? 'good' : fitness >= 0.5 ? 'partial' : 'poor';
            const qualityDesc =
              qualityLabel === 'good'
                ? 'Good fit — the log closely follows the discovered process model.'
                : qualityLabel === 'partial'
                  ? 'Partial fit — the log deviates from the model in some cases. Review variant analysis for deviations.'
                  : 'Poor fit — the log diverges significantly from the discovered process model. Expect frequent deviations or noise.';
            result = {
              fitness: parseFloat(fitness.toFixed(4)),
              precision: parseFloat(precision.toFixed(4)),
              tested_traces: testedTraces,
              conforming_traces: conformingTraces,
              quality_label: qualityLabel,
              interpretation: `Token-replay fitness: ${(fitness * 100).toFixed(1)}% over ${testedTraces} trace(s). ${qualityDesc}`,
            };
          } finally {
            try {
              wasm.delete_object(logHandle);
            } catch {
              /* best-effort */
            }
          }
          break;
        }

        // Resource and intervention — WASM backend health (T003)
        case 'check_backend_health': {
          const forceReinit = (input.force_reinit as boolean) ?? false;
          let ready = true;
          let version = 'unknown';
          let features: unknown = {};
          let cacheStats: unknown = {};

          try {
            version = wasm.get_version();
          } catch {
            ready = false;
          }

          try {
            const rawCaps = wasm.get_capabilities();
            features = typeof rawCaps === 'string' ? JSON.parse(rawCaps) : rawCaps;
          } catch {
            ready = false;
          }

          try {
            const rawCache = wasm.get_cache_stats();
            cacheStats = typeof rawCache === 'string' ? JSON.parse(rawCache) : rawCache;
          } catch (e) {
            // Cache stats failure may indicate un-initialized state — attempt init
            ready = false;
          }

          if (forceReinit || !ready) {
            try {
              wasm.init();
              ready = true;
              // Re-fetch cache stats after init
              const rawCache = wasm.get_cache_stats();
              cacheStats = typeof rawCache === 'string' ? JSON.parse(rawCache) : rawCache;
            } catch {
              ready = false;
            }
          }

          // get_capabilities() returns { version, features: { conformance, ml, ... } }
          // The feature flags live under the nested 'features' key.
          const caps = features as Record<string, unknown>;
          const featureFlags = (caps?.features ?? caps) as Record<string, unknown>;
          const conformanceReady = featureFlags?.conformance ?? featureFlags?.token_replay ?? false;
          const mlReady = featureFlags?.ml ?? featureFlags?.machine_learning ?? false;

          result = {
            ready,
            version,
            features,
            cache_stats: cacheStats,
            backend_id: 'wasm',
            interpretation: ready
              ? `WASM backend is initialized and ready. Version ${version}. Conformance: ${String(conformanceReady)}. ML: ${String(mlReady)}.`
              : `WASM backend is NOT ready. Version reported as "${version}". Call with force_reinit: true to attempt reinitialization.`,
          };
          break;
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Classify the error to give actionable guidance
      let guidance = '';
      if (
        msg.includes('XES') ||
        msg.includes('parse') ||
        msg.includes('UTF') ||
        msg.includes('unexpected token')
      ) {
        guidance =
          ' The xes_content may be malformed. Verify it is valid XES XML starting with <?xml...> or <log...>.';
      } else if (
        msg.includes('handle') ||
        msg.includes('not found') ||
        msg.includes('invalid handle')
      ) {
        guidance =
          ' A handle argument may be invalid or already freed. Ensure ocel_handle or model handles come from the corresponding load_* tool in the same session.';
      } else if (msg.includes('undefined') || msg.includes('null')) {
        guidance =
          ' An argument may be missing or of the wrong type. Check that all required fields match the inputSchema.';
      } else if (msg.includes('memory') || msg.includes('oom') || msg.includes('allocation')) {
        guidance =
          ' The event log may be too large for the current WASM memory limit. Try a smaller log or use streaming_log_estimate instead.';
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: msg,
                tool: toolName,
                guidance:
                  guidance.trim() ||
                  'Check that all required inputs are present and correctly formatted.',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Compare multiple algorithms on the same log
   */
  private compareAlgorithms(logHandle: string, algorithms: string[]) {
    const results: Record<string, unknown> = {};

    for (const algo of algorithms) {
      try {
        const start = performance.now();
        let modelHandle: string;

        switch (algo) {
          case 'dfg': {
            const r = wasm.discover_dfg(logHandle, 'concept:name');
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'alpha_plus_plus': {
            const r = wasm.discover_alpha_plus_plus(logHandle, 'concept:name', 0.1);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'genetic': {
            const r = wasm.discover_genetic_algorithm(logHandle, 'concept:name', 50, 50);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'ilp': {
            const r = wasm.discover_ilp_petri_net(logHandle, 'concept:name');
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'pso': {
            const r = wasm.discover_pso_algorithm(logHandle, 'concept:name', 30, 50);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'a_star': {
            const r = wasm.discover_astar(logHandle, 'concept:name', 1000);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'declare': {
            const r = wasm.discover_declare(logHandle, 'concept:name');
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'heuristic': {
            // dependency_threshold: 0.3 is safe for real logs; 0.8 filters almost everything
            const r = wasm.discover_heuristic_miner(logHandle, 'concept:name', 0.3);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'inductive': {
            const r = wasm.discover_inductive_miner(logHandle, 'concept:name');
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'hill_climbing': {
            const r = wasm.discover_hill_climbing(logHandle, 'concept:name');
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'ant_colony': {
            const r = wasm.discover_ant_colony(logHandle, 'concept:name', 20, 10);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'simulated_annealing': {
            const r = wasm.discover_simulated_annealing(logHandle, 'concept:name', 100.0, 0.95);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          case 'process_skeleton': {
            const r = wasm.extract_process_skeleton(logHandle, 'concept:name', 2);
            modelHandle = typeof r === 'object' && r?.handle ? r.handle : String(r);
            break;
          }
          default:
            throw new Error(`Unknown algorithm: ${algo}`);
        }

        const time = performance.now() - start;
        results[algo] = {
          time_ms: Math.round(time * 100) / 100,
          model_handle: modelHandle,
          success: true,
        };
      } catch (e) {
        results[algo] = {
          success: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    return results;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.server.connect(this.transport);
    console.error('wasm4pm MCP server started');
  }
}

/**
 * Entry point for MCP server
 */
async function main(): Promise<void> {
  const server = new Wasm4pmMCPServer();
  await server.start();
}

if (require.main === module) {
  main().catch(console.error);
}

export default Wasm4pmMCPServer;
