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
 * Wasm4pm MCP Server
 *
 * Provides MCP interface to wasm4pm functionality including:
 * - Process discovery (14 algorithms)
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
          'Discover a Directly-Follows Graph (DFG) process model. Fastest algorithm, good for quick overviews.',
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
          'Check if event log conforms to a process model. Returns fitness, precision, and deviations.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            model_json: {
              type: 'string',
              description: 'Process model as JSON (Petri Net handle or serialized model)',
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
      {
        name: 'detect_concept_drift',
        description:
          'Detect if and where the process changes over time (concept drift) using Jaccard-window analysis. Returns drift points with positions and distances. Claude uses this to answer "Has this process changed over time?"',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            window_size: {
              type: 'number',
              description: 'Number of traces per sliding window. Default: 5',
            },
          },
          required: ['xes_content'],
        },
      },
      // Visualization
      {
        name: 'encode_dfg_as_text',
        description:
          'Discover a DFG and encode it as LLM-readable text. Describes activities, edge paths with frequencies.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content (a DFG will be discovered first)',
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
                'Algorithms to compare. Options: dfg, alpha_plus_plus, genetic, ilp, pso, a_star, declare, heuristic, inductive, hill_climbing, ant_colony, simulated_annealing, process_skeleton',
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
      // Registry
      {
        name: 'get_capability_registry',
        description: 'Get the complete catalog of all wasm4pm functions organized by category.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
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
          const minFreq = (input.min_frequency as number) ?? 0;
          if (minFreq > 0) {
            result = wasm.discover_dfg_filtered(logHandle, 'concept:name', minFreq);
          } else {
            result = wasm.discover_dfg(logHandle, 'concept:name');
          }
          break;
        }

        case 'discover_alpha_plus_plus': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          result = wasm.discover_alpha_plus_plus(logHandle, 'concept:name', 0.1);
          break;
        }

        case 'discover_ilp_optimization': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          result = wasm.discover_ilp_petri_net(logHandle, 'concept:name');
          break;
        }

        case 'discover_genetic_algorithm': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const popSize = (input.population_size as number) ?? 50;
          const generations = (input.generations as number) ?? 100;
          result = wasm.discover_genetic_algorithm(logHandle, 'concept:name', popSize, generations);
          break;
        }

        case 'discover_variants': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          result = wasm.analyze_trace_variants(logHandle, 'concept:name');
          break;
        }

        // Analysis
        case 'check_conformance': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const netHandle = input.model_json as string;
          result = wasm.check_token_based_replay(logHandle, netHandle, 'concept:name');
          break;
        }

        case 'analyze_statistics': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          result = wasm.analyze_event_statistics(logHandle);
          break;
        }

        case 'detect_bottlenecks': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const threshold = BigInt((input.threshold as number) ?? 3600);
          result = wasm.detect_bottlenecks(logHandle, 'concept:name', 'time:timestamp', threshold);
          break;
        }

        case 'detect_concept_drift': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const windowSize = (input.window_size as number) ?? 5;
          result = wasm.detect_drift(logHandle, 'concept:name', windowSize);
          break;
        }

        // Visualization / text encoding
        case 'encode_dfg_as_text': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const dfgResult = wasm.discover_dfg(logHandle, 'concept:name');
          const dfgHandle =
            typeof dfgResult === 'object' && dfgResult?.handle
              ? dfgResult.handle
              : String(dfgResult);
          result = wasm.encode_dfg_as_text(dfgHandle);
          break;
        }

        // Utilities
        case 'compare_algorithms': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const algorithms = (input.algorithms as string[]) || [
            'dfg',
            'alpha_plus_plus',
            'genetic',
          ];
          result = this.compareAlgorithms(logHandle, algorithms);
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

        // Predictive Process Mining
        case 'predict_next_activity': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const n = (input.n as number) ?? 2;
          const k = (input.k as number) ?? 5;
          const predictorHandle = wasm.build_ngram_predictor(logHandle, 'concept:name', n);
          const prefixJson = JSON.stringify(input.prefix as string[]);
          result = wasm.predict_next_k(String(predictorHandle), prefixJson, k);
          break;
        }

        case 'predict_case_duration': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const modelHandle = wasm.build_remaining_time_model(logHandle, 'concept:name', 'time:timestamp');
          const prefixJson = JSON.stringify(input.prefix as string[]);
          result = wasm.predict_case_duration(String(modelHandle), prefixJson);
          break;
        }

        case 'score_trace_anomaly': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
          const dfgHandle = wasm.discover_dfg_handle(logHandle, 'concept:name');
          const traceJson = JSON.stringify(input.trace as string[]);
          result = wasm.score_trace_anomaly(String(dfgHandle), traceJson);
          break;
        }

        // Feature Extraction
        case 'extract_case_features': {
          const logHandle = wasm.load_eventlog_from_xes(input.xes_content as string);
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
          break;
        }

        // Registry
        case 'get_capability_registry': {
          result = wasm.get_capability_registry();
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
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
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
            const r = wasm.discover_heuristic_miner(logHandle, 'concept:name', 0.5);
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
