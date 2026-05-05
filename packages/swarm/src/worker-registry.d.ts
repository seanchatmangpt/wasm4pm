/**
 * worker-registry.ts
 *
 * Module-level singleton WorkerRegistry.
 * Holds all worker state across MCP tool invocations within a single process.
 */
import type { WorkerState, WorkerResult, DirectiveType } from './types.js';
export declare function getSwarmId(): string;
export declare function incrementEpisodeCount(): number;
export declare function getEpisodeCount(): number;
export declare function resetSwarm(): void;
export declare function spawnWorker(
  workerId: string,
  xesContent: string,
  label?: string
): WorkerState;
export declare function getWorker(workerId: string): WorkerState | undefined;
export declare function listWorkers(filterStatus?: WorkerState['status']): WorkerState[];
export declare function setWorkerStatus(workerId: string, status: WorkerState['status']): void;
export declare function storeResult(workerId: string, result: WorkerResult): void;
export declare function getResult(
  workerId: string,
  algorithmId?: string
): WorkerResult | WorkerResult[] | undefined;
export declare function enqueueDirective(workerIds: string[], directive: DirectiveType): string;
export declare function dissolveWorkers(workerIds?: string[]): string[];
//# sourceMappingURL=worker-registry.d.ts.map
