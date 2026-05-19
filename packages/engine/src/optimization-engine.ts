/**
 * Optimization Engine with Algorithm Selection and Cost-Benefit Analysis
 * Recommends algorithms and profiles based on log characteristics
 */

/**
 * Deployment profile options
 */
export type DeploymentProfile = 'mobile' | 'iot' | 'edge' | 'fog' | 'browser';

/**
 * Algorithm characteristics for selection
 */
export interface AlgorithmCharacteristics {
  name: string;
  speedScore: number;         // 0-100 (faster = higher)
  qualityScore: number;       // 0-100 (better model = higher)
  memoryUsageMB: number;
  supportedProfiles: DeploymentProfile[];
}

/**
 * Log characteristics for algorithm selection
 */
export interface LogCharacteristics {
  eventCount: number;
  traceCount: number;
  uniqueActivities: number;
  avgTraceLength: number;
  estimatedMemoryUsageMB: number; // Caller estimates
}

/**
 * Algorithm recommendation with cost-benefit score
 */
export interface AlgorithmRecommendation {
  algorithmName: string;
  costBenefitScore: number;     // 0-1, higher = better trade-off
  speedPotential: number;       // 0-1
  qualityPotential: number;     // 0-1
  estimatedTimeMs: number;
  rationale: string;
}

/**
 * Profile recommendation with reasoning
 */
export interface ProfileRecommendation {
  profile: DeploymentProfile;
  memoryHeadroom: number;       // MB available after deployment
  costScore: number;            // 0-1 based on resource fit
  rationale: string;
}

/**
 * Optimization result with action recommendations
 */
export interface OptimizationResult {
  recommendedAlgorithm: AlgorithmRecommendation;
  recommendedProfile: ProfileRecommendation;
  costBenefitAnalysis: {
    timeTradeoff: number;       // normalized speed vs quality
    resourceTradeoff: number;   // normalized CPU vs memory
    overallScore: number;       // weighted combination
  };
  rationale: string;
}

/**
 * Algorithm selection based on log characteristics
 */
export function recommendAlgorithm(
  characteristics: AlgorithmCharacteristics[],
  logChars: LogCharacteristics,
  preferences: { speedBias?: number; qualityBias?: number } = {},
): AlgorithmRecommendation {
  const speedBias = preferences.speedBias ?? 0.5;
  const qualityBias = preferences.qualityBias ?? 0.5;

  // Estimate time: more events → more time needed
  // Baseline: 100 events/ms on medium hardware
  const baselineTimeMs = logChars.eventCount / 100;

  const candidates = characteristics.map((algo) => {
    // Cost-benefit: balance speed and quality against estimated time
    // Higher speed score and quality score are better
    // But memory must fit
    const canFit = algo.memoryUsageMB <= logChars.estimatedMemoryUsageMB * 0.8;
    if (!canFit) return null;

    const speedPotential = Math.min(1.0, algo.speedScore / 100);
    const qualityPotential = Math.min(1.0, algo.qualityScore / 100);

    // Cost-benefit: weighted sum, normalized
    const costBenefitScore =
      speedPotential * speedBias + qualityPotential * qualityBias;

    // Estimate actual time: baseline adjusted by algo speed
    const estimatedTimeMs = baselineTimeMs / (speedPotential || 0.5);

    return {
      algorithmName: algo.name,
      costBenefitScore,
      speedPotential,
      qualityPotential,
      estimatedTimeMs,
      rationale: `speed=${speedPotential.toFixed(2)}, quality=${qualityPotential.toFixed(2)}, time=${estimatedTimeMs.toFixed(0)}ms`,
    };
  }).filter((r) => r !== null) as AlgorithmRecommendation[];

  if (candidates.length === 0) {
    // Fallback
    return {
      algorithmName: 'dfg',
      costBenefitScore: 0.5,
      speedPotential: 0.9,
      qualityPotential: 0.3,
      estimatedTimeMs: baselineTimeMs,
      rationale: 'fallback to dfg due to no suitable candidates',
    };
  }

  return candidates.reduce((best, algo) =>
    algo.costBenefitScore > best.costBenefitScore ? algo : best,
  );
}

/**
 * Profile recommendation based on log size
 */
export function recommendProfile(
  logChars: LogCharacteristics,
): ProfileRecommendation {
  const profileLimits: Record<DeploymentProfile, number> = {
    mobile: 500,      // MB WASM + data
    iot: 1000,
    edge: 1500,
    fog: 2000,
    browser: 2700,
  };

  const totalNeededMB = logChars.estimatedMemoryUsageMB * 1.2; // 20% safety margin

  // Find smallest profile that fits
  const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];
  let recommendedProfile: DeploymentProfile = 'browser';
  let costScore = 0.3;
  let memoryHeadroom = profileLimits['browser'] - totalNeededMB;

  for (const profile of profiles) {
    const limit = profileLimits[profile];
    if (totalNeededMB <= limit * 0.9) {
      recommendedProfile = profile;
      memoryHeadroom = limit - totalNeededMB;
      // Cost score: 1.0 if memory fills 50-80% of limit, degrades outside
      const utilization = totalNeededMB / limit;
      if (utilization >= 0.5 && utilization <= 0.8) {
        costScore = 1.0;
      } else if (utilization < 0.5) {
        costScore = Math.max(0.4, 1.0 - (0.5 - utilization) * 2);
      } else {
        costScore = Math.max(0.3, 1.0 - (utilization - 0.8) * 2);
      }
      break;
    }
  }

  const rationale =
    `total_needed=${totalNeededMB.toFixed(0)}MB, ` +
    `profile_limit=${profileLimits[recommendedProfile]}MB, ` +
    `headroom=${memoryHeadroom.toFixed(0)}MB, ` +
    `cost_score=${costScore.toFixed(2)}`;

  return {
    profile: recommendedProfile,
    memoryHeadroom: Math.max(0, memoryHeadroom),
    costScore,
    rationale,
  };
}

/**
 * Comprehensive optimization with algorithm and profile recommendations
 */
export function optimize(
  algorithms: AlgorithmCharacteristics[],
  logChars: LogCharacteristics,
  preferences: { speedBias?: number; qualityBias?: number } = {},
): OptimizationResult {
  const algoRec = recommendAlgorithm(algorithms, logChars, preferences);
  const profileRec = recommendProfile(logChars);

  // Time tradeoff: measure improvement from baseline
  const baselineTimeMs = logChars.eventCount / 50; // Slower baseline
  const timeTradeoff = Math.min(1.0, baselineTimeMs / Math.max(1, algoRec.estimatedTimeMs));

  // Resource tradeoff: profile cost score
  const resourceTradeoff = profileRec.costScore;

  // Overall score: weighted combination
  const overallScore = timeTradeoff * 0.5 + resourceTradeoff * 0.5;

  const rationale =
    `algorithm=${algoRec.algorithmName} (${algoRec.costBenefitScore.toFixed(2)}), ` +
    `profile=${profileRec.profile} (${profileRec.costScore.toFixed(2)}), ` +
    `overall_score=${overallScore.toFixed(2)}`;

  return {
    recommendedAlgorithm: algoRec,
    recommendedProfile: profileRec,
    costBenefitAnalysis: {
      timeTradeoff,
      resourceTradeoff,
      overallScore,
    },
    rationale,
  };
}
