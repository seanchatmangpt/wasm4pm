/**
 * wasm4pm — prediction subsystem
 *
 * Unified orchestration layer for the six Van der Aalst-aligned prediction
 * perspectives (next_activity, remaining_time, outcome, drift, features,
 * resource).
 *
 * This module is *additive*: it does not replace or modify any existing ML
 * algorithm code. Instead, it provides:
 *
 *   - A typed, perspective-tagged task vocabulary (`types.ts`)
 *   - Hand-rolled validators (`validation.ts`)
 *   - A pluggable handler registry (`registry.ts`)
 *   - A stateless dispatcher (`dispatcher.ts`)
 *   - Six built-in perspective implementations (`perspectives/*.ts`)
 *
 * ## Quick start
 *
 * ```ts
 * import {
 *   PredictionDispatcher,
 *   PredictionRequest,
 * } from 'wasm4pm/prediction';
 *
 * const dispatcher = new PredictionDispatcher();
 * const response = dispatcher.execute({
 *   mode: 'fit_predict',
 *   task: { perspective: 'next_activity', ngramOrder: 2, topK: 3 },
 *   log: trainingLog,
 *   prefixes: [{ caseId: 'c1', events: [...] }],
 * });
 * console.log(response.predictions);
 * ```
 *
 * ## Adding a new perspective
 *
 *   1. Extend the `PredictionPerspective` union and add a task interface in
 *      `types.ts`.
 *   2. Add a handler that implements `PerspectiveHandler<NewTask>` under
 *      `perspectives/`.
 *   3. Register the handler in `PredictionRegistry.defaultHandlers()`.
 *   4. Add per-task range checks to `validation.ts::validateTask`.
 */

export { ALL_PREDICTION_PERSPECTIVES } from './types.js';
export type {
  PredictionPerspective,
  PredictionEvent,
  PredictionTrace,
  PredictionLog,
  PredictionTaskCommon,
  NextActivityTask,
  RemainingTimeTask,
  OutcomeTask,
  OutcomeLabeller,
  DriftTask,
  FeaturesTask,
  ResourceTask,
  PredictionTask,
  PredictionMode,
  PredictionRequest,
  PredictionModel,
  PredictionRecord,
  PredictionDiagnostics,
  PredictionResponse,
} from './types.js';

export {
  PredictionValidationError,
  validateRequest,
  validateTask,
  validateLog,
  validateTrace,
  isPredictionPerspective,
} from './validation.js';
export type { PredictionValidationCode } from './validation.js';

export { PredictionRegistry, getDefaultPredictionRegistry } from './registry.js';

export { PredictionDispatcher } from './dispatcher.js';
export type { DispatcherOptions } from './dispatcher.js';

export type { PerspectiveHandler } from './perspectives/handler.js';
export { NextActivityHandler } from './perspectives/next-activity.js';
export { RemainingTimeHandler } from './perspectives/remaining-time.js';
export { OutcomeHandler } from './perspectives/outcome.js';
export { DriftHandler } from './perspectives/drift.js';
export { FeaturesHandler } from './perspectives/features.js';
export { ResourceHandler } from './perspectives/resource.js';
