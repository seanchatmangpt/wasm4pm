/**
 * prediction/dispatcher.ts
 *
 * Single entry point for executing prediction tasks.
 *
 * The dispatcher:
 *   1. Validates the request via `validation.ts` (throws `PredictionValidationError`).
 *   2. Looks up the perspective handler from the registry.
 *   3. Honors the `mode` field by orchestrating fit / predict / fit_predict.
 *   4. Wraps the handler output in a uniform `PredictionResponse` shape with
 *      diagnostics (durations, scored counts) attached.
 *
 * The dispatcher itself is *stateless* — every call is independent.
 */

import {
  PredictionRequest,
  PredictionResponse,
  PredictionTask,
  PredictionTrace,
  PredictionDiagnostics,
} from './types.js';
import { PredictionRegistry, getDefaultPredictionRegistry } from './registry.js';
import { validateRequest } from './validation.js';
import { PerspectiveHandler } from './perspectives/handler.js';

export interface DispatcherOptions {
  registry?: PredictionRegistry;
}

export class PredictionDispatcher {
  private readonly registry: PredictionRegistry;

  constructor(opts: DispatcherOptions = {}) {
    this.registry = opts.registry ?? getDefaultPredictionRegistry();
  }

  execute<T extends PredictionTask = PredictionTask>(
    request: PredictionRequest<T>,
  ): PredictionResponse {
    validateRequest(request);
    const handler = this.registry.get(request.task.perspective) as PerspectiveHandler<T>;
    const start = Date.now();

    let model = request.model;
    if (request.mode === 'fit' || request.mode === 'fit_predict') {
      // `validateRequest` already enforced log presence for these modes.
      model = handler.fit(request.task, request.log!);
    }

    let predictions: readonly PredictionResponse['predictions'][number][] = [];
    let scored = 0;
    let skipped = 0;
    if (request.mode === 'predict' || request.mode === 'fit_predict') {
      const prefixes = request.prefixes as readonly PredictionTrace[];
      // Skip empty prefixes — they carry no signal.
      const nonEmpty = prefixes.filter((p) => p.events.length > 0);
      skipped = prefixes.length - nonEmpty.length;
      predictions = handler.predict(request.task, model!, nonEmpty);
      scored = predictions.length;
    }

    const diagnostics: PredictionDiagnostics = {
      perspective: request.task.perspective,
      durationMs: Date.now() - start,
      scored,
      skipped,
    };

    return {
      perspective: request.task.perspective,
      mode: request.mode,
      predictions,
      // For 'fit' mode we always return the model; for 'fit_predict' too so
      // callers can cache it; for 'predict' we echo back the supplied model.
      model,
      diagnostics,
    };
  }

  /**
   * Convenience: run multiple tasks in sequence (e.g. all 6 perspectives) on
   * the same training log. Each task gets its own response — failures in one
   * perspective do not abort the others.
   */
  executeBatch(
    requests: readonly PredictionRequest[],
  ): readonly { request: PredictionRequest; response?: PredictionResponse; error?: Error }[] {
    return requests.map((request) => {
      try {
        return { request, response: this.execute(request) };
      } catch (err) {
        return { request, error: err instanceof Error ? err : new Error(String(err)) };
      }
    });
  }
}
