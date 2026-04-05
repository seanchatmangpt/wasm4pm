/**
 * Expected outputs for parity and determinism testing.
 */

export interface ExpectedReceipt {
  status: 'success' | 'partial' | 'failed';
  hasRunId: boolean;
  hasConfigHash: boolean;
  hasInputHash: boolean;
  hasPlanHash: boolean;
  hasDuration: boolean;
}

export interface ExpectedExplainOutput {
  containsSteps: boolean;
  containsAlgorithm: boolean;
  containsProfile: boolean;
  containsSource: boolean;
  stepCount: number;
}

/** Expected receipt shape for a successful run */
export const SUCCESS_RECEIPT: ExpectedReceipt = {
  status: 'success',
  hasRunId: true,
  hasConfigHash: true,
  hasInputHash: true,
  hasPlanHash: true,
  hasDuration: true,
};

/** Expected receipt shape for a partial failure */
export const PARTIAL_RECEIPT: ExpectedReceipt = {
  status: 'partial',
  hasRunId: true,
  hasConfigHash: true,
  hasInputHash: true,
  hasPlanHash: true,
  hasDuration: true,
};

/** Expected receipt shape for a failed run */
export const FAILED_RECEIPT: ExpectedReceipt = {
  status: 'failed',
  hasRunId: true,
  hasConfigHash: true,
  hasInputHash: true,
  hasPlanHash: true,
  hasDuration: true,
};

/** Validate a receipt object matches expected shape */
export function validateReceiptShape(receipt: Record<string, unknown>, expected: ExpectedReceipt): string[] {
  const errors: string[] = [];

  if (receipt.status !== expected.status) {
    errors.push(`status: expected '${expected.status}', got '${receipt.status}'`);
  }
  if (expected.hasRunId && !receipt.run_id && !receipt.runId) {
    errors.push('missing run_id');
  }
  if (expected.hasConfigHash && !receipt.config_hash && !receipt.configHash) {
    errors.push('missing config_hash');
  }
  if (expected.hasInputHash && !receipt.input_hash && !receipt.inputHash) {
    errors.push('missing input_hash');
  }
  if (expected.hasPlanHash && !receipt.plan_hash && !receipt.planHash) {
    errors.push('missing plan_hash');
  }
  if (expected.hasDuration) {
    const dur = receipt.duration_ms ?? receipt.durationMs;
    if (dur === undefined || dur === null) {
      errors.push('missing duration_ms');
    }
  }
  return errors;
}

/** Validate explain output contains expected structure */
export function validateExplainOutput(output: string, expected: ExpectedExplainOutput): string[] {
  const errors: string[] = [];
  const lines = output.split('\n').filter(l => l.trim());

  if (expected.containsSteps) {
    const stepPattern = /step|phase|stage/i;
    if (!stepPattern.test(output)) {
      errors.push('explain output does not mention steps/phases/stages');
    }
  }
  if (expected.containsAlgorithm) {
    const algoPattern = /algorithm|discovery|dfg|alpha|heuristic|genetic|ilp/i;
    if (!algoPattern.test(output)) {
      errors.push('explain output does not mention algorithm');
    }
  }
  if (expected.containsProfile) {
    const profilePattern = /fast|balanced|quality|stream/i;
    if (!profilePattern.test(output)) {
      errors.push('explain output does not mention execution profile');
    }
  }
  if (expected.containsSource) {
    const sourcePattern = /source|file|http|stream|inline/i;
    if (!sourcePattern.test(output)) {
      errors.push('explain output does not mention source');
    }
  }
  if (expected.stepCount > 0 && lines.length < expected.stepCount) {
    errors.push(`explain output has ${lines.length} lines, expected at least ${expected.stepCount}`);
  }
  return errors;
}
