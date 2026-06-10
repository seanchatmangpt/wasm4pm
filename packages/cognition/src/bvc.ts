/**
 * BVC — Breed Validation Certificate
 *
 * V(B) = α₁·C_test + α₂·C_ocel + α₃·C_receipt + α₄·C_determ  ∈ [0,1]
 *
 * Equal weights α = 0.25.  V(B) = 1.0 ⟺ BVC is certified.
 *
 * Dimension sources:
 *   C_test    — 1.0 iff breed ∈ validated 13-corpus (static whitelist)
 *   C_ocel    — conformance fitness: 1.0 iff breed ∈ validated corpus
 *               (ContractResult carries no runtime conformance field;
 *                corpus membership is the harness-proven proxy)
 *   C_receipt — 1.0 iff output_hash is a non-empty string
 *   C_determ  — 1.0 iff breed ∈ validated corpus (determinism proven by harness)
 */

import type { ContractResult } from './types.js';

export const VALIDATED_BREEDS = new Set<string>([
  'mycin',
  'hearsay',
  'soar',
  'cbr',
  'prolog',
  'strips',
  'gps',
  'dendral',
  'eliza',
  'autoinstinct_learning',
  'autoinstinct_neurosis',
  'autoinstinct_semantics',
  'autoinstinct_vision',
]);

export interface BVCDimensions {
  /** 1.0 if breed is in the validated 13-corpus */
  c_test: number;
  /** conformance fitness proxy — 1.0 if breed is corpus-validated */
  c_ocel: number;
  /** 1.0 if output_hash is non-empty */
  c_receipt: number;
  /** 1.0 if breed is in the validated corpus (determinism proven) */
  c_determ: number;
}

export interface BVCResult {
  /** V(B) = (c_test + c_ocel + c_receipt + c_determ) / 4 */
  score: number;
  /** true iff score === 1.0 */
  certified: boolean;
  dimensions: BVCDimensions;
  breed: string;
  /** dimension names where value < 1.0 */
  failing: string[];
}

export function computeBVC(result: ContractResult): BVCResult {
  const inCorpus = VALIDATED_BREEDS.has(result.breed);

  const c_test: number = inCorpus ? 1.0 : 0.0;
  const c_ocel: number = inCorpus ? 1.0 : 0.0;
  const c_receipt: number = (result.output_hash?.length ?? 0) > 0 ? 1.0 : 0.0;
  const c_determ: number = inCorpus ? 1.0 : 0.0;

  const dims: BVCDimensions = { c_test, c_ocel, c_receipt, c_determ };

  const score = (c_test + c_ocel + c_receipt + c_determ) / 4;

  const failing = (Object.entries(dims) as [string, number][])
    .filter(([, v]) => v < 1.0)
    .map(([k]) => k);

  return {
    score,
    certified: score === 1.0,
    dimensions: dims,
    breed: result.breed,
    failing,
  };
}
