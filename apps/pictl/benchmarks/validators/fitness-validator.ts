/**
 * Fitness Validator — Token-Based Replay
 *
 * Measures how well a discovered model explains the observed event log.
 * fitness = 1 - (missing + consumed) / (produced + remaining)
 * Range: [0, 1]
 *   0.0 = model explains 0% of observed behavior
 *   1.0 = model explains 100% of observed behavior
 *   >0.85 = acceptable (captures most real behavior)
 */

import { pictl } from '@pictl/cli';
import { Receipt } from '@pictl/contracts';

export interface FitnessResult {
  algorithm: string;
  dataset: string;
  fitness: number;
  missingTokens: number;
  consumedTokens: number;
  producedTokens: number;
  remainingTokens: number;
  logSize: number;
  pass: boolean;
  minThreshold: number;
  reason?: string;
}

/**
 * Measure fitness of discovered model against event log
 *
 * Uses pictl's conformance checking (token-based replay)
 */
export async function measureFitness(
  algorithm: string,
  datasetPath: string,
  minFitnessThreshold: number = 0.85
): Promise<FitnessResult> {
  try {
    // Step 1: Discover model
    const discoveryReceipt = await pictl.run({
      algorithm,
      source: { kind: 'file', path: datasetPath },
      execution: { timeout: 30000 },
    });

    if (discoveryReceipt.status === 'failed') {
      return {
        algorithm,
        dataset: datasetPath,
        fitness: 0,
        missingTokens: 0,
        consumedTokens: 0,
        producedTokens: 0,
        remainingTokens: 0,
        logSize: 0,
        pass: false,
        minThreshold: minFitnessThreshold,
        reason: `Discovery failed: ${discoveryReceipt.summary?.error || 'unknown error'}`,
      };
    }

    // Step 2: Check conformance of model against original log
    // (pictl should provide conformance checking as a built-in)
    const conformanceReceipt = await pictl.run({
      algorithm: 'conformance',
      source: { kind: 'file', path: datasetPath },
      execution: {
        parameters: {
          model: discoveryReceipt.summary, // Use discovered model
        },
        timeout: 30000,
      },
    });

    if (conformanceReceipt.status === 'failed') {
      return {
        algorithm,
        dataset: datasetPath,
        fitness: 0,
        missingTokens: 0,
        consumedTokens: 0,
        producedTokens: 0,
        remainingTokens: 0,
        logSize: 0,
        pass: false,
        minThreshold: minFitnessThreshold,
        reason: `Conformance check failed`,
      };
    }

    // Step 3: Extract fitness metrics from conformance result
    const conformanceSummary = conformanceReceipt.summary;
    const fitness = conformanceSummary.fitness ?? 0;
    const logSize = conformanceSummary.traceCount ?? 0;

    const result: FitnessResult = {
      algorithm,
      dataset: datasetPath,
      fitness,
      missingTokens: conformanceSummary.missingTokens ?? 0,
      consumedTokens: conformanceSummary.consumedTokens ?? 0,
      producedTokens: conformanceSummary.producedTokens ?? 0,
      remainingTokens: conformanceSummary.remainingTokens ?? 0,
      logSize,
      pass: fitness >= minFitnessThreshold,
      minThreshold: minFitnessThreshold,
    };

    if (!result.pass) {
      result.reason = `Fitness ${fitness.toFixed(2)} below threshold ${minFitnessThreshold}`;
    }

    return result;
  } catch (error) {
    return {
      algorithm,
      dataset: datasetPath,
      fitness: 0,
      missingTokens: 0,
      consumedTokens: 0,
      producedTokens: 0,
      remainingTokens: 0,
      logSize: 0,
      pass: false,
      minThreshold: minFitnessThreshold,
      reason: `Exception: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Batch fitness measurement for multiple algorithms
 */
export async function measureFitnessBatch(
  algorithms: Array<{ name: string; minFitness: number }>,
  dataset: string
): Promise<FitnessResult[]> {
  const results: FitnessResult[] = [];

  for (const algo of algorithms) {
    const result = await measureFitness(algo.name, dataset, algo.minFitness);
    results.push(result);
  }

  return results;
}

/**
 * Format fitness results as table
 */
export function formatFitnessReport(results: FitnessResult[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('╔════════════════════════════════════════════════════════════════╗');
  lines.push('║ DISCOVERY ALGORITHM FITNESS REPORT (Token-Based Replay)        ║');
  lines.push('╠════════════════════════════════════════════════════════════════╣');
  lines.push('║ Algorithm          │ Fitness │ Status   │ Logs │ Missing │ Info ║');
  lines.push('├────────────────────┼─────────┼──────────┼──────┼─────────┼──────┤');

  for (const result of results) {
    const status = result.pass ? '✅ PASS' : '❌ FAIL';
    const fitnessStr = result.fitness.toFixed(2);
    const logSizeStr = result.logSize.toString().padStart(5, ' ');
    const missingStr = result.missingTokens.toString().padStart(6, ' ');
    const info = result.reason ? result.reason.substring(0, 20) : '';

    const line = `║ ${result.algorithm.padEnd(18, ' ')} │ ${fitnessStr} │ ${status} │ ${logSizeStr} │ ${missingStr} │ ${info.padEnd(4, ' ')} ║`;
    lines.push(line);
  }

  lines.push('╠════════════════════════════════════════════════════════════════╣');

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  lines.push(`║ Summary: ${passed}/${total} passed (${passRate}%)${' '.repeat(41 - passRate.length)}║`);
  lines.push('╚════════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}
