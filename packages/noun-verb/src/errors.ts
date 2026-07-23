/**
 * Structured error model for the noun-verb framework.
 *
 * TS analog of clap-noun-verb's `NounVerbError` / `StructuredError` /
 * `ErrorKind` (see ~/clap-noun-verb/src/error.rs). Every verb failure is
 * normalized into a `NounVerbError` and serialized to the wire envelope
 * `{ error: { code, message, action_template } }` — this is the ONLY
 * error shape that ever reaches stdout, so agents can always
 * `JSON.parse(stdout)` regardless of success or failure.
 *
 * Exit codes are deliberately NOT baked into this package: the framework
 * ships a sensible default 0-5 mapping, but a host CLI (e.g. wpm) can
 * supply its own `ErrorCodeMap` to `buildCli()` so framework error codes
 * translate onto that host's own exit-code contract
 * (see apps/wasm4pm/src/exit-codes.ts EXIT_CODES).
 */

/** Machine-readable classification of a verb failure. Mirrors Rust's `ErrorKind`. */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'PERMISSION_DENIED'
  | 'INVARIANT_BREACH'
  | 'DEADLINE_EXCEEDED'
  | 'GUARD_EXCEEDED'
  | 'COMMAND_NOT_FOUND'
  | 'VERB_NOT_FOUND'
  | 'EXECUTION_ERROR'
  | 'INTERNAL_ERROR';

export const ERROR_CODES: readonly ErrorCode[] = [
  'INVALID_INPUT',
  'PERMISSION_DENIED',
  'INVARIANT_BREACH',
  'DEADLINE_EXCEEDED',
  'GUARD_EXCEEDED',
  'COMMAND_NOT_FOUND',
  'VERB_NOT_FOUND',
  'EXECUTION_ERROR',
  'INTERNAL_ERROR',
];

/**
 * A suggested recovery action, uniform enough for a MAPE-K style
 * autonomic loop to act on. Mirrors Rust's `ActionTemplate` enum
 * (kept as a discriminated object rather than a closed union so the
 * wire format can grow without a breaking TS type change).
 */
export interface ActionTemplate {
  /** Discriminator, e.g. 'timeout_adjustment' | 'command_fix'. */
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** The ONLY shape a verb error ever serializes to on stdout. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly action_template?: ActionTemplate;
  };
}

/**
 * Normalized verb/framework error. Every thrown value inside a verb
 * handler is coerced to this type before it ever reaches the output
 * layer — see `NounVerbError.from()`.
 */
export class NounVerbError extends Error {
  readonly code: ErrorCode;
  readonly actionTemplate?: ActionTemplate;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { actionTemplate?: ActionTemplate; details?: Record<string, unknown>; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'NounVerbError';
    this.code = code;
    this.actionTemplate = options.actionTemplate;
    this.details = Object.freeze({ ...options.details });
    if (options.cause !== undefined) {
      // `Error.cause` (ES2022) isn't in this package's ES2020 lib target's
      // constructor overload — attach it as a plain property instead.
      (this as { cause?: unknown }).cause = options.cause;
    }
    Object.setPrototypeOf(this, NounVerbError.prototype);
  }

  /** Serialize to the wire envelope `{ error: { code, message, action_template } }`. */
  toEnvelope(): ErrorEnvelope {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.actionTemplate ? { action_template: this.actionTemplate } : {}),
      },
    };
  }

  /** Coerce any thrown value into a `NounVerbError`. Idempotent. */
  static from(err: unknown): NounVerbError {
    if (err instanceof NounVerbError) return err;
    if (err instanceof Error) {
      return new NounVerbError('EXECUTION_ERROR', err.message, { cause: err });
    }
    return new NounVerbError('EXECUTION_ERROR', String(err));
  }

  static invalidInput(message: string, details?: Record<string, unknown>): NounVerbError {
    return new NounVerbError('INVALID_INPUT', message, { details });
  }

  static permissionDenied(message: string, details?: Record<string, unknown>): NounVerbError {
    return new NounVerbError('PERMISSION_DENIED', message, { details });
  }

  static executionError(message: string, cause?: unknown): NounVerbError {
    return new NounVerbError('EXECUTION_ERROR', message, { cause });
  }

  static internalError(message: string, cause?: unknown): NounVerbError {
    return new NounVerbError('INTERNAL_ERROR', message, { cause });
  }

  static commandNotFound(noun: string, candidates: readonly string[] = []): NounVerbError {
    const suggestion = bestMatch(noun, candidates);
    return new NounVerbError('COMMAND_NOT_FOUND', `Command '${noun}' not found`, {
      details: { noun, candidates },
      actionTemplate: suggestion
        ? { kind: 'command_fix', suggested_command: suggestion, reason: `Suggested correction for '${noun}'` }
        : undefined,
    });
  }

  static verbNotFound(noun: string, verb: string, candidates: readonly string[] = []): NounVerbError {
    const suggestion = bestMatch(verb, candidates);
    return new NounVerbError('VERB_NOT_FOUND', `Verb '${verb}' not found for noun '${noun}'`, {
      details: { noun, verb, candidates },
      actionTemplate: suggestion
        ? {
            kind: 'command_fix',
            suggested_command: `${noun} ${suggestion}`,
            reason: `Suggested correction for '${verb}'`,
          }
        : undefined,
    });
  }
}

/** Levenshtein distance — used for "did you mean?" suggestions. */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const cache = Array.from({ length: b.length }, (_, j) => j + 1);
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    dist = i + 1;
    for (let j = 0; j < b.length; j++) {
      const temp = prev;
      prev = cache[j] as number;
      dist = a[i] === b[j] ? temp : Math.min(prev, dist, temp) + 1;
      cache[j] = dist;
    }
  }
  return dist;
}

/** Closest candidate within edit-distance 3 (and shorter than the input), or undefined. */
function bestMatch(input: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist <= 3 && dist < input.length && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Default `ErrorCode` → process exit code mapping (0-5), used when a
 * host CLI doesn't supply its own. A host CLI passes `errorCodeMap` to
 * `buildCli()` to override any subset of these onto its own contract.
 */
export const DEFAULT_ERROR_EXIT_CODES: Readonly<Record<ErrorCode, number>> = Object.freeze({
  INVALID_INPUT: 1,
  COMMAND_NOT_FOUND: 1,
  VERB_NOT_FOUND: 1,
  PERMISSION_DENIED: 5,
  INVARIANT_BREACH: 3,
  DEADLINE_EXCEEDED: 3,
  GUARD_EXCEEDED: 3,
  EXECUTION_ERROR: 3,
  INTERNAL_ERROR: 5,
});

/** Partial override map a host CLI can supply to `buildCli()`. */
export type ErrorCodeMap = Partial<Record<ErrorCode, number>>;

/** Resolve the process exit code for a given error, honoring host overrides. */
export function resolveExitCode(code: ErrorCode, overrides?: ErrorCodeMap): number {
  return overrides?.[code] ?? DEFAULT_ERROR_EXIT_CODES[code];
}
