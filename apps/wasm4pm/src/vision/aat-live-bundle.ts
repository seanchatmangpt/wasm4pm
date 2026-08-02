import { blake3Hex } from '../receipts/_shared.js';
import {
  evaluateAatLive,
  replayAatLive,
  type AatLiveInput,
  type AatLiveVerdict,
} from './aat-live.js';
import { canonicalVisionJson } from './session-v2.js';

export interface AatLiveBundle {
  readonly schema_version: 'wasm4pm.aat-live-bundle.v1';
  readonly input: AatLiveInput;
  readonly verdict: AatLiveVerdict;
  readonly bundle_hash: string;
}

export interface AatLiveBundleVerification {
  readonly valid: boolean;
  readonly bundle_hash: string;
  readonly observed_bundle_hash: string;
  readonly replay_standing: 'ALIVE' | 'BLOCKED';
  readonly issues: readonly string[];
  readonly observed: AatLiveVerdict;
}

export function computeAatLiveBundleHash(
  bundle: Omit<AatLiveBundle, 'bundle_hash'> | AatLiveBundle
): string {
  const { bundle_hash: _ignored, ...unsigned } = bundle as AatLiveBundle;
  return blake3Hex(canonicalVisionJson(unsigned));
}

export function buildAatLiveBundle(input: AatLiveInput, verdict: AatLiveVerdict): AatLiveBundle {
  const unsigned = {
    schema_version: 'wasm4pm.aat-live-bundle.v1' as const,
    input,
    verdict,
  };
  return { ...unsigned, bundle_hash: computeAatLiveBundleHash(unsigned) };
}

export function verifyAatLiveBundle(bundle: AatLiveBundle): AatLiveBundleVerification {
  const issues: string[] = [];
  const observedBundleHash = computeAatLiveBundleHash(bundle);
  if (bundle.schema_version !== 'wasm4pm.aat-live-bundle.v1') {
    issues.push(`unsupported schema ${String(bundle.schema_version)}`);
  }
  if (observedBundleHash !== bundle.bundle_hash) issues.push('bundle hash mismatch');

  const observed = evaluateAatLive(bundle.input);
  const replay = replayAatLive(bundle.verdict, observed);
  if (replay.standing !== 'ALIVE') {
    issues.push(`verdict replay mismatch: ${replay.mismatches.join(', ')}`);
  }
  if (observed.verdict !== 'Accepted' || !observed.passport) {
    issues.push(
      `bundle subject is not Accepted: ${observed.refusals.map((refusal) => refusal.code).join(', ')}`
    );
  }

  return {
    valid: issues.length === 0,
    bundle_hash: bundle.bundle_hash,
    observed_bundle_hash: observedBundleHash,
    replay_standing: replay.standing,
    issues,
    observed,
  };
}
