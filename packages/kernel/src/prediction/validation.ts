/**
 * prediction/validation.ts
 *
 * Hand-rolled validators for the prediction subsystem.
 *
 * Why no zod? The kernel package has no zod dependency and we deliberately
 * keep the leaf modules dependency-light. These validators are the
 * authoritative gate for prediction inputs — every public entry point in the
 * subsystem (registry / dispatcher) routes through them.
 *
 * Validators throw `PredictionValidationError` with a stable `.code` so
 * callers can switch on error kind without string matching.
 */

import {
  ALL_PREDICTION_PERSPECTIVES,
  PredictionLog,
  PredictionMode,
  PredictionPerspective,
  PredictionRequest,
  PredictionTask,
  PredictionTrace,
} from './types.js';

export type PredictionValidationCode =
  | 'unknown_perspective'
  | 'invalid_mode'
  | 'missing_log'
  | 'missing_prefixes'
  | 'missing_model'
  | 'model_mismatch'
  | 'empty_log'
  | 'invalid_trace'
  | 'invalid_event'
  | 'param_out_of_range'
  | 'param_invalid_type';

export class PredictionValidationError extends Error {
  readonly code: PredictionValidationCode;
  readonly path?: string;

  constructor(code: PredictionValidationCode, message: string, path?: string) {
    super(`[prediction:${code}]${path ? ' ' + path : ''} ${message}`);
    this.name = 'PredictionValidationError';
    this.code = code;
    this.path = path;
  }
}

const VALID_MODES: readonly PredictionMode[] = ['fit', 'predict', 'fit_predict'];

export function isPredictionPerspective(value: unknown): value is PredictionPerspective {
  return typeof value === 'string' &&
    (ALL_PREDICTION_PERSPECTIVES as readonly string[]).includes(value);
}

function assertNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PredictionValidationError(
      'param_invalid_type',
      `${field} must be a finite number`,
      field,
    );
  }
  if (value < min || value > max) {
    throw new PredictionValidationError(
      'param_out_of_range',
      `${field} must be in [${min}, ${max}]; got ${value}`,
      field,
    );
  }
  return value;
}

function validateEvent(event: unknown, path: string): void {
  if (event === null || typeof event !== 'object') {
    throw new PredictionValidationError('invalid_event', 'event must be an object', path);
  }
  const e = event as Record<string, unknown>;
  if (typeof e.activity !== 'string' || e.activity.length === 0) {
    throw new PredictionValidationError(
      'invalid_event',
      'event.activity must be a non-empty string',
      `${path}.activity`,
    );
  }
  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp)) {
    throw new PredictionValidationError(
      'invalid_event',
      'event.timestamp must be a finite number (epoch ms)',
      `${path}.timestamp`,
    );
  }
  if (e.resource !== undefined && typeof e.resource !== 'string') {
    throw new PredictionValidationError(
      'invalid_event',
      'event.resource must be a string when present',
      `${path}.resource`,
    );
  }
}

export function validateTrace(trace: unknown, path = 'trace'): asserts trace is PredictionTrace {
  if (trace === null || typeof trace !== 'object') {
    throw new PredictionValidationError('invalid_trace', 'trace must be an object', path);
  }
  const t = trace as Record<string, unknown>;
  if (typeof t.caseId !== 'string' || t.caseId.length === 0) {
    throw new PredictionValidationError(
      'invalid_trace',
      'trace.caseId must be a non-empty string',
      `${path}.caseId`,
    );
  }
  if (!Array.isArray(t.events)) {
    throw new PredictionValidationError(
      'invalid_trace',
      'trace.events must be an array',
      `${path}.events`,
    );
  }
  t.events.forEach((event, idx) => validateEvent(event, `${path}.events[${idx}]`));
}

export function validateLog(log: unknown, path = 'log'): asserts log is PredictionLog {
  if (log === null || typeof log !== 'object') {
    throw new PredictionValidationError('empty_log', 'log must be an object', path);
  }
  const l = log as Record<string, unknown>;
  if (!Array.isArray(l.traces)) {
    throw new PredictionValidationError(
      'empty_log',
      'log.traces must be an array',
      `${path}.traces`,
    );
  }
  if (l.traces.length === 0) {
    throw new PredictionValidationError(
      'empty_log',
      'log.traces must contain at least one trace',
      `${path}.traces`,
    );
  }
  l.traces.forEach((tr, idx) => validateTrace(tr, `${path}.traces[${idx}]`));
}

/**
 * Validate the *structural* shape of a task. Per-perspective parameter
 * validation is performed by the dispatcher after delegating to the
 * perspective handler's own range checks.
 */
export function validateTask(task: unknown): asserts task is PredictionTask {
  if (task === null || typeof task !== 'object') {
    throw new PredictionValidationError('invalid_mode', 'task must be an object', 'task');
  }
  const t = task as Record<string, unknown>;
  if (!isPredictionPerspective(t.perspective)) {
    throw new PredictionValidationError(
      'unknown_perspective',
      `unknown perspective '${String(t.perspective)}'; expected one of: ${ALL_PREDICTION_PERSPECTIVES.join(', ')}`,
      'task.perspective',
    );
  }
  if (t.activityKey !== undefined && typeof t.activityKey !== 'string') {
    throw new PredictionValidationError(
      'param_invalid_type',
      'activityKey must be a string when present',
      'task.activityKey',
    );
  }
  if (t.maxPrefixLength !== undefined) {
    assertNumberInRange(t.maxPrefixLength, 'task.maxPrefixLength', 1, 100_000);
  }
  if (t.seed !== undefined) {
    assertNumberInRange(t.seed, 'task.seed', 0, 2 ** 31 - 1);
  }

  // Per-perspective range checks for declared knobs.
  switch (t.perspective) {
    case 'next_activity': {
      if (t.ngramOrder !== undefined) assertNumberInRange(t.ngramOrder, 'task.ngramOrder', 1, 8);
      if (t.topK !== undefined) assertNumberInRange(t.topK, 'task.topK', 1, 20);
      break;
    }
    case 'drift': {
      if (t.windowSize !== undefined) assertNumberInRange(t.windowSize, 'task.windowSize', 5, 10_000);
      if (t.ewmaAlpha !== undefined) assertNumberInRange(t.ewmaAlpha, 'task.ewmaAlpha', 0.0001, 1);
      if (t.driftThreshold !== undefined)
        assertNumberInRange(t.driftThreshold, 'task.driftThreshold', 0, 1);
      break;
    }
    case 'remaining_time': {
      if (t.aggregator !== undefined && t.aggregator !== 'mean' && t.aggregator !== 'median') {
        throw new PredictionValidationError(
          'param_invalid_type',
          "aggregator must be 'mean' or 'median'",
          'task.aggregator',
        );
      }
      break;
    }
    case 'resource': {
      if (t.ucbC !== undefined) assertNumberInRange(t.ucbC, 'task.ucbC', 0, 100);
      break;
    }
    case 'outcome': {
      if (t.labeller !== undefined && typeof t.labeller !== 'function') {
        throw new PredictionValidationError(
          'param_invalid_type',
          'labeller must be a function when present',
          'task.labeller',
        );
      }
      break;
    }
    case 'features': {
      if (t.includeRework !== undefined && typeof t.includeRework !== 'boolean') {
        throw new PredictionValidationError(
          'param_invalid_type',
          'includeRework must be boolean when present',
          'task.includeRework',
        );
      }
      break;
    }
  }
}

export function validateRequest(req: unknown): asserts req is PredictionRequest {
  if (req === null || typeof req !== 'object') {
    throw new PredictionValidationError('invalid_mode', 'request must be an object', 'request');
  }
  const r = req as Record<string, unknown>;
  validateTask(r.task);
  if (typeof r.mode !== 'string' || !VALID_MODES.includes(r.mode as PredictionMode)) {
    throw new PredictionValidationError(
      'invalid_mode',
      `mode must be one of: ${VALID_MODES.join(', ')}`,
      'request.mode',
    );
  }

  const needsLog = r.mode === 'fit' || r.mode === 'fit_predict';
  const needsPrefixes = r.mode === 'predict' || r.mode === 'fit_predict';
  const needsModel = r.mode === 'predict';

  if (needsLog) {
    if (r.log === undefined) {
      throw new PredictionValidationError(
        'missing_log',
        `mode='${r.mode}' requires request.log`,
        'request.log',
      );
    }
    validateLog(r.log);
  }
  if (needsPrefixes) {
    if (!Array.isArray(r.prefixes) || r.prefixes.length === 0) {
      throw new PredictionValidationError(
        'missing_prefixes',
        `mode='${r.mode}' requires non-empty request.prefixes`,
        'request.prefixes',
      );
    }
    r.prefixes.forEach((p, i) => validateTrace(p, `request.prefixes[${i}]`));
  }
  if (needsModel) {
    if (r.model === undefined || r.model === null) {
      throw new PredictionValidationError(
        'missing_model',
        `mode='predict' requires request.model`,
        'request.model',
      );
    }
    const model = r.model as { perspective?: unknown };
    const taskPerspective = (r.task as { perspective: PredictionPerspective }).perspective;
    if (model.perspective !== taskPerspective) {
      throw new PredictionValidationError(
        'model_mismatch',
        `model.perspective='${String(model.perspective)}' does not match task.perspective='${taskPerspective}'`,
        'request.model.perspective',
      );
    }
  }
}
