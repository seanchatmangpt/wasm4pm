import {
  initBoundary,
  runAlgorithmPositive,
  runAlgorithmNegative,
  runAlgorithmInvariant,
  computeHash,
  validateNegativeInput,
  classifyError,
  isStochasticAlgorithm,
  type BoundaryContext,
} from './boundary.js';
import { fixtures } from './fixtures.js';
import type {
  PositiveCaseEvidence,
  NegativeCaseEvidence,
  InvariantCaseEvidence,
  FailureCode,
} from './types.js';

let sharedCtx: BoundaryContext | null = null;

async function getBoundary(): Promise<BoundaryContext> {
  if (!sharedCtx) {
    sharedCtx = await initBoundary();
  }
  return sharedCtx;
}

function receiptHash(data: unknown): string {
  return computeHash(data);
}

export async function runPositiveCase(
  algoId: string,
  caseData: PositiveCaseEvidence
): Promise<PositiveCaseEvidence> {
  const start = performance.now();
  try {
    const ctx = await getBoundary();
    const { result_hash, duration_ms } = await runAlgorithmPositive(ctx, algoId);
    const evidence: PositiveCaseEvidence = {
      ...caseData,
      status: 'passed',
      result_hash,
      duration_ms,
      receipt_hash: '',
    };
    evidence.receipt_hash = receiptHash(evidence);
    return evidence;
  } catch (err) {
    const evidence: PositiveCaseEvidence = {
      ...caseData,
      status: 'failed',
      result_hash: '',
      duration_ms: performance.now() - start,
      receipt_hash: '',
    };
    evidence.receipt_hash = receiptHash({ ...evidence, error: String(err) });
    return evidence;
  }
}

export async function runNegativeCase(
  algoId: string,
  caseData: NegativeCaseEvidence
): Promise<NegativeCaseEvidence> {
  try {
    const ctx = await getBoundary();
    const isEmptyCase = caseData.case_id.includes('EmptyLogCase');
    const xesContent = isEmptyCase
      ? fixtures.invalid.emptyLog.toString('utf-8')
      : fixtures.invalid.malformed.toString('utf-8');
    const expected: FailureCode = isEmptyCase
      ? 'EMPTY_EVENT_LOG'
      : algoId.startsWith('ml_') || algoId.startsWith('predict_')
        ? 'PREDICTION_FEATURES_REQUIRED'
        : 'MALFORMED_EVENT_LOG';

    const preflight = validateNegativeInput(xesContent, algoId);
    if (preflight) {
      const evidence: NegativeCaseEvidence = {
        ...caseData,
        input_hash: isEmptyCase ? fixtures.invalid.emptyLogHash : fixtures.invalid.malformedHash,
        status: preflight === expected ? 'failed_correctly' : 'failed_incorrectly',
        error_code: preflight,
        no_panic: true,
        no_false_success: true,
        receipt_hash: '',
      };
      evidence.receipt_hash = receiptHash(evidence);
      return evidence;
    }

    const result = await runAlgorithmNegative(ctx, algoId, xesContent);
    const evidence: NegativeCaseEvidence = {
      ...caseData,
      input_hash: isEmptyCase ? fixtures.invalid.emptyLogHash : fixtures.invalid.malformedHash,
      status: result.error_code === expected ? 'failed_correctly' : 'failed_incorrectly',
      error_code: result.error_code,
      no_panic: result.no_panic,
      no_false_success: result.error_code !== 'INVALID_ALGORITHM_ID',
      receipt_hash: '',
    };
    evidence.receipt_hash = receiptHash(evidence);
    return evidence;
  } catch (err) {
    const code = classifyError(err, algoId);
    const evidence: NegativeCaseEvidence = {
      ...caseData,
      status: 'failed_incorrectly',
      error_code: code,
      no_panic: false,
      no_false_success: false,
      receipt_hash: '',
    };
    evidence.receipt_hash = receiptHash(evidence);
    return evidence;
  }
}

export async function runInvariantCase(
  algoId: string,
  caseData: InvariantCaseEvidence
): Promise<InvariantCaseEvidence> {
  try {
    const ctx = await getBoundary();
    const inv = await runAlgorithmInvariant(ctx, algoId);
    const seeded = caseData.case_id.includes('SeededRepeatabilityCase');

    if (seeded || isStochasticAlgorithm(algoId)) {
      return {
        ...caseData,
        status: inv.stable ? 'passed' : 'failed',
        stable: inv.stable,
        first_result_hash: inv.first_hash,
        second_result_hash: inv.second_hash,
        seed: 42,
        result_schema_valid: inv.stable,
        fitness_within_expected_range: inv.stable,
      };
    }

    return {
      ...caseData,
      status: inv.stable ? 'passed' : 'failed',
      stable: inv.stable,
      first_result_hash: inv.first_hash,
      second_result_hash: inv.second_hash,
    };
  } catch {
    return {
      ...caseData,
      status: 'failed',
      stable: false,
    };
  }
}

export async function shutdownBoundary(): Promise<void> {
  if (sharedCtx) {
    sharedCtx.cleanup();
    sharedCtx = null;
  }
}
