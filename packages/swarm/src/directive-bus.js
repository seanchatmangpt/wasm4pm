/**
 * directive-bus.ts
 *
 * Thin wrapper around the worker-registry directive queues.
 * Provides broadcast and targeted directive dispatch.
 */
import { listWorkers, enqueueDirective } from './worker-registry.js';
export function sendDirective(target, directive) {
    const workerIds = target === '*'
        ? listWorkers().map(w => w.workerId)
        : [target];
    const directiveId = enqueueDirective(workerIds, directive);
    return {
        deliveredTo: workerIds,
        directiveId,
        timestamp: new Date().toISOString(),
    };
}
//# sourceMappingURL=directive-bus.js.map