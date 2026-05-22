/**
 * Parity Verification: Verify that plan(config) == explain(config)
 *
 * Rank-1 Oracle: Both plan() and explain() derive from same source (kernel registry),
 * so outputs must be identical.
 *
 * Verifies:
 * - Algorithm names match
 * - Parameter descriptions match exactly
 * - Profile recommendations match
 * - Timing estimates within 5% margin
 */

export interface ParityResult {
  matches: boolean;
  planOutput: string;
  explainOutput: string;
  differences: ParityDifference[];
  confidence: number; // 0.0-1.0: how well results match
}

export interface ParityDifference {
  field: string;
  expected: string;
  actual: string;
  severity: 'critical' | 'major' | 'minor';
}

/**
 * Verify parity between plan() and explain() outputs
 */
export async function verifyParity(plan: () => string, explain: () => string): Promise<ParityResult> {
  const planOutput = plan();
  const explainOutput = explain();

  const differences: ParityDifference[] = [];

  // Parse outputs to structured form (simplified)
  const planLines = planOutput.split('\n').filter(l => l.trim());
  const explainLines = explainOutput.split('\n').filter(l => l.trim());

  // Check algorithm name
  const planAlgo = extractAlgorithmName(planOutput);
  const explainAlgo = extractAlgorithmName(explainOutput);

  if (planAlgo !== explainAlgo) {
    differences.push({
      field: 'algorithm_name',
      expected: explainAlgo || 'unknown',
      actual: planAlgo || 'unknown',
      severity: 'critical',
    });
  }

  // Check parameter descriptions
  const planParams = extractParameters(planOutput);
  const explainParams = extractParameters(explainOutput);

  for (const [key, planValue] of Object.entries(planParams)) {
    const explainValue = explainParams[key];
    if (explainValue && planValue !== explainValue) {
      differences.push({
        field: `parameter_${key}`,
        expected: explainValue,
        actual: planValue,
        severity: 'major',
      });
    }
  }

  // Check profile recommendations
  const planProfile = extractProfile(planOutput);
  const explainProfile = extractProfile(explainOutput);

  if (planProfile !== explainProfile) {
    differences.push({
      field: 'profile',
      expected: explainProfile || 'unknown',
      actual: planProfile || 'unknown',
      severity: 'major',
    });
  }

  // Check timing estimates (within 5% margin)
  const planTiming = extractTiming(planOutput);
  const explainTiming = extractTiming(explainOutput);

  if (planTiming && explainTiming) {
    const margin = 0.05;
    const maxDiff = Math.max(planTiming, explainTiming) * margin;
    if (Math.abs(planTiming - explainTiming) > maxDiff) {
      differences.push({
        field: 'timing_estimate',
        expected: `${explainTiming.toFixed(2)}ms`,
        actual: `${planTiming.toFixed(2)}ms`,
        severity: 'minor',
      });
    }
  }

  // Calculate confidence score based on differences
  let confidence = 1.0;
  for (const diff of differences) {
    switch (diff.severity) {
      case 'critical':
        confidence -= 0.5;
        break;
      case 'major':
        confidence -= 0.2;
        break;
      case 'minor':
        confidence -= 0.05;
        break;
    }
  }
  confidence = Math.max(0.0, Math.min(1.0, confidence));

  return {
    matches: differences.length === 0,
    planOutput,
    explainOutput,
    differences,
    confidence,
  };
}

/**
 * Extract algorithm name from plan/explain output
 */
function extractAlgorithmName(output: string): string | null {
  const match = output.match(/(?:algorithm|discovery method)[:\s]+([a-z_]+)/i);
  return match ? match[1] : null;
}

/**
 * Extract parameter descriptions from output
 */
function extractParameters(output: string): Record<string, string> {
  const params: Record<string, string> = {};
  const paramLines = output.match(/(?:param|parameter)[:\s]+([^:]+)[:\s]+(.+?)(?=\n|$)/gi) || [];

  for (const line of paramLines) {
    const match = line.match(/([a-z_]+)\s*:\s*(.+)/i);
    if (match) {
      params[match[1].toLowerCase()] = match[2].trim();
    }
  }

  return params;
}

/**
 * Extract profile recommendation from output
 */
function extractProfile(output: string): string | null {
  const match = output.match(/profile[:\s]+(\w+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract timing estimate from output (in milliseconds)
 */
function extractTiming(output: string): number | null {
  const match = output.match(/(?:timing|estimate)[:\s]+(\d+(?:\.\d+)?)\s*m?s/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Validate parity result against threshold
 */
export function validateParityResult(result: ParityResult, confidenceThreshold: number = 0.95): boolean {
  if (result.confidence < confidenceThreshold) {
    console.warn(`Parity validation failed: confidence ${result.confidence} < ${confidenceThreshold}`);
    return false;
  }

  const criticalDiffs = result.differences.filter(d => d.severity === 'critical');
  if (criticalDiffs.length > 0) {
    console.warn(`Parity validation failed: ${criticalDiffs.length} critical differences`);
    return false;
  }

  return true;
}
