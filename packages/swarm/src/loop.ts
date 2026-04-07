/**
 * loop.ts — Vercel AI SDK Swarm Loop
 *
 * Two-tier generateText architecture:
 *   - TypeScript orchestrator (not LLM): fans out N parallel worker generateText calls
 *   - Each worker: generateText({ maxSteps: 20, tools: wasm4pm__+onto__ })
 *   - After each round: Reflection LLM synthesizes convergence
 *
 * Usage:
 *   import { runSwarm } from '@wasm4pm/swarm'
 *   const artifact = await runSwarm(config)
 */

import { hashOutput, checkSwarmConvergence } from './convergence.js'
import type { SwarmConfig, WorkerSpec, WorkerResult, SwarmEpisode, SwarmArtifact } from './types.js'

// Re-export these so callers can build WorkerSpec arrays
export type { SwarmConfig, SwarmArtifact, SwarmEpisode, WorkerSpec }

/**
 * Main swarm entry point.
 *
 * In a full implementation this imports @ai-sdk/groq and calls generateText().
 * The implementation here provides the structural skeleton; the actual LLM calls
 * require GROQ_API_KEY to be set and the ai/@ai-sdk/groq packages installed.
 */
export async function runSwarm(config: SwarmConfig): Promise<SwarmArtifact> {
  const maxEpisodes = config.maxEpisodes ?? 5
  const convergenceRuns = config.convergenceRuns ?? 2

  const hashHistory = new Map<string, string[]>()
  const episodes: SwarmEpisode[] = []

  // Build initial worker specs from config
  const workerSpecs: WorkerSpec[] = buildWorkerSpecs(config)

  for (let ep = 0; ep < maxEpisodes; ep++) {
    const episodeId = `swarm-ep-${Date.now()}-${ep}`

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

    if (converged) break
  }

  const lastEpisode = episodes[episodes.length - 1]
  const finalWorkerResults = lastEpisode?.workerResults ?? []

  return {
    episodes,
    finalWorkerResults,
    converged: episodes.some(e => e.convergenceReport.converged),
    artifact: buildArtifact(episodes),
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
  // Structural skeleton — real implementation calls generateText() with wasm4pm__ tools
  // The result hash is computed from algorithm + logId for deterministic convergence testing
  const resultData = {
    algorithm: spec.algorithmId,
    logId: spec.logId,
    nodes: [],
    edges: [],
  }
  const resultHash = hashOutput(resultData)

  return {
    workerId: spec.workerId,
    algorithmId: spec.algorithmId,
    resultHash,
    result: resultData,
    runAt: new Date().toISOString(),
    durationMs: 0,
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
