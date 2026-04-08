/**
 * Swarm types — shared across all swarm modules
 */

export type WorkerStatus = 'ready' | 'running' | 'done' | 'error'

export interface WorkerState {
  workerId: string
  label: string | null
  xesContent: string
  logHash: string
  status: WorkerStatus
  createdAt: string
  lastRunAt: string | null
  /** Maps algorithm id → most recent result */
  results: Map<string, WorkerResult>
  /** FIFO directive queue */
  directives: Directive[]
}

export interface WorkerResult {
  workerId: string
  algorithmId: string
  resultHash: string
  result: unknown
  runAt: string
  durationMs: number
  resultType?: 'discovery' | 'ml'
}

export interface DirectiveType {
  type: 'run' | 'stop' | 'rerun' | 'update_log' | 'annotate'
  payload?: Record<string, unknown>
  from?: string
}

export interface Directive extends DirectiveType {
  directiveId: string
  timestamp: string
}

export interface SwarmConvergenceReport {
  algorithm: string
  converged: boolean
  consensusRatio: number
  dominantHash: string | null
  dissentingWorkers: string[]
  totalChecked: number
}

export interface SwarmConfig {
  maxEpisodes: number
  maxSteps: number
  convergenceRuns: number
  workerModel?: string
  reflectionModel?: string
  synthesisModel?: string
  powlDir?: string
  algorithmIds?: string[]
  logPaths?: string[]
  apiKey?: string
}

export interface SwarmEpisode {
  episodeId: string
  ep: number
  workerResults: WorkerResult[]
  convergenceReport: SwarmConvergenceReport
  summary?: unknown
}

export interface SwarmArtifact {
  episodes: SwarmEpisode[]
  finalWorkerResults: WorkerResult[]
  converged: boolean
  artifact?: unknown
}

export interface WorkerSpec {
  workerId: string
  algorithmId: string
  logId: string
  logPath?: string
  model?: string
  prompt?: string
  powlContext?: unknown
}
