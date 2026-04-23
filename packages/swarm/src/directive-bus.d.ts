/**
 * directive-bus.ts
 *
 * Thin wrapper around the worker-registry directive queues.
 * Provides broadcast and targeted directive dispatch.
 */
import type { DirectiveType } from './types.js';
export declare function sendDirective(target: string | '*', directive: DirectiveType): {
    deliveredTo: string[];
    directiveId: string;
    timestamp: string;
};
//# sourceMappingURL=directive-bus.d.ts.map