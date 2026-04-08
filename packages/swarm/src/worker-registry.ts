/**
 * worker-registry.ts
 *
 * Module-level singleton WorkerRegistry.
 * Holds all worker state across MCP tool invocations within a single process.
 */

import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import type { WorkerState, WorkerResult, Directive, DirectiveType } from './types.js'

/** Module-level registry — survives across tool calls in the same Node.js process */
const registry = new Map<string, WorkerState>()

let swarmId: string = uuidv4()
let episodeCount: number = 0

export function getSwarmId(): string {
  return swarmId
}

export function incrementEpisodeCount(): number {
  return ++episodeCount
}

export function getEpisodeCount(): number {
  return episodeCount
}

export function resetSwarm(): void {
  registry.clear()
  swarmId = uuidv4()
  episodeCount = 0
}

export function spawnWorker(
  workerId: string,
  xesContent: string,
  label?: string
): WorkerState {
  const logHash = createHash('sha256').update(xesContent, 'utf-8').digest('hex')
  const state: WorkerState = {
    workerId,
    label: label ?? null,
    xesContent,
    logHash,
    status: 'ready',
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    results: new Map(),
    directives: [],
  }
  registry.set(workerId, state)
  return state
}

export function getWorker(workerId: string): WorkerState | undefined {
  return registry.get(workerId)
}

export function listWorkers(filterStatus?: WorkerState['status']): WorkerState[] {
  const all = Array.from(registry.values())
  return filterStatus ? all.filter(w => w.status === filterStatus) : all
}

export function setWorkerStatus(workerId: string, status: WorkerState['status']): void {
  const w = registry.get(workerId)
  if (w) w.status = status
}

export function storeResult(workerId: string, result: WorkerResult): void {
  const w = registry.get(workerId)
  if (w) {
    w.results.set(result.algorithmId, result)
    w.lastRunAt = result.runAt
    w.status = 'done'
  }
}

export function getResult(workerId: string, algorithmId?: string): WorkerResult | WorkerResult[] | undefined {
  const w = registry.get(workerId)
  if (!w) return undefined
  if (algorithmId) return w.results.get(algorithmId)
  return Array.from(w.results.values())
}

export function enqueueDirective(workerIds: string[], directive: DirectiveType): string {
  const directiveId = uuidv4()
  const d: Directive = {
    ...directive,
    directiveId,
    timestamp: new Date().toISOString(),
  }
  for (const id of workerIds) {
    const w = registry.get(id)
    if (w) w.directives.push(d)
  }
  return directiveId
}

export function dissolveWorkers(workerIds?: string[]): string[] {
  const toDissolve = workerIds ?? Array.from(registry.keys())
  const dissolved: string[] = []
  for (const id of toDissolve) {
    if (registry.delete(id)) dissolved.push(id)
  }
  return dissolved
}
