/**
 * loop.ts — Vercel AI SDK Swarm Loop
 *
 * Two-tier generateText architecture:
 *   - TypeScript orchestrator (not LLM): fans out N parallel worker generateText calls
 *   - Each worker: generateText({ maxSteps: 20, tools: swarmTools })
 *   - After each round: Reflection LLM synthesizes convergence
 *
 * Usage:
 *   import { runSwarm } from '@wasm4pm/swarm'
 *   const artifact = await runSwarm(config)
 */

import { generateText } from 'ai';
import { groq } from '@ai-sdk/groq';
import { hashOutput, checkSwarmConvergence } from './convergence.js';
import { swarmTools } from './tools.js';
import { getWorker, storeResult, setWorkerStatus } from './worker-registry.js';
import { getTracer, RunningSpans, LawfulDispatchSpans } from '@wasm4pm/observability';
import { ConvergenceMaxIterationsError, ConvergenceTimeoutError } from './types.js';
import { AlgorithmConsensus, computeQualityScore, type ConsensusDecision } from './algorithm-consensus.js';
import type {
  SwarmConfig,
  WorkerSpec,
  WorkerResult,
  SwarmEpisode,
  SwarmArtifact,
} from './types.js';

// Re-export these so callers can build WorkerSpec arrays
export type { SwarmConfig, SwarmArtifact, SwarmEpisode, WorkerSpec };

/**
 * Main swarm entry point.
 *
 * Each worker: generateText({ maxSteps: 20, tools: swarmTools })
 * The implementation uses GROQ_API_KEY from the environment.
 */
export async function runSwarm(config: SwarmConfig): Promise<SwarmArtifact> {
  const tracer = getTracer();
  const swarmSpan = tracer.startSpan(RunningSpans.runStart(), {
    attributes: {
      'swarm.max_episodes': config.maxEpisodes ?? 5,
      'swarm.convergence_runs': config.convergenceRuns ?? 2,
      'swarm.worker_model': config.workerModel ?? 'default',
    },
  });

  try {
    const maxEpisodes = config.maxEpisodes ?? 5;
    const convergenceRuns = config.convergenceRuns ?? 2;
    const maxIterations = config.maxIterations;

    const hashHistory = new Map<string, string[]>();
    const episodes: SwarmEpisode[] = [];

    // Build initial worker specs from config
    let workerSpecs: WorkerSpec[] = buildWorkerSpecs(config);

    if (workerSpecs.length === 0) {
      throw new Error(
        'runSwarm: no workers could be built from config. Provide algorithmIds or logPaths.'
      );
    }

    // Initialize consensus tracker with discovered algorithms
    const algorithmIds = Array.from(new Set(workerSpecs.map((s) => s.algorithmId)));
    const consensus = new AlgorithmConsensus(algorithmIds);
    let consensusDecision: ConsensusDecision | null = null;

    let totalIterations = 0;

    for (let ep = 0; ep < maxEpisodes; ep++) {
      const episodeId = `swarm-ep-${Date.now()}-${ep}`;

      const epSpan = tracer.startSpan(`swarm.episode.${ep}`, {
        attributes: { 'swarm.episode': ep },
      });

      try {
        // Extract log stats from first available worker for consensus decision
        const firstWorker = getWorker(workerSpecs[0]?.workerId);
        const logStats = firstWorker ? extractLogStats(firstWorker.xesContent) : null;

        // Run consensus to select primary algorithm (if we have context)
        if (logStats) {
          consensusDecision = consensus.selectAlgorithm(logStats);
          epSpan.setAttribute('consensus.selected_algorithm', consensusDecision.selectedAlgorithm);
          epSpan.setAttribute('consensus.confidence', consensusDecision.confidence);

          // Update worker specs to use consensus algorithm
          workerSpecs = workerSpecs.map((spec) => ({
            ...spec,
            algorithmId: consensusDecision!.selectedAlgorithm,
          }));
        }

        // Fan-out: run all workers in parallel.
        // Individual worker failures are isolated — a failed worker produces a
        // degraded WorkerResult (failed=true, error=message) rather than
        // aborting the entire episode via Promise.all rejection.
        const workerResults: WorkerResult[] = await Promise.all(
          workerSpecs.map((spec) =>
            runWorker(spec, config).catch((err: unknown) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              return {
                workerId: spec.workerId,
                algorithmId: spec.algorithmId,
                resultHash: 'FAILED',
                result: null,
                runAt: new Date().toISOString(),
                durationMs: 0,
                resultType: spec.algorithmId.startsWith('ml_')
                  ? ('ml' as const)
                  : ('discovery' as const),
                error: errorMessage,
                failed: true,
              } satisfies WorkerResult;
            })
          )
        );

        // Update consensus with results
        for (const result of workerResults) {
          const qualityScore = computeQualityScore(result);
          consensus.updatePerformance(result.algorithmId, result, qualityScore);
        }

        // Enforce hard iteration cap before any further processing
        totalIterations += workerSpecs.length;
        if (maxIterations !== undefined && totalIterations > maxIterations) {
          const lastEp = episodes[episodes.length - 1];
          const rate = lastEp?.convergenceReport.consensusRatio ?? 0;
          throw new ConvergenceMaxIterationsError(totalIterations, maxIterations, rate);
        }

        // Check swarm-level convergence.
        // checkSwarmConvergence mutates hashHistory internally (ring-buffer update) —
        // do NOT update hashHistory here as well; that would cause double-buffering
        // which makes the ring buffer fill 2x too fast and falsely declare convergence
        // one episode early (Gap #2 fix).
        const { converged, stableWorkers, unstableWorkers, agreementRate, convergenceReason } =
          checkSwarmConvergence(workerResults, hashHistory, convergenceRuns);

        const convergenceReport = {
          algorithm: consensusDecision?.selectedAlgorithm ?? workerSpecs[0]?.algorithmId ?? 'unknown',
          converged,
          consensusRatio: agreementRate,
          dominantHash: workerResults[0]?.resultHash ?? null,
          dissentingWorkers: unstableWorkers,
          totalChecked: workerResults.length,
          convergenceReason,
        };

        episodes.push({ episodeId, ep, workerResults, convergenceReport });

        epSpan.setAttribute('swarm.converged', converged);
        epSpan.setAttribute('swarm.agreement_rate', agreementRate);

        if (converged) break;
      } finally {
        epSpan.end();
      }
    }

    const lastEpisode = episodes[episodes.length - 1];
    const finalWorkerResults = lastEpisode?.workerResults ?? [];
    const didConverge = episodes.some((e) => e.convergenceReport.converged);

    if (!didConverge && config.throwOnTimeout) {
      const rate = lastEpisode?.convergenceReport.consensusRatio ?? 0;
      throw new ConvergenceTimeoutError(episodes.length, maxEpisodes, rate);
    }

    const failedWorkers = finalWorkerResults
      .filter((r) => r.failed === true)
      .map((r) => r.workerId);
    const healthyWorkerCount = finalWorkerResults.filter((r) => !r.failed).length;

    const artifact = {
      episodes,
      finalWorkerResults,
      converged: didConverge,
      artifact: buildArtifact(episodes),
      convergenceTimeout: !didConverge,
      failedWorkers,
      healthyWorkerCount,
    };

    swarmSpan.setAttribute('swarm.final_episodes', episodes.length);
    swarmSpan.setAttribute('swarm.final_converged', artifact.converged);

    return artifact;
  } catch (error) {
    swarmSpan.setStatus('ERROR', String(error));
    throw error;
  } finally {
    swarmSpan.end();
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildWorkerSpecs(config: SwarmConfig): WorkerSpec[] {
  const algorithmIds = config.algorithmIds ?? ['dfg'];
  const logPaths = config.logPaths ?? [];

  if (logPaths.length === 0) {
    return algorithmIds.map((alg) => ({
      workerId: `worker-${alg}`,
      algorithmId: alg,
      logId: 'default',
      model: config.workerModel,
    }));
  }

  const specs: WorkerSpec[] = [];
  for (const logPath of logPaths) {
    const logId =
      logPath
        .split('/')
        .pop()
        ?.replace(/\.xes$/, '') ?? logPath;
    for (const alg of algorithmIds) {
      specs.push({
        workerId: `worker-${logId}-${alg}`,
        algorithmId: alg,
        logId,
        logPath,
        model: config.workerModel,
      });
    }
  }
  return specs;
}

async function runWorker(spec: WorkerSpec, config: SwarmConfig): Promise<WorkerResult> {
  const tracer = getTracer();
  const workerSpan = tracer.startSpan(RunningSpans.algorithmExec(spec.algorithmId), {
    attributes: {
      'worker.id': spec.workerId,
      'worker.log_id': spec.logId,
      'agent.role': 'worker',
      'agent.task_id': spec.workerId,
    },
  });

  try {
    const isMl = spec.algorithmId.startsWith('ml_');
    const worker = getWorker(spec.workerId);

    if (!worker) {
      throw new Error(`Worker state not found for ID: ${spec.workerId}`);
    }

    setWorkerStatus(spec.workerId, 'running');
    const startTime = Date.now();

    const modelId = spec.model || config.workerModel || 'llama-3.1-70b-versatile';

    // Wrap the generateText call with an optional per-worker timeout.
    // If workerTimeoutMs is set and the LLM call exceeds it, we throw a
    // timeout error so the caller's catch block can produce a degraded
    // WorkerResult rather than hanging the entire episode (Gap #3 fix).
    const generatePromise = generateText({
      model: groq(modelId),
      tools: swarmTools,
      prompt:
        spec.prompt ||
        `You are an autonomic process mining worker for algorithm ${spec.algorithmId}.
Use the provided tools to analyze the XES log content associated with this worker.
XES Content Preview: ${worker.xesContent.substring(0, 500)}...
Goal: Discover the process model or analyze statistics as requested.`,
    });

    const { text, toolResults } = await (config.workerTimeoutMs != null
      ? Promise.race([
          generatePromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Worker ${spec.workerId} timed out after ${config.workerTimeoutMs}ms`
                  )
                ),
              config.workerTimeoutMs
            )
          ),
        ])
      : generatePromise);

    // We take the result from the last tool call or the text if no tool was called.
    // `WorkerResult.result` is typed `unknown`; keep this as unknown throughout.
    let lastToolResult: unknown = { text };
    if (toolResults && toolResults.length > 0) {
      const lastResult = toolResults[toolResults.length - 1];
      lastToolResult = 'result' in lastResult ? lastResult.result : lastResult;
    }

    const resultHash = hashOutput(lastToolResult);

    const result: WorkerResult = {
      workerId: spec.workerId,
      algorithmId: spec.algorithmId,
      resultHash,
      result: lastToolResult,
      runAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      resultType: isMl ? 'ml' : 'discovery',
    };

    storeResult(spec.workerId, result);

    workerSpan.setAttribute('worker.duration_ms', result.durationMs);
    workerSpan.setAttribute('worker.result_type', result.resultType);

    return result;
  } catch (error) {
    workerSpan.setStatus('ERROR', String(error));
    workerSpan.setAttribute('agent.failure_code', 'WORKER_FAILURE');
    throw error;
  } finally {
    workerSpan.end();
  }
}

function buildArtifact(episodes: SwarmEpisode[]): unknown {
  const lastEpisode = episodes[episodes.length - 1];
  return {
    episode_count: episodes.length,
    converged: episodes.some((e) => e.convergenceReport.converged),
    final_consensus_ratio: lastEpisode?.convergenceReport.consensusRatio ?? 0,
    dominant_hash: lastEpisode?.convergenceReport.dominantHash,
  };
}

/**
 * Extract log statistics from XES/OCEL content for consensus decision-making.
 */
function extractLogStats(xesContent: string): import('./algorithm-consensus.js').LogStats | null {
  try {
    // Count traces (lines with <trace> tags)
    const traceMatches = xesContent.match(/<trace>/g);
    const traceCount = traceMatches?.length ?? 0;

    // Count events (lines with <event> tags)
    const eventMatches = xesContent.match(/<event>/g);
    const eventCount = eventMatches?.length ?? 0;

    // Count unique activities (concept:name attributes)
    const activityMatches = xesContent.match(/concept:name="([^"]+)"/g);
    const activities = new Set(
      (activityMatches ?? []).map((m) => m.match(/"([^"]+)"/)?.at(1)).filter(Boolean)
    );
    const activityCount = activities.size;

    if (traceCount === 0 || eventCount === 0) {
      return null;
    }

    const eventRate = eventCount / traceCount;
    const avgTraceLength = eventRate;
    const maxTraceLength = Math.max(
      1,
      Math.ceil(avgTraceLength * 1.5) // Estimate max as 1.5x average
    );

    // Classify complexity based on event/activity ratio
    const diversityRatio = eventCount / Math.max(1, activityCount);
    let complexity: 'simple' | 'moderate' | 'complex' = 'moderate';
    if (diversityRatio > 50) complexity = 'simple'; // Few activities, many events = repetitive
    if (diversityRatio < 10) complexity = 'complex'; // Many activities, few events = complex

    return {
      eventCount,
      traceCount,
      activityCount,
      eventRate,
      avgTraceLength,
      maxTraceLength,
      complexity,
    };
  } catch {
    return null; // Parse error, skip consensus decision
  }
}
