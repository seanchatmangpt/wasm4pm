/**
 * Swarm types — shared across all swarm modules
 */

export type WorkerStatus = 'ready' | 'running' | 'done' | 'error';

export interface WorkerState {
  workerId: string;
  label: string | null;
  xesContent: string;
  logHash: string;
  status: WorkerStatus;
  createdAt: string;
  lastRunAt: string | null;
  /** Maps algorithm id → most recent result */
  results: Map<string, WorkerResult>;
  /** FIFO directive queue */
  directives: Directive[];
}

export interface WorkerResult {
  workerId: string;
  algorithmId: string;
  resultHash: string;
  result: unknown;
  runAt: string;
  durationMs: number;
  resultType?: 'discovery' | 'ml';
  /** Present only when the worker failed. The swarm degrades gracefully: the
   *  episode continues with the remaining healthy workers rather than aborting. */
  error?: string;
  /** True when this result slot represents a failed worker (error isolation). */
  failed?: boolean;
}

export interface DirectiveType {
  type: 'run' | 'stop' | 'rerun' | 'update_log' | 'annotate';
  payload?: Record<string, unknown>;
  from?: string;
}

export interface Directive extends DirectiveType {
  directiveId: string;
  timestamp: string;
}

export interface SwarmConvergenceReport {
  algorithm: string;
  converged: boolean;
  consensusRatio: number;
  dominantHash: string | null;
  dissentingWorkers: string[];
  totalChecked: number;
  /**
   * Human-readable explanation of why convergence was (or was not) reached.
   * Optional during PR-2 transition — populated by the new convergence path
   * but left absent on the legacy code paths until they're upgraded.
   */
  convergenceReason?: string;
}

export interface SwarmConfig {
  maxEpisodes: number;
  maxSteps: number;
  convergenceRuns: number;
  workerModel?: string;
  reflectionModel?: string;
  synthesisModel?: string;
  powlDir?: string;
  algorithmIds?: string[];
  logPaths?: string[];
  apiKey?: string;
  /** Hard cap on total (episodes × workers) iterations. Throws ConvergenceMaxIterationsError when exceeded. */
  maxIterations?: number;
  /** When true, throws ConvergenceTimeoutError if all episodes exhaust without convergence. */
  throwOnTimeout?: boolean;
  /**
   * Per-worker timeout in milliseconds.
   * If a worker's generateText call exceeds this deadline, the worker is
   * treated as failed (error-isolated) and the episode continues with the
   * remaining healthy workers.  Default: no timeout (waits indefinitely).
   */
  workerTimeoutMs?: number;
}

export interface SwarmEpisode {
  episodeId: string;
  ep: number;
  workerResults: WorkerResult[];
  convergenceReport: SwarmConvergenceReport;
  summary?: unknown;
}

export interface SwarmArtifact {
  episodes: SwarmEpisode[];
  finalWorkerResults: WorkerResult[];
  converged: boolean;
  artifact?: unknown;
  /** True when all episodes were exhausted without convergence (no throwOnTimeout). */
  convergenceTimeout?: boolean;
  /** Workers that failed in the final episode (error-isolated, did not abort the swarm). */
  failedWorkers?: string[];
  /** Number of healthy (non-failed) workers in the final episode. */
  healthyWorkerCount?: number;
}

/**
 * Thrown when config.maxIterations is set and the running iteration count exceeds it.
 * Prevents runaway swarms from consuming unbounded resources.
 */
export class ConvergenceMaxIterationsError extends Error {
  constructor(
    public readonly iterationsRun: number,
    public readonly maxIterations: number,
    public readonly finalAgreementRate: number
  ) {
    super(
      `Swarm maxIterations exceeded: ran ${iterationsRun} iterations (limit: ${maxIterations}), ` +
        `final agreement rate: ${(finalAgreementRate * 100).toFixed(1)}%`
    );
    this.name = 'ConvergenceMaxIterationsError';
  }
}

/**
 * Thrown when config.throwOnTimeout is true and all episodes are exhausted without convergence.
 */
export class ConvergenceTimeoutError extends Error {
  constructor(
    public readonly episodesRun: number,
    public readonly maxEpisodes: number,
    public readonly finalAgreementRate: number
  ) {
    super(
      `Swarm convergence timeout: exhausted ${maxEpisodes} episodes without converging ` +
        `(final agreement rate: ${(finalAgreementRate * 100).toFixed(1)}%)`
    );
    this.name = 'ConvergenceTimeoutError';
  }
}

export interface WorkerSpec {
  workerId: string;
  algorithmId: string;
  logId: string;
  logPath?: string;
  model?: string;
  prompt?: string;
  powlContext?: unknown;
}
