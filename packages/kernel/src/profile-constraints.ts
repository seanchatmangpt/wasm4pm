/**
 * profile-constraints.ts
 * Feature gate enforcement and profile-based algorithm validation
 *
 * This module prevents users from attempting to run algorithms that aren't
 * available in their current deployment profile (mobile/iot/edge/fog/browser).
 * It provides:
 * - canRun(algorithmId, profile): check if an algorithm is available
 * - suggestAlternatives(algorithmId, profile): find similar algorithms that ARE available
 * - getAvailableAlgorithms(profile): list all runnable algorithms for a profile
 * - getProfileInfo(profile): human-readable profile description
 */

import { getRegistry } from './registry.js';
import type { DeploymentProfile, AlgorithmMetadata } from './registry.js';

/**
 * Check if an algorithm can run in the given deployment profile
 */
export function canRun(algorithmId: string, profile: DeploymentProfile): boolean {
  const registry = getRegistry();
  const metadata = registry.get(algorithmId);

  if (!metadata) {
    return false;
  }

  return metadata.deploymentProfiles.includes(profile);
}

/**
 * Result of validating an algorithm against a profile
 */
export interface AlgorithmValidationResult {
  /** Whether the algorithm can run in this profile */
  valid: boolean;

  /** Algorithm ID */
  algorithm: string;

  /** Deployment profile */
  profile: DeploymentProfile;

  /** Reason if not valid */
  reason?: string;

  /** Alternative algorithms with the same output type in this profile */
  alternatives?: string[];

  /** Which profiles DO support this algorithm (if not in current profile) */
  availableIn?: DeploymentProfile[];
}

/**
 * Validate that an algorithm is available in a deployment profile
 * If not available, suggests alternatives with the same output type
 */
export function validateAlgorithmInProfile(
  algorithmId: string,
  profile: DeploymentProfile
): AlgorithmValidationResult {
  const registry = getRegistry();
  const metadata = registry.get(algorithmId);

  if (!metadata) {
    return {
      valid: false,
      algorithm: algorithmId,
      profile,
      reason: `Algorithm "${algorithmId}" is not registered in any profile`,
    };
  }

  if (metadata.deploymentProfiles.includes(profile)) {
    return {
      valid: true,
      algorithm: algorithmId,
      profile,
    };
  }

  // Find alternatives with the same output type in the target profile
  const candidates = registry
    .getForDeploymentProfile(profile)
    .filter((m) => m.outputType === metadata.outputType)
    .map((m) => m.id);

  return {
    valid: false,
    algorithm: algorithmId,
    profile,
    reason: `"${algorithmId}" is not available in "${profile}" profile. Requires one of: ${metadata.deploymentProfiles.join(', ')}`,
    alternatives: candidates.length > 0 ? candidates.slice(0, 3) : undefined,
    availableIn: metadata.deploymentProfiles,
  };
}

/**
 * Get all algorithms available in a deployment profile
 */
export function getAvailableAlgorithms(profile: DeploymentProfile): AlgorithmMetadata[] {
  const registry = getRegistry();
  return registry.getForDeploymentProfile(profile);
}

/**
 * Get algorithm IDs for a profile (simplified version)
 */
export function getAvailableAlgorithmIds(profile: DeploymentProfile): string[] {
  return getAvailableAlgorithms(profile).map((a) => a.id);
}

/**
 * Suggest alternative algorithms with the same output type
 */
export function suggestAlternatives(
  algorithmId: string,
  profile: DeploymentProfile
): string[] {
  const registry = getRegistry();
  const metadata = registry.get(algorithmId);

  if (!metadata) {
    return [];
  }

  return registry
    .getForDeploymentProfile(profile)
    .filter((m) => m.outputType === metadata.outputType)
    .map((m) => m.id)
    .slice(0, 5);
}

/**
 * Profile information for display and documentation
 */
export interface ProfileInfo {
  name: DeploymentProfile;
  displayName: string;
  description: string;
  binarySize: string;
  algorithmCount: number;
  supportedOutputTypes: string[];
  recommendedFor: string[];
  notAvailable: string[];
}

/**
 * Get human-readable information about a profile
 */
export function getProfileInfo(profile: DeploymentProfile): ProfileInfo {
  const registry = getRegistry();
  const available = getAvailableAlgorithms(profile);
  const allAlgos = registry.list();
  const notAvailable = allAlgos
    .filter((a) => !a.deploymentProfiles.includes(profile))
    .map((a) => a.id)
    .slice(0, 10); // Show first 10

  const profileDetails: Record<DeploymentProfile, Omit<ProfileInfo, 'notAvailable'>> = {
    mobile: {
      name: 'mobile',
      displayName: 'Mobile',
      description: 'Minimal algorithms for resource-constrained devices',
      binarySize: '~500KB',
      algorithmCount: 0, // Will be populated
      supportedOutputTypes: [],
      recommendedFor: ['quick-test', 'edge-computing', 'CI/CD pipelines', 'mobile apps'],
    },
    iot: {
      name: 'iot',
      displayName: 'IoT',
      description: 'Basic discovery and conformance for IoT devices',
      binarySize: '~1.0MB',
      algorithmCount: 0,
      supportedOutputTypes: [],
      recommendedFor: ['IoT gateways', 'embedded systems', 'basic analysis'],
    },
    edge: {
      name: 'edge',
      displayName: 'Edge',
      description: 'Advanced discovery and basic streaming for edge servers',
      binarySize: '~1.5MB',
      algorithmCount: 0,
      supportedOutputTypes: [],
      recommendedFor: ['CDN workers', 'edge computing', 'streaming pipelines'],
    },
    fog: {
      name: 'fog',
      displayName: 'Fog',
      description: 'Full features except POWL, all ML algorithms, full streaming',
      binarySize: '~2.0MB',
      algorithmCount: 0,
      supportedOutputTypes: [],
      recommendedFor: ['fog computing', 'gateways', 'research', 'production'],
    },
    browser: {
      name: 'browser',
      displayName: 'Browser (Full)',
      description: 'All 49+ algorithms with full feature set',
      binarySize: '~2.7MB',
      algorithmCount: 0,
      supportedOutputTypes: [],
      recommendedFor: ['web applications', 'full-featured research', 'production servers'],
    },
  };

  const info = profileDetails[profile];
  const outputTypes = [...new Set(available.map((a) => a.outputType))];

  return {
    ...info,
    algorithmCount: available.length,
    supportedOutputTypes: outputTypes,
    notAvailable: notAvailable.slice(0, 5),
  };
}

/**
 * Build a comprehensive error message when an algorithm is not available
 */
export function buildAlgorithmUnavailableMessage(
  algorithmId: string,
  profile: DeploymentProfile
): string {
  const validation = validateAlgorithmInProfile(algorithmId, profile);

  if (validation.valid) {
    return ''; // Not unavailable
  }

  const lines: string[] = [];
  lines.push(`Algorithm not available in "${profile}" profile`);
  lines.push('');

  if (validation.reason) {
    lines.push(`  ${validation.reason}`);
  }

  if (validation.alternatives && validation.alternatives.length > 0) {
    lines.push('');
    lines.push(`Suggested alternatives (${validation.alternatives[0].split('_')[0]} algorithms):`);
    for (const alt of validation.alternatives) {
      const meta = getRegistry().get(alt);
      if (meta) {
        lines.push(`  • ${alt} - ${meta.description.slice(0, 50)}...`);
      } else {
        lines.push(`  • ${alt}`);
      }
    }
  }

  if (validation.availableIn && validation.availableIn.length > 0) {
    lines.push('');
    lines.push(`Available in profiles: ${validation.availableIn.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Get profile comparison as ASCII table
 */
export function getProfileComparisonTable(): string {
  const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
  const rows = profiles.map((p) => {
    const info = getProfileInfo(p);
    return {
      Profile: info.displayName,
      Size: info.binarySize,
      Algorithms: String(info.algorithmCount),
      'Use Cases': info.recommendedFor.slice(0, 1).join(', '),
    };
  });

  const header = Object.keys(rows[0]);
  const colWidth = 20;
  const separator = header.map(() => '─'.repeat(colWidth - 2)).join('─┼─');

  const lines = [
    header.map((h) => h.padEnd(colWidth - 2)).join(' │ '),
    separator,
    ...rows.map((row) =>
      header
        .map((h) => String(row[h as keyof typeof row] || '').slice(0, colWidth - 2).padEnd(colWidth - 2))
        .join(' │ ')
    ),
  ];

  return lines.join('\n');
}
