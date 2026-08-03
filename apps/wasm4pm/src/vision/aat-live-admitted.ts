import { blake3Hex } from '../receipts/_shared.js';
import {
  AAT_LIVE_SCHEMA,
  evaluateAatLive as evaluateAatLiveCore,
  type AatLiveInput,
  type AatLiveVerdict,
} from './aat-live.js';
import { canonicalVisionJson } from './session-v2.js';

export * from './aat-live.js';

/**
 * Public AAT-Live admission boundary.
 *
 * The core evaluator recomputes the release certificate itself. This wrapper
 * additionally proves that the supplied independent verification result is for
 * that exact certificate and Git commit, preventing a valid report for one
 * subject from being replayed as authority for another.
 */
export function evaluateAatLive(input: AatLiveInput): AatLiveVerdict {
  const core = evaluateAatLiveCore(input);
  const refusals = [...core.refusals];

  if (input.release_verification.certificate_hash !== input.release.certificate.hash) {
    refusals.push({
      code: 'RELEASE_VERIFICATION_IDENTITY_REFUSED',
      message: 'Independent release verification certificate hash does not match the admitted certificate',
    });
  }
  if (input.release_verification.git_commit !== input.release.package.git_commit) {
    refusals.push({
      code: 'RELEASE_VERIFICATION_IDENTITY_REFUSED',
      message: 'Independent release verification Git commit does not match the admitted certificate',
    });
  }

  if (refusals.length === core.refusals.length) return core;

  const unsigned = {
    schema_version: AAT_LIVE_SCHEMA,
    verdict: 'Refused' as const,
    standing: 'BLOCKED' as const,
    observations: core.observations,
    refusals,
  };
  return {
    ...unsigned,
    evidence_hash: blake3Hex(canonicalVisionJson(unsigned)),
  };
}
