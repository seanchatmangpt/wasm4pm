/**
 * prediction/registry.ts
 *
 * Mapping from `PredictionPerspective` → `PerspectiveHandler` instance.
 *
 * The registry is the *only* surface where the dispatcher learns which class
 * implements which perspective. Tests can construct an isolated registry to
 * inject mock handlers without touching global state.
 */

import { PerspectiveHandler } from './perspectives/handler.js';
import { NextActivityHandler } from './perspectives/next-activity.js';
import { RemainingTimeHandler } from './perspectives/remaining-time.js';
import { OutcomeHandler } from './perspectives/outcome.js';
import { DriftHandler } from './perspectives/drift.js';
import { FeaturesHandler } from './perspectives/features.js';
import { ResourceHandler } from './perspectives/resource.js';
import {
  ALL_PREDICTION_PERSPECTIVES,
  PredictionPerspective,
} from './types.js';
import { PredictionValidationError } from './validation.js';

export class PredictionRegistry {
  private readonly handlers = new Map<PredictionPerspective, PerspectiveHandler>();

  constructor(handlers?: readonly PerspectiveHandler[]) {
    const list = handlers ?? PredictionRegistry.defaultHandlers();
    for (const h of list) this.register(h);
  }

  static defaultHandlers(): PerspectiveHandler[] {
    return [
      new NextActivityHandler(),
      new RemainingTimeHandler(),
      new OutcomeHandler(),
      new DriftHandler(),
      new FeaturesHandler(),
      new ResourceHandler(),
    ];
  }

  register(handler: PerspectiveHandler): void {
    this.handlers.set(handler.perspective, handler);
  }

  has(perspective: PredictionPerspective): boolean {
    return this.handlers.has(perspective);
  }

  get(perspective: PredictionPerspective): PerspectiveHandler {
    const h = this.handlers.get(perspective);
    if (!h) {
      throw new PredictionValidationError(
        'unknown_perspective',
        `no handler registered for perspective '${perspective}'`,
        'registry',
      );
    }
    return h;
  }

  list(): readonly PredictionPerspective[] {
    return Array.from(this.handlers.keys()).sort();
  }

  /** True iff every canonical perspective has a registered handler. */
  isComplete(): boolean {
    return ALL_PREDICTION_PERSPECTIVES.every((p) => this.has(p));
  }
}

/**
 * Lazy singleton — useful for non-test callers that don't need to inject
 * mocks. Tests should prefer `new PredictionRegistry()`.
 */
let _default: PredictionRegistry | null = null;
export function getDefaultPredictionRegistry(): PredictionRegistry {
  if (_default === null) _default = new PredictionRegistry();
  return _default;
}
