#!/usr/bin/env node
/**
 * mcp-server.ts — wasm4pm Swarm MCP Server
 *
 * Exposes 10 `swarm__` prefixed tools via stdio MCP transport.
 * Workers are logical in-process units; no child processes are spawned.
 *
 * Usage (from ostar/.mcp.json):
 *   { "command": "node", "args": ["/path/to/packages/swarm/dist/mcp-server.js"] }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

import {
  spawnWorker,
  getWorker,
  listWorkers,
  storeResult,
  getResult,
  dissolveWorkers,
  getSwarmId,
  getEpisodeCount,
  incrementEpisodeCount,
  setWorkerStatus,
} from './worker-registry.js'
import { checkConvergence, hashOutput } from './convergence.js'
import { aggregate } from './aggregation.js'
import { sendDirective } from './directive-bus.js'
import type { WorkerResult } from './types.js'

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const SpawnWorkerInput = z.object({
  worker_id: z.string().describe('Unique worker name, e.g. "worker-alpha"'),
  xes_content: z.string().describe('XES event log content to bind to this worker'),
  label: z.string().optional().describe('Human label for display in swarm status'),
})

const ListWorkersInput = z.object({
  filter_status: z.enum(['ready', 'running', 'done', 'error']).optional(),
})

const RunWorkerInput = z.object({
  worker_id: z.string().describe('Target worker ID'),
  algorithm: z.enum([
    'dfg', 'alpha_plus_plus', 'inductive', 'heuristic',
    'detect_drift', 'analyze_statistics', 'extract_features',
  ]).describe('Analysis to run'),
  params: z.record(z.unknown()).optional().describe('Algorithm-specific params'),
})

const RunAllInput = z.object({
  algorithm: z.enum([
    'dfg', 'alpha_plus_plus', 'inductive', 'heuristic',
    'detect_drift', 'analyze_statistics',
  ]),
  params: z.record(z.unknown()).optional(),
  worker_ids: z.array(z.string()).optional().describe('Subset of workers to run; omit for all'),
})

const GetWorkerResultInput = z.object({
  worker_id: z.string(),
  algorithm: z.string().optional(),
})

const AggregateInput = z.object({
  algorithm: z.enum(['dfg', 'analyze_statistics', 'detect_drift']),
  strategy: z.enum(['union', 'intersection', 'majority_vote', 'weighted_avg']).default('union'),
  worker_ids: z.array(z.string()).optional(),
})

const CheckConvergenceInput = z.object({
  algorithm: z.string(),
  threshold: z.number().min(0).max(1).default(1.0).describe(
    'Agreement fraction required (1.0 = unanimous, 0.8 = 80% quorum)'
  ),
  worker_ids: z.array(z.string()).optional(),
})

const SendDirectiveInput = z.object({
  target: z.union([z.string(), z.literal('*')]).describe('Worker ID or "*" to broadcast'),
  directive: z.object({
    type: z.enum(['run', 'stop', 'rerun', 'update_log', 'annotate']),
    payload: z.record(z.unknown()).optional(),
    from: z.string().optional(),
  }),
})

const GetSwarmStatusInput = z.object({
  include_results: z.boolean().default(false).describe(
    'Include full result payloads; false returns hashes only'
  ),
})

const DissolveInput = z.object({
  worker_ids: z.array(z.string()).optional().describe('Omit to dissolve entire swarm'),
  reason: z.string().optional(),
})

// ── Run single worker (direct WASM-like simulation via stored XES) ──────────

async function runAlgorithmOnWorker(
  workerId: string,
  algorithm: string,
  params: Record<string, unknown> = {}
): Promise<WorkerResult> {
  const worker = getWorker(workerId)
  if (!worker) throw new Error(`Worker not found: ${workerId}`)

  setWorkerStatus(workerId, 'running')
  const startTime = Date.now()

  // Compute a deterministic result hash from XES content + algorithm + params
  // In production this would call the wasm4pm WASM module directly.
  // Here we produce a stable placeholder that can be replaced with real WASM calls.
  const resultData = {
    algorithm,
    params,
    logHash: worker.logHash,
    // Stable placeholder — real impl calls wasm module:
    nodes: [{ id: `${algorithm}_start`, label: 'Start' }, { id: `${algorithm}_end`, label: 'End' }],
    edges: [{ source: `${algorithm}_start`, target: `${algorithm}_end`, weight: 1 }],
  }
  const resultHash = hashOutput(resultData)

  const result: WorkerResult = {
    workerId,
    algorithmId: algorithm,
    resultHash,
    result: resultData,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  }

  storeResult(workerId, result)
  return result
}

// ── MCP Server ───────────────────────────────────────────────────────────────

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(message: string): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true }
}

const server = new Server(
  { name: 'wasm4pm-swarm', version: '26.4.6' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'spawn_worker',
      description: 'Register a named logical worker bound to an XES event log. No process spawning — workers are in-process.',
      inputSchema: { type: 'object', properties: { worker_id: { type: 'string' }, xes_content: { type: 'string' }, label: { type: 'string' } }, required: ['worker_id', 'xes_content'] },
    },
    {
      name: 'list_workers',
      description: 'Enumerate all registered workers and their current status.',
      inputSchema: { type: 'object', properties: { filter_status: { type: 'string', enum: ['ready', 'running', 'done', 'error'] } } },
    },
    {
      name: 'run_worker',
      description: 'Execute one algorithm on a specific worker\'s event log.',
      inputSchema: { type: 'object', properties: { worker_id: { type: 'string' }, algorithm: { type: 'string' }, params: { type: 'object' } }, required: ['worker_id', 'algorithm'] },
    },
    {
      name: 'run_all',
      description: 'Fan-out one algorithm across all (or a subset of) workers. unique_hashes.length === 1 means full convergence.',
      inputSchema: { type: 'object', properties: { algorithm: { type: 'string' }, params: { type: 'object' }, worker_ids: { type: 'array', items: { type: 'string' } } }, required: ['algorithm'] },
    },
    {
      name: 'get_worker_result',
      description: 'Retrieve stored result(s) for a worker without re-running.',
      inputSchema: { type: 'object', properties: { worker_id: { type: 'string' }, algorithm: { type: 'string' } }, required: ['worker_id'] },
    },
    {
      name: 'aggregate',
      description: 'Merge results across workers for a given algorithm using union/intersection/majority_vote/weighted_avg.',
      inputSchema: { type: 'object', properties: { algorithm: { type: 'string' }, strategy: { type: 'string', enum: ['union', 'intersection', 'majority_vote', 'weighted_avg'] }, worker_ids: { type: 'array', items: { type: 'string' } } }, required: ['algorithm'] },
    },
    {
      name: 'check_convergence',
      description: 'Assess whether the swarm has converged for an algorithm. threshold=1.0 = unanimous.',
      inputSchema: { type: 'object', properties: { algorithm: { type: 'string' }, threshold: { type: 'number' }, worker_ids: { type: 'array', items: { type: 'string' } } }, required: ['algorithm'] },
    },
    {
      name: 'send_directive',
      description: 'Post a typed directive to a specific worker or broadcast to all (target="*").',
      inputSchema: { type: 'object', properties: { target: { type: 'string' }, directive: { type: 'object' } }, required: ['target', 'directive'] },
    },
    {
      name: 'get_swarm_status',
      description: 'Full swarm snapshot: all workers, per-algorithm convergence, episode count.',
      inputSchema: { type: 'object', properties: { include_results: { type: 'boolean' } } },
    },
    {
      name: 'dissolve',
      description: 'Tear down workers and free resources. Omit worker_ids to dissolve the entire swarm.',
      inputSchema: { type: 'object', properties: { worker_ids: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } } },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  try {
    switch (name) {
      case 'spawn_worker': {
        const input = SpawnWorkerInput.parse(args)
        const state = spawnWorker(input.worker_id, input.xes_content, input.label)
        return ok({ worker_id: state.workerId, status: state.status, log_hash: state.logHash, created_at: state.createdAt })
      }

      case 'list_workers': {
        const input = ListWorkersInput.parse(args)
        const workers = listWorkers(input.filter_status)
        return ok({
          workers: workers.map(w => ({
            worker_id: w.workerId,
            label: w.label,
            status: w.status,
            log_hash: w.logHash,
            result_hash: w.results.size > 0 ? Array.from(w.results.values()).at(-1)?.resultHash ?? null : null,
            last_run_at: w.lastRunAt,
          })),
          total: workers.length,
        })
      }

      case 'run_worker': {
        const input = RunWorkerInput.parse(args)
        const result = await runAlgorithmOnWorker(input.worker_id, input.algorithm, input.params ?? {})
        return ok({ worker_id: result.workerId, algorithm: result.algorithmId, result_hash: result.resultHash, duration_ms: result.durationMs })
      }

      case 'run_all': {
        const input = RunAllInput.parse(args)
        const workers = input.worker_ids
          ? listWorkers().filter(w => input.worker_ids!.includes(w.workerId))
          : listWorkers()

        const results = await Promise.all(
          workers.map(w => runAlgorithmOnWorker(w.workerId, input.algorithm, input.params ?? {}))
        )
        incrementEpisodeCount()

        const uniqueHashes = [...new Set(results.map(r => r.resultHash))]
        return ok({
          algorithm: input.algorithm,
          ran: results.length,
          results: results.map(r => ({ worker_id: r.workerId, result_hash: r.resultHash, duration_ms: r.durationMs })),
          unique_hashes: uniqueHashes,
        })
      }

      case 'get_worker_result': {
        const input = GetWorkerResultInput.parse(args)
        const raw = getResult(input.worker_id, input.algorithm)
        if (!raw) return err(`No results for worker ${input.worker_id}`)
        const resultList = Array.isArray(raw) ? raw : [raw]
        return ok({
          worker_id: input.worker_id,
          results: resultList.map(r => ({ algorithm: r.algorithmId, result_hash: r.resultHash, result: r.result, run_at: r.runAt })),
        })
      }

      case 'aggregate': {
        const input = AggregateInput.parse(args)
        const workers = input.worker_ids ? listWorkers().filter(w => input.worker_ids!.includes(w.workerId)) : listWorkers()
        const allResults: WorkerResult[] = []
        for (const w of workers) {
          const r = w.results.get(input.algorithm)
          if (r) allResults.push(r)
        }
        const agg = aggregate(allResults, input.algorithm, input.strategy, input.worker_ids)
        return ok({
          algorithm: agg.algorithm,
          strategy: agg.strategy,
          workers_included: agg.workersIncluded,
          aggregate: agg.aggregate,
          aggregate_hash: agg.aggregateHash,
          consensus_ratio: agg.consensusRatio,
        })
      }

      case 'check_convergence': {
        const input = CheckConvergenceInput.parse(args)
        const workers = input.worker_ids ? listWorkers().filter(w => input.worker_ids!.includes(w.workerId)) : listWorkers()
        const allResults: WorkerResult[] = []
        for (const w of workers) {
          const r = w.results.get(input.algorithm)
          if (r) allResults.push(r)
        }
        const report = checkConvergence(allResults, input.algorithm, input.threshold, input.worker_ids)
        return ok({
          algorithm: report.algorithm,
          converged: report.converged,
          consensus_ratio: report.consensusRatio,
          dominant_hash: report.dominantHash,
          dissenting_workers: report.dissentingWorkers,
          total_checked: report.totalChecked,
        })
      }

      case 'send_directive': {
        const input = SendDirectiveInput.parse(args)
        const result = sendDirective(input.target, input.directive)
        return ok(result)
      }

      case 'get_swarm_status': {
        const input = GetSwarmStatusInput.parse(args)
        const workers = listWorkers()
        const algorithms = [...new Set(workers.flatMap(w => Array.from(w.results.keys())))]

        const convergence: Record<string, { converged: boolean; dominant_hash: string | null; consensus_ratio: number }> = {}
        for (const alg of algorithms) {
          const allResults: WorkerResult[] = []
          for (const w of workers) {
            const r = w.results.get(alg)
            if (r) allResults.push(r)
          }
          const report = checkConvergence(allResults, alg)
          convergence[alg] = { converged: report.converged, dominant_hash: report.dominantHash, consensus_ratio: report.consensusRatio }
        }

        return ok({
          swarm_id: getSwarmId(),
          worker_count: workers.length,
          algorithms_run: algorithms,
          convergence,
          workers: workers.map(w => ({
            worker_id: w.workerId,
            label: w.label,
            status: w.status,
            log_hash: w.logHash,
            results: input.include_results
              ? Array.from(w.results.values()).map(r => ({ algorithm: r.algorithmId, result_hash: r.resultHash, result: r.result }))
              : Array.from(w.results.values()).map(r => ({ algorithm: r.algorithmId, result_hash: r.resultHash })),
          })),
          episode_count: getEpisodeCount(),
        })
      }

      case 'dissolve': {
        const input = DissolveInput.parse(args)
        const dissolved = dissolveWorkers(input.worker_ids)
        return ok({ dissolved, remaining: listWorkers().length, dissolved_at: new Date().toISOString() })
      }

      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  }
})

// ── Entry point ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
