import { z } from 'zod';

export const QualityThresholdProfileSchema = z.object({
  fitness_min: z.number(),
  precision_min: z.number(),
  generalization_min: z.number(),
  simplicity_min: z.number(),
  rationale: z.string(),
});

export type QualityThresholdProfile = z.infer<typeof QualityThresholdProfileSchema>;

export const ALGORITHM_QUALITY_THRESHOLDS: Record<string, QualityThresholdProfile> = {
  dfg: {
    fitness_min: 0.95,
    precision_min: 0.80,
    generalization_min: 0.70,
    simplicity_min: 0.50,
    rationale: 'DFG replays exactly; low fitness indicates log quality issues',
  },
  inductive_miner: {
    fitness_min: 0.85,
    precision_min: 0.75,
    generalization_min: 0.70,
    simplicity_min: 0.60,
    rationale: 'Guaranteed sound model; fitness reflects real log conformance',
  },
  heuristic_miner: {
    fitness_min: 0.70,
    precision_min: 0.65,
    generalization_min: 0.60,
    simplicity_min: 0.55,
    rationale: 'Approximate discovery; some deviation expected',
  },
  alpha_plus_plus: {
    fitness_min: 0.60,
    precision_min: 0.55,
    generalization_min: 0.55,
    simplicity_min: 0.50,
    rationale: 'Structural algorithm; incomplete models accepted for complex logs',
  },
  genetic_algorithm: {
    fitness_min: 0.75,
    precision_min: 0.70,
    generalization_min: 0.65,
    simplicity_min: 0.55,
    rationale: 'Stochastic convergence; variance in quality expected',
  },
};

export const DEFAULT_QUALITY_THRESHOLD: QualityThresholdProfile = {
  fitness_min: 0.80,
  precision_min: 0.70,
  generalization_min: 0.60,
  simplicity_min: 0.50,
  rationale: 'Conservative baseline for algorithms not specifically calibrated',
};

export function getQualityThreshold(algorithmId: string): QualityThresholdProfile {
  return ALGORITHM_QUALITY_THRESHOLDS[algorithmId] ?? DEFAULT_QUALITY_THRESHOLD;
}
