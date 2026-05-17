/**
 * introspection/general.ts
 *
 * General algorithm introspection APIs for the 41-algorithm registry.
 * Bridges the AlgorithmRegistry with the AGENT1-001 API surface.
 */

import { getRegistry } from '../registry.js';
import type { AlgorithmMetadata, DeploymentProfile } from '../registry.js';

export type { AlgorithmMetadata, DeploymentProfile };

/** Result of validating an algorithm against a deployment profile */
export interface ValidationResult {
  valid: boolean;
  algorithm: string;
  profile: DeploymentProfile;
  /** Reasons why the algorithm is not available in this profile */
  reasons?: string[];
  /** Alternative algorithms available in the requested profile */
  alternatives?: string[];
}

/** Capabilities summary for a deployment profile */
export interface ProfileCapabilities {
  profile: DeploymentProfile;
  availableAlgorithms: string[];
  count: number;
  supportedOutputTypes: string[];
  /** Approximate compiled WASM binary size */
  estimatedBinarySize: string;
}

const PROFILE_SIZES: Record<DeploymentProfile, string> = {
  browser: '~2.7MB', // full-featured default (wasm-pack bundler target)
  fog: '~2.0MB',
  edge: '~1.5MB',
  iot: '~1.0MB',
  mobile: '~500KB',
};

/**
 * Get full metadata for a registered algorithm by ID.
 *
 * @example
 * ```typescript
 * import { getAlgorithmMetadata } from '@wasm4pm/kernel/introspection';
 * const meta = getAlgorithmMetadata('dfg');
 * console.log(meta?.speedTier);  // 5
 * ```
 */
export function getAlgorithmMetadata(name: string): AlgorithmMetadata | undefined {
  return getRegistry().get(name);
}

/**
 * List all algorithm IDs available in a deployment profile.
 *
 * @example
 * ```typescript
 * const ids = listAlgorithmsByProfile('browser');
 * console.log(ids.length);  // 41
 * ```
 */
export function listAlgorithmsByProfile(profile: DeploymentProfile): string[] {
  return getRegistry()
    .getForDeploymentProfile(profile)
    .map((m) => m.id);
}

/**
 * Validate whether an algorithm is available in a deployment profile.
 * If not valid, suggests alternative algorithms that are available.
 *
 * @example
 * ```typescript
 * const result = validateAlgorithmInProfile('ilp', 'iot');
 * if (!result.valid) {
 *   console.log(result.reasons);      // ["ilp is not in iot profile"]
 *   console.log(result.alternatives); // ["dfg", "heuristic_miner"]
 * }
 * ```
 */
export function validateAlgorithmInProfile(
  algo: string,
  profile: DeploymentProfile
): ValidationResult {
  const registry = getRegistry();
  const meta = registry.get(algo);

  if (!meta) {
    const available = registry.getForDeploymentProfile(profile).map((m) => m.id);
    return {
      valid: false,
      algorithm: algo,
      profile,
      reasons: [`Algorithm "${algo}" is not registered`],
      alternatives: available.slice(0, 5),
    };
  }

  const inProfile = meta.deploymentProfiles.includes(profile);
  if (inProfile) {
    return { valid: true, algorithm: algo, profile };
  }

  // Find alternatives with same output type in the target profile
  const candidates = registry
    .getForDeploymentProfile(profile)
    .filter((m) => m.outputType === meta.outputType)
    .map((m) => m.id);

  return {
    valid: false,
    algorithm: algo,
    profile,
    reasons: [
      `"${algo}" is not available in the "${profile}" deployment profile`,
      `"${algo}" supports profiles: ${meta.deploymentProfiles.join(', ')}`,
    ],
    alternatives: candidates.slice(0, 5),
  };
}

/**
 * Get a capability summary for a deployment profile.
 *
 * @example
 * ```typescript
 * const caps = getProfileCapabilities('browser');
 * console.log(caps.count);               // 41
 * console.log(caps.estimatedBinarySize); // "~2.7MB"
 * ```
 */
export function getProfileCapabilities(profile: DeploymentProfile): ProfileCapabilities {
  const algorithms = getRegistry().getForDeploymentProfile(profile);
  const ids = algorithms.map((m) => m.id);
  const outputTypes = [...new Set(algorithms.map((m) => m.outputType))];

  return {
    profile,
    availableAlgorithms: ids,
    count: ids.length,
    supportedOutputTypes: outputTypes,
    estimatedBinarySize: PROFILE_SIZES[profile] ?? 'unknown',
  };
}
