/**
 * worker-registry.ts
 *
 * Module-level singleton WorkerRegistry.
 * Holds all worker state across MCP tool invocations within a single process.
 */
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
/** Module-level registry — survives across tool calls in the same Node.js process */
const registry = new Map();
let swarmId = uuidv4();
let episodeCount = 0;
export function getSwarmId() {
    return swarmId;
}
export function incrementEpisodeCount() {
    return ++episodeCount;
}
export function getEpisodeCount() {
    return episodeCount;
}
export function resetSwarm() {
    registry.clear();
    swarmId = uuidv4();
    episodeCount = 0;
}
export function spawnWorker(workerId, xesContent, label) {
    const logHash = createHash('sha256').update(xesContent, 'utf-8').digest('hex');
    const state = {
        workerId,
        label: label ?? null,
        xesContent,
        logHash,
        status: 'ready',
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        results: new Map(),
        directives: [],
    };
    registry.set(workerId, state);
    return state;
}
export function getWorker(workerId) {
    return registry.get(workerId);
}
export function listWorkers(filterStatus) {
    const all = Array.from(registry.values());
    return filterStatus ? all.filter(w => w.status === filterStatus) : all;
}
export function setWorkerStatus(workerId, status) {
    const w = registry.get(workerId);
    if (w)
        w.status = status;
}
export function storeResult(workerId, result) {
    const w = registry.get(workerId);
    if (w) {
        w.results.set(result.algorithmId, result);
        w.lastRunAt = result.runAt;
        w.status = 'done';
    }
}
export function getResult(workerId, algorithmId) {
    const w = registry.get(workerId);
    if (!w)
        return undefined;
    if (algorithmId)
        return w.results.get(algorithmId);
    return Array.from(w.results.values());
}
export function enqueueDirective(workerIds, directive) {
    const directiveId = uuidv4();
    const d = {
        ...directive,
        directiveId,
        timestamp: new Date().toISOString(),
    };
    for (const id of workerIds) {
        const w = registry.get(id);
        if (w)
            w.directives.push(d);
    }
    return directiveId;
}
export function dissolveWorkers(workerIds) {
    const toDissolve = workerIds ?? Array.from(registry.keys());
    const dissolved = [];
    for (const id of toDissolve) {
        if (registry.delete(id))
            dissolved.push(id);
    }
    return dissolved;
}
//# sourceMappingURL=worker-registry.js.map