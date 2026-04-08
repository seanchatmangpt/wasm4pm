/**
 * directive-bus.ts
 *
 * Thin wrapper around the worker-registry directive queues.
 * Provides broadcast and targeted directive dispatch.
 */

import { listWorkers, enqueueDirective } from './worker-registry.js'
import type { DirectiveType } from './types.js'

export function sendDirective(
  target: string | '*',
  directive: DirectiveType
): { deliveredTo: string[]; directiveId: string; timestamp: string } {
  const workerIds =
    target === '*'
      ? listWorkers().map(w => w.workerId)
      : [target]

  const directiveId = enqueueDirective(workerIds, directive)
  return {
    deliveredTo: workerIds,
    directiveId,
    timestamp: new Date().toISOString(),
  }
}
