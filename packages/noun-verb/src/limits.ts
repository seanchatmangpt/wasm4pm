import { NounVerbError } from './errors.js';

export const DEFAULT_STDIN_MAX_BYTES = 16 * 1024 * 1024;
export const DEFAULT_STDIN_TIMEOUT_MS = 30_000;
export const DEFAULT_OUTPUT_MAX_BYTES = 64 * 1024 * 1024;

export function boundedIntegerFromEnv(
  name: string,
  fallback: number,
  bounds: { min: number; max: number }
): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^[0-9]+$/.test(raw)) {
    throw NounVerbError.invalidInput(`${name} must be a base-10 positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
    throw NounVerbError.invalidInput(
      `${name} must be between ${bounds.min} and ${bounds.max}`
    );
  }
  return value;
}

export function guardExceeded(
  message: string,
  details: Record<string, unknown>
): NounVerbError {
  return new NounVerbError('GUARD_EXCEEDED', message, {
    details,
    actionTemplate: {
      kind: 'resource_limit',
      ...details,
    },
  });
}

export function deadlineExceeded(
  message: string,
  details: Record<string, unknown>
): NounVerbError {
  return new NounVerbError('DEADLINE_EXCEEDED', message, {
    details,
    actionTemplate: {
      kind: 'timeout_adjustment',
      ...details,
    },
  });
}
