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
  TextContent,
  ToolResultBlockParam,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as wasm4pm from './client.js';

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
      return this.executeTool(request.params.name, request.params.arguments);
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
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
          type: 'object',
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            model_json: {
              type: 'string',
              description: 'Process model as JSON',
            },
            include_deviations: {
              type: 'boolean',
              description: 'Include detailed deviation information. Default: true',
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
          type: 'object',
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
          type: 'object',
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            threshold: {
              type: 'number',
              description: 'Threshold percentile (0-1). Default: 0.75 (top 25%)',
            },
          },
          required: ['xes_content'],
        },
      },
      {
        name: 'detect_concept_drift',
        description: 'Detect if the process changes over time (concept drift).',
        inputSchema: {
          type: 'object',
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            window_size: {
              type: 'number',
              description: 'Window size for drift detection. Default: 100',
            },
          },
          required: ['xes_content'],
        },
      },
      // Visualization
      {
        name: 'generate_mermaid_diagram',
        description: 'Generate Mermaid diagram of process model. Can be visualized at mermaid.live',
        inputSchema: {
          type: 'object',
          properties: {
            model_json: {
              type: 'string',
              description: 'Process model as JSON',
            },
          },
          required: ['model_json'],
        },
      },
      {
        name: 'generate_html_report',
        description: 'Generate comprehensive HTML report with statistics, model, and analysis.',
        inputSchema: {
          type: 'object',
          properties: {
            xes_content: {
              type: 'string',
              description: 'XES event log content',
            },
            model_json: {
              type: 'string',
              description: 'Process model as JSON',
            },
          },
          required: ['xes_content', 'model_json'],
        },
      },
      // Utilities
      {
        name: 'compare_algorithms',
        description:
          'Compare multiple discovery algorithms on the same event log. Returns fitness and execution time for each.',
        inputSchema: {
          type: 'object',
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
              default: ['dfg', 'alpha_plus_plus', 'genetic'],
            },
          },
          required: ['xes_content'],
        },
      },
    ];
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(toolName: string, input: ToolInput): Promise<ToolResultBlockParam> {
    try {
      // Initialize wasm4pm if needed
      await wasm4pm.init();

      let result: unknown;

      switch (toolName) {
        // Discovery algorithms
        case 'discover_dfg': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.discoverDFG(log);
          break;
        }

        case 'discover_alpha_plus_plus': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.discoverAlphaPlusPlus(log);
          break;
        }

        case 'discover_ilp_optimization': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.discoverILPOptimization(log, {
            timeout: input.timeout_ms as number | undefined,
          });
          break;
        }

        case 'discover_genetic_algorithm': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.discoverGeneticAlgorithm(log, {
            populationSize: input.population_size as number | undefined,
            generations: input.generations as number | undefined,
          });
          break;
        }

        case 'discover_variants': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.discoverVariants(log);
          break;
        }

        // Analysis
        case 'check_conformance': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          const model = JSON.parse(input.model_json as string);
          result = wasm4pm.checkConformance(log, model, {
            includeDeviations: input.include_deviations as boolean | undefined,
          });
          break;
        }

        case 'analyze_statistics': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.analyzeEventStatistics(log);
          break;
        }

        case 'detect_bottlenecks': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.detectBottlenecks(log, {
            threshold: input.threshold as number | undefined,
          });
          break;
        }

        case 'detect_concept_drift': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          result = wasm4pm.detectConceptDrift(log, {
            windowSize: input.window_size as number | undefined,
          });
          break;
        }

        // Visualization
        case 'generate_mermaid_diagram': {
          const model = JSON.parse(input.model_json as string);
          result = wasm4pm.generateMermaidDiagram(model);
          break;
        }

        case 'generate_html_report': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          const model = JSON.parse(input.model_json as string);
          result = wasm4pm.generateHTMLReport(log, model);
          break;
        }

        // Utilities
        case 'compare_algorithms': {
          const log = wasm4pm.loadEventLogFromXES(input.xes_content as string);
          const algorithms = (input.algorithms as string[]) || [
            'dfg',
            'alpha_plus_plus',
            'genetic',
          ];
          result = await this.compareAlgorithms(log, algorithms);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        type: 'tool_result',
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        type: 'tool_result',
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
  private async compareAlgorithms(logHandle: string, algorithms: string[]) {
    const results: Record<string, unknown> = {};

    for (const algo of algorithms) {
      try {
        const start = performance.now();
        let model: unknown;

        switch (algo) {
          case 'dfg':
            model = wasm4pm.discoverDFG(logHandle);
            break;
          case 'alpha_plus_plus':
            model = wasm4pm.discoverAlphaPlusPlus(logHandle);
            break;
          case 'genetic':
            model = wasm4pm.discoverGeneticAlgorithm(logHandle, {
              generations: 50,
            });
            break;
          case 'ilp':
            model = wasm4pm.discoverILPOptimization(logHandle, {
              timeout: 5000,
            });
            break;
          case 'pso':
            model = wasm4pm.discoverParticleSwarmOptimization(logHandle);
            break;
          case 'a_star':
            model = wasm4pm.discoverAStarSearch(logHandle);
            break;
          case 'declare':
            model = wasm4pm.discoverDeclare(logHandle);
            break;
          case 'heuristic':
            model = wasm4pm.discoverHeuristicMiner(logHandle);
            break;
          case 'inductive':
            model = wasm4pm.discoverInductiveMiner(logHandle);
            break;
          case 'hill_climbing':
            model = wasm4pm.discoverHillClimbing(logHandle);
            break;
          case 'ant_colony':
            model = wasm4pm.discoverAntColonyOptimization(logHandle);
            break;
          case 'simulated_annealing':
            model = wasm4pm.discoverSimulatedAnnealing(logHandle);
            break;
          case 'process_skeleton':
            model = wasm4pm.discoverProcessSkeleton(logHandle);
            break;
          default:
            throw new Error(`Unknown algorithm: ${algo}`);
        }

        const time = performance.now() - start;
        const conformance = wasm4pm.checkConformance(logHandle, model as never);

        results[algo] = {
          time_ms: Math.round(time * 100) / 100,
          fitness: Math.round((conformance.fitness || 0) * 10000) / 10000,
          precision: Math.round((conformance.precision || 0) * 10000) / 10000,
          generalization: Math.round((conformance.generalization || 0) * 10000) / 10000,
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
