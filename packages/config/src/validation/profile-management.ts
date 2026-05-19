/**
 * Deployment profile management and capability querying.
 * Enables selection, validation, and documentation of the 5 deployment profiles.
 */

import type { ExecutionProfile } from '../types.js';
import { ALGORITHM_IDS } from '../schema.js';
import type { AlgorithmId } from '../schema.js';

export interface ProfileCapabilities {
  name: ExecutionProfile;
  displayName: string;
  target: string;
  sizeTarget: string;
  description: string;
  algorithms: readonly AlgorithmId[];
  features: string[];
  recommendedFor: string[];
}

/**
 * Get full capability descriptor for a deployment profile.
 */
export function getProfileCapabilities(profile: ExecutionProfile): ProfileCapabilities {
  const capabilities: Record<ExecutionProfile, ProfileCapabilities> = {
    fast: {
      name: 'fast',
      displayName: 'Fast (Latency-Optimized)',
      target: 'Mobile devices, edge workers',
      sizeTarget: '~500KB',
      description: 'Minimal algorithms, single-threaded, no ML/RL',
      algorithms: ['dfg', 'process_skeleton', 'simd_streaming_dfg'] as AlgorithmId[],
      features: ['feature-conformance-basic', 'feature-streaming-basic'],
      recommendedFor: ['quick-test', 'edge-computing', 'CI/CD pipelines'],
    },
    balanced: {
      name: 'balanced',
      displayName: 'Balanced (Default)',
      target: 'General-purpose process mining',
      sizeTarget: '~2-2.5MB',
      description: 'Standard algorithms, basic ML, prediction tasks',
      algorithms: [
        'dfg',
        'process_skeleton',
        'alpha_plus_plus',
        'heuristic_miner',
        'inductive_miner',
        'hill_climbing',
        'declare',
        'ml_classify',
        'ml_cluster',
        'ml_forecast',
        'ml_anomaly',
        'ml_regress',
        'ml_pca',
        // ... and utility algorithms
      ] as AlgorithmId[],
      features: [
        'feature-conformance-basic',
        'feature-streaming-basic',
        'feature-ml',
        'feature-discovery-advanced',
      ],
      recommendedFor: ['production', 'research', 'teaching'],
    },
    quality: {
      name: 'quality',
      displayName: 'Quality (Accuracy-Optimized)',
      target: 'High-accuracy process discovery',
      sizeTarget: '~2.7MB',
      description: 'All algorithms, ML, RL orchestration, full streaming, OCEL',
      algorithms: ALGORITHM_IDS,
      features: [
        'feature-conformance-full',
        'feature-discovery-advanced',
        'feature-ml',
        'feature-ocel',
        'feature-streaming-full',
        'feature-statrs',
      ],
      recommendedFor: ['research', 'conformance-checking', 'complex-logs'],
    },
    stream: {
      name: 'stream',
      displayName: 'Stream (High-Throughput)',
      target: 'Real-time streaming pipelines',
      sizeTarget: '~2.5MB',
      description: 'Streaming algorithms, incremental discovery, drift detection',
      algorithms: [
        'dfg',
        'simd_streaming_dfg',
        'streaming_log',
        'hierarchical_dfg',
        // ... streaming-specific
      ] as AlgorithmId[],
      features: ['feature-streaming-full', 'feature-conformance-basic'],
      recommendedFor: ['streaming-logs', 'real-time-monitoring', 'drift-detection'],
    },
  };

  return capabilities[profile];
}

/**
 * Suggest a deployment profile based on constraints.
 */
export interface ProfileSuggestionConstraints {
  memoryBudgetMb?: number;
  latencyBudgetMs?: number;
  requiredAlgorithms?: string[];
  desiredFeatures?: string[];
}

export function suggestProfile(constraints: ProfileSuggestionConstraints): {
  recommended: ExecutionProfile;
  alternatives: ExecutionProfile[];
  rationale: string;
} {
  const { memoryBudgetMb, latencyBudgetMs, requiredAlgorithms, desiredFeatures } = constraints;

  let candidates: Array<{ profile: ExecutionProfile; score: number; reason: string[] }> = [
    { profile: 'fast', score: 0, reason: [] },
    { profile: 'balanced', score: 0, reason: [] },
    { profile: 'quality', score: 0, reason: [] },
    { profile: 'stream', score: 0, reason: [] },
  ];

  // Memory constraint
  if (memoryBudgetMb) {
    if (memoryBudgetMb < 1) {
      candidates = candidates.filter((c) => c.profile === 'fast');
      candidates[0].reason.push('Memory budget <1MB → fast profile only');
    } else if (memoryBudgetMb < 1.5) {
      candidates = candidates.filter((c) => ['fast', 'stream'].includes(c.profile));
      candidates[0].reason.push('Memory budget <1.5MB → fast/stream profiles');
    } else if (memoryBudgetMb < 2.2) {
      candidates = candidates.filter((c) => c.profile !== 'quality');
      candidates[0].reason.push('Memory budget <2.2MB → exclude quality');
    }
  }

  // Latency constraint
  if (latencyBudgetMs) {
    for (const c of candidates) {
      if (latencyBudgetMs < 100 && c.profile === 'quality') {
        c.score -= 10;
        c.reason.push('Latency budget <100ms; quality profile too slow');
      }
      if (latencyBudgetMs < 1000 && c.profile === 'balanced') {
        c.score -= 2;
      }
    }
  }

  // Required algorithms
  if (requiredAlgorithms && requiredAlgorithms.length > 0) {
    for (const c of candidates) {
      const caps = getProfileCapabilities(c.profile);
      const algosStr = caps.algorithms as readonly string[];
      const missing = requiredAlgorithms.filter((a) => !algosStr.includes(a));
      if (missing.length > 0) {
        c.score -= 100;
        c.reason.push(`Missing algorithms: ${missing.join(', ')}`);
      } else {
        c.score += 5;
        c.reason.push(`Has required algorithms`);
      }
    }
  }

  // Desired features
  if (desiredFeatures && desiredFeatures.length > 0) {
    for (const c of candidates) {
      const caps = getProfileCapabilities(c.profile);
      const hasFeatures = desiredFeatures.filter((f) => caps.features.includes(f)).length;
      c.score += hasFeatures * 3;
      if (hasFeatures > 0) {
        c.reason.push(`Has ${hasFeatures}/${desiredFeatures.length} desired features`);
      }
    }
  }

  // Default scoring if no constraints
  if (!memoryBudgetMb && !latencyBudgetMs && !requiredAlgorithms && !desiredFeatures) {
    // balanced is default
    const balanced = candidates.find((c) => c.profile === 'balanced')!;
    balanced.score += 100;
    balanced.reason.push('Default recommendation');
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  const recommended = candidates[0].profile;
  const alternatives = candidates.slice(1).map((c) => c.profile);

  return {
    recommended,
    alternatives,
    rationale: candidates[0].reason.join('; ') || 'Balanced choice',
  };
}

/**
 * Validate that an algorithm is available in a given profile.
 */
export function validateAlgorithmInProfile(
  algorithm: string,
  profile: ExecutionProfile
): { valid: boolean; error?: string } {
  const caps = getProfileCapabilities(profile);

  if (!(caps.algorithms as readonly string[]).includes(algorithm)) {
    const browserCaps = getProfileCapabilities('quality');
    const inBrowser = (browserCaps.algorithms as readonly string[]).includes(algorithm);

    if (inBrowser) {
      return {
        valid: false,
        error: `Algorithm "${algorithm}" not available in profile "${profile}". Upgrade to "quality" profile or use a different algorithm.`,
      };
    } else {
      return {
        valid: false,
        error: `Algorithm "${algorithm}" is not registered in any profile.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Get a human-readable comparison table of profiles.
 */
export function getProfileComparisonTable(): string {
  const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];
  const rows = profiles.map((p) => {
    const caps = getProfileCapabilities(p);
    return {
      Profile: caps.displayName,
      'Size Target': caps.sizeTarget,
      Algorithms: `~${caps.algorithms.length}`,
      'Use Cases': caps.recommendedFor.slice(0, 2).join(', '),
    };
  });

  // ASCII table
  const header = Object.keys(rows[0]);
  const lines = [
    header.map((h) => h.padEnd(25)).join(' | '),
    header.map(() => '-'.padEnd(25)).join('-+-'),
    ...rows.map((row) =>
      header.map((h) => String(row[h as keyof typeof row]).padEnd(25)).join(' | ')
    ),
  ];

  return lines.join('\n');
}

/**
 * Merge multiple profiles into a union (primarily for documentation).
 * Returns profiles that support all required features.
 */
export function findProfilesWithFeatures(requiredFeatures: string[]): ExecutionProfile[] {
  const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];
  return profiles.filter((p) => {
    const caps = getProfileCapabilities(p);
    return requiredFeatures.every((f) => caps.features.includes(f));
  });
}
