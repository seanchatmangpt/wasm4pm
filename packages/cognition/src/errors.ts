//! Structured error class for the cognition boundary.
//!
//! Zero decision logic — only carries a code, message, and optional cause/details
//! across the WASM boundary so callers can dispatch on `error.code` without
//! string-matching message text.

export type CognitionErrorCode =
  | 'WASM_INIT_FAILED'
  | 'INPUT_SERIALIZE_FAILED'
  | 'OUTPUT_PARSE_FAILED'
  | 'OUTPUT_SHAPE_INVALID'
  | 'BREED_FAILED'
  | 'VERIFY_FAILED'
  | 'REPLAY_NOT_FOUND'
  | 'SYSTEM_BUILD_FAILED'
  | 'SYSTEM_VERIFY_FAILED'
  | 'SESSION_INPUT_INVALID'
  | 'SESSION_EXECUTION_FAILED'
  | 'SESSION_REFUSED';

export interface CognitionErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class CognitionError extends Error {
  public readonly code: CognitionErrorCode;
  public readonly cause?: unknown;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: CognitionErrorCode,
    options: CognitionErrorOptions = {},
  ) {
    super(message);
    this.name = 'CognitionError';
    this.code = code;
    this.cause = options.cause;
    this.details = options.details;
    Object.setPrototypeOf(this, CognitionError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
