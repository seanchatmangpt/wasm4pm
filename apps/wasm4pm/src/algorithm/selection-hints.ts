/**
 * Algorithm Selection Hints
 * Suggests optimal algorithms based on log characteristics
 */

export interface LogCharacteristics {
  eventCount: number;
  traceCount: number;
  uniqueActivities: number;
  avgTraceLength: number;
  variance?: number;
  complexity?: 'low' | 'medium' | 'high';
}

export interface AlgorithmRecommendation {
  algorithmId: string;
  name: string;
  reason: string;
  speedTier: 'fast' | 'balanced' | 'quality';
  estimatedDuration: string;
  fitnessPrediction: string;
}

/**
 * Suggest algorithms based on log characteristics
 * @param eventCount Total number of events in log
 * @param traceCount Number of traces (cases)
 * @param uniqueActivities Number of distinct activities
 * @returns Array of algorithm recommendations sorted by relevance
 */
export function suggestAlgorithm(
  eventCount: number,
  traceCount: number,
  uniqueActivities: number
): AlgorithmRecommendation[] {
  const avgTraceLength = eventCount / Math.max(traceCount, 1);
  const recommendations: AlgorithmRecommendation[] = [];

  // Rule 1: Very small logs (<100 events) — use fast algorithms
  if (eventCount < 100) {
    recommendations.push({
      algorithmId: 'dfg',
      name: 'Directly-Follows Graph',
      reason: 'Fast algorithm ideal for small exploratory logs',
      speedTier: 'fast',
      estimatedDuration: '<10ms',
      fitnessPrediction: 'Low (simple model)',
    });
    recommendations.push({
      algorithmId: 'process_skeleton',
      name: 'Process Skeleton',
      reason: 'Lightweight discovery for quick analysis',
      speedTier: 'fast',
      estimatedDuration: '<10ms',
      fitnessPrediction: 'Low',
    });
    recommendations.push({
      algorithmId: 'alpha_plus_plus',
      name: 'Alpha Plus Plus',
      reason: 'Sound Petri nets for simple processes',
      speedTier: 'balanced',
      estimatedDuration: '20ms',
      fitnessPrediction: 'Medium',
    });
  }

  // Rule 2: Small logs (100-1K events) — balanced algorithms
  else if (eventCount < 1000) {
    recommendations.push({
      algorithmId: 'heuristic_miner',
      name: 'Heuristic Miner',
      reason: 'Balanced speed/quality; handles noise well',
      speedTier: 'balanced',
      estimatedDuration: '25ms',
      fitnessPrediction: 'Medium-High',
    });
    recommendations.push({
      algorithmId: 'inductive_miner',
      name: 'Inductive Miner',
      reason: 'Guarantees sound model; good generalization',
      speedTier: 'balanced',
      estimatedDuration: '30ms',
      fitnessPrediction: 'High',
    });
    recommendations.push({
      algorithmId: 'alpha_plus_plus',
      name: 'Alpha Plus Plus',
      reason: 'Sound discovery for structured processes',
      speedTier: 'balanced',
      estimatedDuration: '20ms',
      fitnessPrediction: 'Medium',
    });
  }

  // Rule 3: Medium logs (1K-10K events) — quality algorithms
  else if (eventCount < 10000) {
    // Check complexity based on unique activities
    if (uniqueActivities > 50) {
      recommendations.push({
        algorithmId: 'genetic_algorithm',
        name: 'Genetic Algorithm',
        reason: 'Best quality for complex processes with many variants',
        speedTier: 'quality',
        estimatedDuration: '75-150ms',
        fitnessPrediction: 'High',
      });
      recommendations.push({
        algorithmId: 'aco',
        name: 'Ant Colony Optimization',
        reason: 'Competitive quality, good for exploration',
        speedTier: 'quality',
        estimatedDuration: '65ms',
        fitnessPrediction: 'High',
      });
      recommendations.push({
        algorithmId: 'simulated_annealing',
        name: 'Simulated Annealing',
        reason: 'Good convergence for complex process models',
        speedTier: 'quality',
        estimatedDuration: '55ms',
        fitnessPrediction: 'Medium-High',
      });
    } else {
      recommendations.push({
        algorithmId: 'inductive_miner',
        name: 'Inductive Miner',
        reason: 'Scalable and guaranteed sound',
        speedTier: 'balanced',
        estimatedDuration: '30-50ms',
        fitnessPrediction: 'High',
      });
      recommendations.push({
        algorithmId: 'genetic_algorithm',
        name: 'Genetic Algorithm',
        reason: 'High-quality model for moderate complexity',
        speedTier: 'quality',
        estimatedDuration: '100ms',
        fitnessPrediction: 'High',
      });
    }
  }

  // Rule 4: Large logs (10K+ events) — scalable algorithms
  else {
    // For large logs, avoid expensive algorithms
    recommendations.push({
      algorithmId: 'heuristic_miner',
      name: 'Heuristic Miner',
      reason: 'Scalable for large logs; inherently noise-tolerant',
      speedTier: 'balanced',
      estimatedDuration: '25-50ms',
      fitnessPrediction: 'Medium-High',
    });

    // Only recommend genetic/ilp if events < 100K
    if (eventCount < 100000) {
      recommendations.push({
        algorithmId: 'genetic_algorithm',
        name: 'Genetic Algorithm',
        reason: 'High quality if time permits (may be slow)',
        speedTier: 'quality',
        estimatedDuration: '200-500ms',
        fitnessPrediction: 'High',
      });
    }

    recommendations.push({
      algorithmId: 'dfg',
      name: 'Directly-Follows Graph',
      reason: 'Fast baseline for very large logs',
      speedTier: 'fast',
      estimatedDuration: '5-20ms',
      fitnessPrediction: 'Low-Medium',
    });
  }

  // Rule 5: Low-variance process (short, consistent traces) — use simpler algorithms
  if (avgTraceLength < 5) {
    if (!recommendations.find((r) => r.algorithmId === 'alpha_plus_plus')) {
      recommendations.unshift({
        algorithmId: 'alpha_plus_plus',
        name: 'Alpha Plus Plus',
        reason: 'Excellent for simple, structured processes',
        speedTier: 'balanced',
        estimatedDuration: '20ms',
        fitnessPrediction: 'High',
      });
    }
  }

  // Rule 6: High-variance process (long, variable traces) — use robust algorithms
  if (avgTraceLength > 20) {
    if (!recommendations.find((r) => r.algorithmId === 'genetic_algorithm')) {
      recommendations.unshift({
        algorithmId: 'genetic_algorithm',
        name: 'Genetic Algorithm',
        reason: 'Robust handling of complex, variable-length traces',
        speedTier: 'quality',
        estimatedDuration: '75-150ms',
        fitnessPrediction: 'High',
      });
    }
  }

  return recommendations;
}

/**
 * Get a human-readable explanation of algorithm selection
 * @param eventCount Number of events
 * @param traceCount Number of traces
 * @param uniqueActivities Number of unique activities
 * @returns Explanation string
 */
export function explainAlgorithmSelection(
  eventCount: number,
  traceCount: number,
  uniqueActivities: number
): string {
  const recommendations = suggestAlgorithm(eventCount, traceCount, uniqueActivities);
  const avgTraceLength = eventCount / Math.max(traceCount, 1);

  const lines: string[] = [];
  lines.push('');
  lines.push('Algorithm Selection Analysis:');
  lines.push(`  Log size: ${eventCount} events, ${traceCount} traces, ${uniqueActivities} activities`);
  lines.push(`  Avg trace length: ${avgTraceLength.toFixed(2)}`);
  lines.push('');
  lines.push('Recommended algorithms (in order of relevance):');
  lines.push('');

  for (let i = 0; i < Math.min(recommendations.length, 3); i++) {
    const rec = recommendations[i];
    lines.push(`  ${i + 1}. ${rec.name} (${rec.algorithmId})`);
    lines.push(`     ${rec.reason}`);
    lines.push(`     Speed: ${rec.speedTier} | Duration: ${rec.estimatedDuration} | Fitness: ${rec.fitnessPrediction}`);
    lines.push('');
  }

  lines.push('Try: wpm run <log.xes> --algorithm ' + recommendations[0].algorithmId);
  lines.push('     or: wpm compare ' + recommendations.slice(0, 3).map((r) => r.algorithmId).join(',') + ' -i <log.xes>');
  lines.push('');

  return lines.join('\n');
}
