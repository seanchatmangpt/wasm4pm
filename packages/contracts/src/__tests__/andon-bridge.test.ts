/**
 * Andon Bridge Tests
 * Covers all 19 closed mcpp: codes, type guard, forward mapping,
 * reverse mapping, and round-trip fidelity.
 */

import { describe, it, expect } from 'vitest';
import {
  MCPP_ANDON_CODES,
  ANDON_TO_ERROR_CODE,
  andonToWasm4pmError,
  wasm4pmErrorToAndon,
  isMcppAndonCode,
  type McppAndonReason,
  type McppAndonCode,
} from '../andon-bridge.js';
import { TYPED_ERROR_CODES } from '../errors.js';

// ---------------------------------------------------------------------------
// MCPP_ANDON_CODES
// ---------------------------------------------------------------------------

describe('MCPP_ANDON_CODES', () => {
  it('contains exactly 19 codes', () => {
    expect(MCPP_ANDON_CODES).toHaveLength(19);
  });

  it('contains all 11 conformance codes', () => {
    const conformanceCodes: McppAndonCode[] = [
      'ActivityOnlyFakeRoute',
      'RouteConformanceGap',
      'MissingRequiredStages',
      'RouteSequenceMismatch',
      'PartialOrderViolation',
      'LifecycleNotTerminated',
      'CardinalityViolation',
      'ObjectLifecycleViolation',
      'ReceiptSchemaViolation',
      'InsufficientReceiptCoverage',
      'TestRouteIncomplete',
    ];
    for (const code of conformanceCodes) {
      expect(MCPP_ANDON_CODES).toContain(code);
    }
  });

  it('contains all 5 envelope codes', () => {
    const envelopeCodes: McppAndonCode[] = [
      'VersionMismatch',
      'PartNotFound',
      'PolicyDowngradeRejected',
      'InputHashMismatch',
      'ManifestUnsigned',
    ];
    for (const code of envelopeCodes) {
      expect(MCPP_ANDON_CODES).toContain(code);
    }
  });

  it('contains all 3 gap-closure codes (v26.5.16 Slice B)', () => {
    const gapCodes: McppAndonCode[] = [
      'EvidenceContinuityGap',
      'GapClosureUnauthorized',
      'GapClosureExhausted',
    ];
    for (const code of gapCodes) {
      expect(MCPP_ANDON_CODES).toContain(code);
    }
  });

  it('has no duplicate entries', () => {
    const unique = new Set(MCPP_ANDON_CODES);
    expect(unique.size).toBe(MCPP_ANDON_CODES.length);
  });
});

// ---------------------------------------------------------------------------
// isMcppAndonCode
// ---------------------------------------------------------------------------

describe('isMcppAndonCode', () => {
  it('returns true for a valid andon code', () => {
    expect(isMcppAndonCode('RouteConformanceGap')).toBe(true);
  });

  it('returns true for each of the 19 known codes', () => {
    for (const code of MCPP_ANDON_CODES) {
      expect(isMcppAndonCode(code)).toBe(true);
    }
  });

  it('returns false for an unknown string', () => {
    expect(isMcppAndonCode('UnknownCode')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isMcppAndonCode('')).toBe(false);
  });

  it('returns false for a string that is a prefix of a valid code', () => {
    expect(isMcppAndonCode('Route')).toBe(false);
  });

  it('returns false for a near-miss code with wrong casing', () => {
    expect(isMcppAndonCode('routeconformancegap')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ANDON_TO_ERROR_CODE
// ---------------------------------------------------------------------------

describe('ANDON_TO_ERROR_CODE', () => {
  it('has exactly 19 entries — one per Andon code', () => {
    expect(Object.keys(ANDON_TO_ERROR_CODE)).toHaveLength(19);
  });

  it('every key is a known Andon code', () => {
    for (const key of Object.keys(ANDON_TO_ERROR_CODE)) {
      expect(isMcppAndonCode(key)).toBe(true);
    }
  });

  it('maps all 11 conformance codes to CONFORMANCE_FAILED', () => {
    const conformanceCodes: McppAndonCode[] = [
      'ActivityOnlyFakeRoute',
      'RouteConformanceGap',
      'MissingRequiredStages',
      'RouteSequenceMismatch',
      'PartialOrderViolation',
      'LifecycleNotTerminated',
      'CardinalityViolation',
      'ObjectLifecycleViolation',
      'ReceiptSchemaViolation',
      'InsufficientReceiptCoverage',
      'TestRouteIncomplete',
    ];
    for (const code of conformanceCodes) {
      expect(ANDON_TO_ERROR_CODE[code]).toBe('CONFORMANCE_FAILED');
    }
  });

  it('maps VersionMismatch to SOURCE_INVALID', () => {
    expect(ANDON_TO_ERROR_CODE['VersionMismatch']).toBe('SOURCE_INVALID');
  });

  it('maps PartNotFound to SOURCE_NOT_FOUND', () => {
    expect(ANDON_TO_ERROR_CODE['PartNotFound']).toBe('SOURCE_NOT_FOUND');
  });

  it('maps PolicyDowngradeRejected to VALIDATION_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['PolicyDowngradeRejected']).toBe('VALIDATION_FAILED');
  });

  it('maps InputHashMismatch to VALIDATION_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['InputHashMismatch']).toBe('VALIDATION_FAILED');
  });

  it('maps ManifestUnsigned to VALIDATION_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['ManifestUnsigned']).toBe('VALIDATION_FAILED');
  });

  it('maps EvidenceContinuityGap to ALGORITHM_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['EvidenceContinuityGap']).toBe('ALGORITHM_FAILED');
  });

  it('maps GapClosureUnauthorized to VALIDATION_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['GapClosureUnauthorized']).toBe('VALIDATION_FAILED');
  });

  it('maps GapClosureExhausted to ALGORITHM_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['GapClosureExhausted']).toBe('ALGORITHM_FAILED');
  });
});

// ---------------------------------------------------------------------------
// andonToWasm4pmError — forward mapping
// ---------------------------------------------------------------------------

describe('andonToWasm4pmError', () => {
  it('returns a TypedError with schema_version 1.0', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.schema_version).toBe('1.0');
  });

  it('maps a conformance-failure andon to numeric code for CONFORMANCE_FAILED', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('maps ActivityOnlyFakeRoute to CONFORMANCE_FAILED numeric code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ActivityOnlyFakeRoute' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('maps VersionMismatch to SOURCE_INVALID numeric code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'VersionMismatch' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.SOURCE_INVALID);
  });

  it('maps PartNotFound to SOURCE_NOT_FOUND numeric code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'PartNotFound' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.SOURCE_NOT_FOUND);
  });

  it('maps EvidenceContinuityGap to ALGORITHM_FAILED numeric code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'EvidenceContinuityGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.ALGORITHM_FAILED);
  });

  it('maps ManifestUnsigned to VALIDATION_FAILED numeric code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ManifestUnsigned' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });

  it('includes andon_namespace and andon_code in context', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.context['andon_namespace']).toBe('mcpp');
    expect(err.context['andon_code']).toBe('RouteConformanceGap');
  });

  it('includes andon_detail in context when provided', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'fitness=0.83 < required=1.0',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.context['andon_detail']).toBe('fitness=0.83 < required=1.0');
  });

  it('omits andon_detail from context when not provided', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.context).not.toHaveProperty('andon_detail');
  });

  it('includes andon_evidence_ref in context when provided', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      evidence_ref: 'proof-pack:ocel/observed.jsonl#trace=3',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.context['andon_evidence_ref']).toBe('proof-pack:ocel/observed.jsonl#trace=3');
  });

  it('builds message containing namespace and code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(andon);
    expect(err.message).toContain('mcpp');
    expect(err.message).toContain('RouteConformanceGap');
  });

  it('appends detail to message when provided', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'fitness=0.83 < required=1.0',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.message).toContain('fitness=0.83 < required=1.0');
  });

  it('populates remediation with a non-empty string', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'MissingRequiredStages' };
    const err = andonToWasm4pmError(andon);
    expect(typeof err.remediation).toBe('string');
    expect(err.remediation.length).toBeGreaterThan(0);
  });

  it('falls back to CONFORMANCE_FAILED numeric code for unknown mcpp: code', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'SomeFutureCode' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('falls back to CONFORMANCE_FAILED numeric code for extension namespace', () => {
    const andon: McppAndonReason = { namespace: 'extension/vendor', code: 'VendorError' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('falls back to CONFORMANCE_FAILED numeric code for onto namespace', () => {
    const andon: McppAndonReason = { namespace: 'onto', code: 'SomeOntoCode' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });
});

// ---------------------------------------------------------------------------
// wasm4pmErrorToAndon — reverse mapping
// ---------------------------------------------------------------------------

describe('wasm4pmErrorToAndon', () => {
  it('reconstructs the original andon when context fields are present (lossless round-trip)', () => {
    const original: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'fitness=0.83 < required=1.0',
      evidence_ref: 'proof-pack:ocel/observed.jsonl#trace=3',
    };
    const err = andonToWasm4pmError(original);
    const recovered = wasm4pmErrorToAndon(err);
    expect(recovered).toEqual(original);
  });

  it('round-trip: namespace is mcpp for a known mcpp: code', () => {
    const original: McppAndonReason = { namespace: 'mcpp', code: 'ManifestUnsigned' };
    const err = andonToWasm4pmError(original);
    const recovered = wasm4pmErrorToAndon(err);
    expect(recovered.namespace).toBe('mcpp');
    expect(recovered.code).toBe('ManifestUnsigned');
  });

  it('round-trip: extension namespace is preserved', () => {
    const original: McppAndonReason = { namespace: 'extension/vendor', code: 'VendorError' };
    const err = andonToWasm4pmError(original);
    const recovered = wasm4pmErrorToAndon(err);
    expect(recovered.namespace).toBe('extension/vendor');
    expect(recovered.code).toBe('VendorError');
  });

  it('returns a fallback andon when context does not carry andon fields', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.CONFORMANCE_FAILED,
      message: 'conformance error',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(typeof andon.namespace).toBe('string');
    expect(typeof andon.code).toBe('string');
    expect(andon.code.length).toBeGreaterThan(0);
  });

  it('fallback for CONFORMANCE_FAILED returns namespace mcpp', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.CONFORMANCE_FAILED,
      message: 'conformance error',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(andon.namespace).toBe('mcpp');
  });

  it('fallback for CONFORMANCE_FAILED returns a known mcpp code', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.CONFORMANCE_FAILED,
      message: 'conformance error',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(isMcppAndonCode(andon.code)).toBe(true);
  });

  it('fallback for ALGORITHM_FAILED returns namespace mcpp', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.ALGORITHM_FAILED,
      message: 'algorithm error',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(andon.namespace).toBe('mcpp');
  });

  it('fallback for SOURCE_NOT_FOUND returns namespace mcpp', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.SOURCE_NOT_FOUND,
      message: 'not found',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(andon.namespace).toBe('mcpp');
  });

  it('fallback for SOURCE_INVALID returns namespace mcpp', () => {
    const err = {
      schema_version: '1.0' as const,
      code: TYPED_ERROR_CODES.SOURCE_INVALID,
      message: 'invalid source',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(andon.namespace).toBe('mcpp');
  });

  it('unknown numeric code produces a non-empty code string', () => {
    const err = {
      schema_version: '1.0' as const,
      code: 99, // not in the fallback table
      message: 'unknown',
      remediation: 'fix it',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(typeof andon.code).toBe('string');
    expect(andon.code.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trip exhaustive: all 19 codes
// ---------------------------------------------------------------------------

describe('round-trip fidelity for all 19 mcpp: codes', () => {
  for (const code of MCPP_ANDON_CODES) {
    it(`round-trip preserves namespace and code for ${code}`, () => {
      const original: McppAndonReason = { namespace: 'mcpp', code };
      const err = andonToWasm4pmError(original);
      const recovered = wasm4pmErrorToAndon(err);
      expect(recovered.namespace).toBe('mcpp');
      expect(recovered.code).toBe(code);
    });
  }
});

// ---------------------------------------------------------------------------
// Enterprise / LIVE-check coverage
//
// These tests validate the andon-bridge properties that mcpp's LIVE checks
// depend on. Organised by the LIVE rule they guard.
// ---------------------------------------------------------------------------

// LIVE-02 / LIVE-03: conformance below 1.0 must always produce a refusal signal
describe('enterprise: conformance < 1.0 produces andon signal (LIVE-02/LIVE-03)', () => {
  it('RouteConformanceGap with detail mentioning fitness < 1.0 maps to CONFORMANCE_FAILED', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'fitness=0.83 < required=1.0',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('RouteConformanceGap detail is preserved in message so it is visible to the caller', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'precision=0.72 < required=1.0',
    };
    const err = andonToWasm4pmError(andon);
    // Message must surface the sub-1.0 value so the operator can diagnose it
    expect(err.message).toContain('precision=0.72 < required=1.0');
  });

  it('all 11 conformance-family codes produce the same CONFORMANCE_FAILED numeric code', () => {
    const conformanceCodes: McppAndonCode[] = [
      'ActivityOnlyFakeRoute',
      'RouteConformanceGap',
      'MissingRequiredStages',
      'RouteSequenceMismatch',
      'PartialOrderViolation',
      'LifecycleNotTerminated',
      'CardinalityViolation',
      'ObjectLifecycleViolation',
      'ReceiptSchemaViolation',
      'InsufficientReceiptCoverage',
      'TestRouteIncomplete',
    ];
    for (const code of conformanceCodes) {
      const err = andonToWasm4pmError({ namespace: 'mcpp', code });
      expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
    }
  });
});

// LIVE-03: a Refused verdict must not emit a receipt; the bridge must signal this clearly
describe('enterprise: refused verdict produces RouteConformanceGap or a conformance-family code (LIVE-03)', () => {
  it('andon code for a refused verdict (RouteConformanceGap) maps to CONFORMANCE_FAILED', () => {
    const refusal: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'verdict=Refused',
    };
    const err = andonToWasm4pmError(refusal);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('the remediation for RouteConformanceGap is non-empty and actionable', () => {
    const refusal: McppAndonReason = { namespace: 'mcpp', code: 'RouteConformanceGap' };
    const err = andonToWasm4pmError(refusal);
    expect(err.remediation.length).toBeGreaterThan(20);
    // The remediation should guide the user toward fixing the model/log alignment
    expect(err.remediation.toLowerCase()).toContain('conform');
  });
});

// LIVE-04: only proof_aggregator can emit Accepted — GapClosureUnauthorized catches
// non-permitted actors trying to close gaps
describe('enterprise: LIVE-04 actor authority — GapClosureUnauthorized must map to VALIDATION_FAILED', () => {
  it('GapClosureUnauthorized maps to VALIDATION_FAILED (not CONFORMANCE_FAILED)', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'GapClosureUnauthorized',
      detail: 'actor=route_coordinator is not in gap_closure_authority',
    };
    const err = andonToWasm4pmError(andon);
    // Authority violation is a policy-validation failure, not an algorithm/conformance issue
    expect(err.code).toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });

  it('GapClosureUnauthorized message references the unauthorised source detail', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'GapClosureUnauthorized',
      detail: 'actor=route_coordinator is not in gap_closure_authority',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.message).toContain('route_coordinator');
  });

  it('GapClosureUnauthorized remediation tells the caller to use gap_closure_authority', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'GapClosureUnauthorized' };
    const err = andonToWasm4pmError(andon);
    expect(err.remediation.toLowerCase()).toMatch(/authorized|permit|authority/);
  });
});

// LIVE-09 / Z-P09: route_coordinator MUST NOT be recommended as alternate evidence source.
// The bridge must NOT map GapClosureUnauthorized to a success-adjacent code.
describe('enterprise: LIVE-09 / Z-P09 — route_coordinator is never a valid evidence source', () => {
  it('Z-P09: GapClosureUnauthorized from route_coordinator does NOT produce a success code', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'GapClosureUnauthorized',
      detail: 'source=route_coordinator not in permit-list',
    };
    const err = andonToWasm4pmError(andon);
    // Must not be 0 (success), must not be any sub-error of a "continue" path
    expect(err.code).not.toBe(0);
    // Must be a clear failure code, not algorithm (which could be retried)
    expect(err.code).toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });

  it('Z-P09: GapClosureUnauthorized round-trip preserves the refusal evidence', () => {
    const original: McppAndonReason = {
      namespace: 'mcpp',
      code: 'GapClosureUnauthorized',
      detail: 'source=route_coordinator not in permit-list',
      evidence_ref: 'proof-pack:ocel/observed.jsonl#gap=3',
    };
    const err = andonToWasm4pmError(original);
    const recovered = wasm4pmErrorToAndon(err);
    expect(recovered.code).toBe('GapClosureUnauthorized');
    expect(recovered.evidence_ref).toBe('proof-pack:ocel/observed.jsonl#gap=3');
  });

  it('A-P09: GapClosureExhausted maps to ALGORITHM_FAILED (not VALIDATION_FAILED)', () => {
    // Gap closure exhaustion is an algorithm-level failure (ran out of retries),
    // distinct from the authority violation (wrong actor — VALIDATION_FAILED).
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'GapClosureExhausted' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.ALGORITHM_FAILED);
    expect(err.code).not.toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });
});

// LIVE-04 / A-P09: proof_aggregator is the ONLY valid signer
describe('enterprise: LIVE-04 / A-P09 — ManifestUnsigned maps to VALIDATION_FAILED (signing gate)', () => {
  it('ManifestUnsigned maps to VALIDATION_FAILED', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ManifestUnsigned' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });

  it('ManifestUnsigned remediation mentions signing key or Ed25519', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ManifestUnsigned' };
    const err = andonToWasm4pmError(andon);
    // Should direct the operator to sign with the authorized key
    expect(err.remediation.toLowerCase()).toMatch(/sign|ed25519|key/);
  });
});

// Namespace format contract: mcpp andon codes use the "namespace:code" format
describe('enterprise: AndonReason namespace format matches mcpp wire protocol', () => {
  it('all 19 closed codes use the "mcpp" namespace (not "extension/mcpp" or others)', () => {
    // When these codes are recovered from a TypedError via wasm4pmErrorToAndon,
    // they must carry namespace === "mcpp" (closed namespace).
    for (const code of MCPP_ANDON_CODES) {
      const original: McppAndonReason = { namespace: 'mcpp', code };
      const err = andonToWasm4pmError(original);
      const recovered = wasm4pmErrorToAndon(err);
      expect(recovered.namespace).toBe('mcpp');
    }
  });

  it('extension namespace codes survive round-trip with correct namespace prefix', () => {
    const original: McppAndonReason = {
      namespace: 'extension/automl',
      code: 'RouteModelInvalid',
    };
    const err = andonToWasm4pmError(original);
    const recovered = wasm4pmErrorToAndon(err);
    expect(recovered.namespace).toBe('extension/automl');
    expect(recovered.code).toBe('RouteModelInvalid');
  });

  it('unknown numeric code falls back to "extension/wasm4pm" namespace (not "mcpp")', () => {
    // Codes not in the fallback table must NOT claim to be mcpp namespace
    const err = {
      schema_version: '1.0' as const,
      code: 99,
      message: 'unknown error',
      remediation: 'investigate',
      context: {},
    };
    const andon = wasm4pmErrorToAndon(err);
    expect(andon.namespace).toBe('extension/wasm4pm');
  });
});

// Receipts: InsufficientReceiptCoverage must block route admission
describe('enterprise: receipt coverage andon signals (LIVE-02/LIVE-03)', () => {
  it('InsufficientReceiptCoverage maps to CONFORMANCE_FAILED', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'InsufficientReceiptCoverage' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('ReceiptSchemaViolation maps to CONFORMANCE_FAILED', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ReceiptSchemaViolation' };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFORMANCE_FAILED);
  });

  it('ReceiptSchemaViolation remediation mentions regenerating the receipt', () => {
    const andon: McppAndonReason = { namespace: 'mcpp', code: 'ReceiptSchemaViolation' };
    const err = andonToWasm4pmError(andon);
    expect(err.remediation.toLowerCase()).toMatch(/receipt|regenerat|schema/);
  });
});

// InputHashMismatch is a tamper/corruption signal
describe('enterprise: InputHashMismatch is a validation failure (not a source error)', () => {
  it('InputHashMismatch maps to VALIDATION_FAILED', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'InputHashMismatch',
      detail: 'expected=abc123 actual=def456',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.code).toBe(TYPED_ERROR_CODES.VALIDATION_FAILED);
  });

  it('InputHashMismatch message contains the detail with expected/actual hashes', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'InputHashMismatch',
      detail: 'expected=abc123 actual=def456',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.message).toContain('expected=abc123 actual=def456');
  });
});
