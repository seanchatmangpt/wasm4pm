/**
 * loop.ts — Vercel AI SDK Swarm Loop
 *
 * Two-tier generateText architecture:
 *   - TypeScript orchestrator (not LLM): fans out N parallel worker generateText calls
 *   - Each worker: generateText({ maxSteps: 20, tools: swarmTools })
 *   - After each round: Reflection LLM synthesizes convergence
 *
 * Usage:
 *   import { runSwarm } from '@pictl/swarm'
 *   const artifact = await runSwarm(config)
 */

import { generateText } from 'ai'
import { groq } from '@ai-sdk/groq'
import { hashOutput, checkSwarmConvergence } from './convergence.js'
import { swarmTools } from './tools.js'
import { getWorker, storeResult, setWorkerStatus } from './worker-registry.js'
import { 
  getTracer, 
  RunningSpans, 
  LawfulDispatchSpans, 
} from '@pictl/observability'
import type { SwarmConfig, WorkerSpec, WorkerResult, SwarmEpisode, SwarmArtifact } from './types.js'

// Re-export these so callers can build WorkerSpec arrays
export type { SwarmConfig, SwarmArtifact, SwarmEpisode, WorkerSpec }

/**
 * Main swarm entry point.
 *
 * Each worker: generateText({ maxSteps: 20, tools: swarmTools })
 * The implementation uses GROQ_API_KEY from the environment.
 */
export async function runSwarm(config: SwarmConfig): Promise<SwarmArtifact> {
  const tracer = getTracer()
  const swarmSpan = tracer.startSpan(RunningSpans.runStart(), {
    attributes: {
      'swarm.max_episodes': config.maxEpisodes ?? 5,
      'swarm.convergence_runs': config.convergenceRuns ?? 2,
      'swarm.worker_model': config.workerModel ?? 'default',
    }
  })

  try {
    const maxEpisodes = config.maxEpisodes ?? 5
    const convergenceRuns = config.convergenceRuns ?? 2

    const hashHistory = new Map<string, string[]>()
    const episodes: SwarmEpisode[] = []

    // Build initial worker specs from config
    const workerSpecs: WorkerSpec[] = buildWorkerSpecs(config)

    for (let ep = 0; ep < maxEpisodes; ep++) {
      const episodeId = `swarm-ep-${Date.now()}-${ep}`
      
      const epSpan = tracer.startSpan(`swarm.episode.${ep}`, {
        attributes: { 'swarm.episode': ep }
      })

      try {
        // Fan-out: run all workers in parallel
        const workerResults: WorkerResult[] = await Promise.all(
          workerSpecs.map(spec => runWorker(spec, config))
        )

        // Update hash history ring buffer
        for (const result of workerResults) {
          const key = `${result.workerId}/${result.algorithmId}`
          const hist = hashHistory.get(key) ?? []
          hist.push(result.resultHash)
          if (hist.length > convergenceRuns) hist.shift()
          hashHistory.set(key, hist)
        }

        // Check swarm-level convergence
        const { converged, stableWorkers, unstableWorkers, agreementRate } =
          checkSwarmConvergence(workerResults, hashHistory, convergenceRuns)

        const convergenceReport = {
          algorithm: workerSpecs[0]?.algorithmId ?? 'unknown',
          converged,
          consensusRatio: agreementRate,
          dominantHash: workerResults[0]?.resultHash ?? null,
          dissentingWorkers: unstableWorkers,
          totalChecked: workerResults.length,
        }

        episodes.push({ episodeId, ep, workerResults, convergenceReport })

        epSpan.setAttribute('swarm.converged', converged)
        epSpan.setAttribute('swarm.agreement_rate', agreementRate)

        if (converged) break
      } finally {
        epSpan.end()
      }
    }

    const lastEpisode = episodes[episodes.length - 1]
    const finalWorkerResults = lastEpisode?.workerResults ?? []

    const artifact = {
      episodes,
      finalWorkerResults,
      converged: episodes.some(e => e.convergenceReport.converged),
      artifact: buildArtifact(episodes),
    }
    
    swarmSpan.setAttribute('swarm.final_episodes', episodes.length)
    swarmSpan.setAttribute('swarm.final_converged', artifact.converged)
    
    return artifact
  } catch (error) {
    swarmSpan.setStatus('ERROR', String(error))
    throw error
  } finally {
    swarmSpan.end()
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildWorkerSpecs(config: SwarmConfig): WorkerSpec[] {
  const algorithmIds = config.algorithmIds ?? ['dfg']
  const logPaths = config.logPaths ?? []

  if (logPaths.length === 0) {
    return algorithmIds.map(alg => ({
      workerId: `worker-${alg}`,
      algorithmId: alg,
      logId: 'default',
      model: config.workerModel,
    }))
  }

  const specs: WorkerSpec[] = []
  for (const logPath of logPaths) {
    const logId = logPath.split('/').pop()?.replace(/\.xes$/, '') ?? logPath
    for (const alg of algorithmIds) {
      specs.push({
        workerId: `worker-${logId}-${alg}`,
        algorithmId: alg,
        logId,
        logPath,
        model: config.workerModel,
      })
    }
  }
  return specs
}

async function runWorker(spec: WorkerSpec, config: SwarmConfig): Promise<WorkerResult> {
  const tracer = getTracer()
  const workerSpan = tracer.startSpan(RunningSpans.algorithmExec(spec.algorithmId), {
    attributes: {
      'worker.id': spec.workerId,
      'worker.log_id': spec.logId,
      'agent.role': 'worker',
      'agent.task_id': spec.workerId,
    }
  })

  try {
    const isMl = spec.algorithmId.startsWith('ml_')
    const worker = getWorker(spec.workerId)
    
    if (!worker) {
      throw new Error(`Worker state not found for ID: ${spec.workerId}`)
    }

    setWorkerStatus(spec.workerId, 'running')
    const startTime = Date.now()

    const modelId = spec.model || config.workerModel || 'llama-3.1-70b-versatile'
    
    const { text, toolResults } = await generateText({
      model: groq(modelId),
      tools: swarmTools,
      prompt: spec.prompt || `You are an autonomic process mining worker for algorithm ${spec.algorithmId}.
Use the provided tools to analyze the XES log content associated with this worker.
XES Content Preview: ${worker.xesContent.substring(0, 500)}...
Goal: Discover the process model or analyze statistics as requested.`,
    })

    // We take the result from the last tool call or the text if no tool was called
    let lastToolResult: any = { text }
    if (toolResults && toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      lastToolResult = 'result' in lastResult ? lastResult.result : lastResult;
    }
    
    const resultHash = hashOutput(lastToolResult)

    const result: WorkerResult = {
      workerId: spec.workerId,
      algorithmId: spec.algorithmId,
      resultHash,
      result: lastToolResult,
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      resultType: isMl ? 'ml' : 'discovery',
    }

    storeResult(spec.workerId, result)
    
    workerSpan.setAttribute('worker.duration_ms', result.durationMs)
    workerSpan.setAttribute('worker.result_type', result.resultType)
    
    return result
  } catch (error) {
    workerSpan.setStatus('ERROR', String(error))
    workerSpan.setAttribute('agent.failure_code', 'WORKER_FAILURE')
    throw error
  } finally {
    workerSpan.end()
  }
}

function buildArtifact(episodes: SwarmEpisode[]): unknown {
  const lastEpisode = episodes[episodes.length - 1]
  return {
    episode_count: episodes.length,
    converged: episodes.some(e => e.convergenceReport.converged),
    final_consensus_ratio: lastEpisode?.convergenceReport.consensusRatio ?? 0,
    dominant_hash: lastEpisode?.convergenceReport.dominantHash,
  }
}
