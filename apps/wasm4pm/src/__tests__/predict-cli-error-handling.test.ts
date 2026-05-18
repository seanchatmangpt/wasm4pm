import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createError } from '@wasm4pm/contracts';

describe('predict command — PREDICTION_FAILED error handling', () => {
  it('should create PREDICTION_FAILED error with proper remediation', () => {
    const error = createError(
      'PREDICTION_FAILED',
      'Insufficient training data for n-gram order 5'
    );
    
    expect(error.code).toBe('PREDICTION_FAILED');
    expect(error.exit_code).toBe(460);
    expect(error.recoverable).toBe(true);
    expect(error.remediation).toContain('training data');
    expect(error.remediation).toContain('feature configuration');
  });

  it('should have non-empty remediation message', () => {
    const error = createError(
      'PREDICTION_FAILED',
      'Model training failed'
    );
    
    expect(error.remediation).toBeTruthy();
    expect(error.remediation.length).toBeGreaterThan(10);
  });

  it('should mark PREDICTION_FAILED as recoverable', () => {
    const error = createError(
      'PREDICTION_FAILED',
      'Prediction timed out'
    );
    
    expect(error.recoverable).toBe(true);
    // Users can retry with different parameters or smaller data
  });
});
