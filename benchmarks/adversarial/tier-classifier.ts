/**
 * Tier Classifier — Algorithm Classification Post-Audit
 *
 * After running the audit, classify each algorithm into tiers:
 * - Tier 0: Production-ready (correct output, fitness ≥ 0.85, latency < 5s at 500K)
 * - Tier 1: Experimental (correct output, slow or low precision)
 * - Tier 2: Wrong (crashes, wrong output type, low fitness)
 * - Tier 3: Lie (no WASM export, stub implementation, wrong name mapping)
 */

import { AlgorithmResult } from './quality-pipeline.js';

export type AlgorithmTier = 0 | 1 | 2 | 3;

export interface TierClassification {
  algorithm: string;
  tier: AlgorithmTier;
  reasons: string[];
  recommendation: string;
}

export interface TierSummary {
  tier0: string[];
  tier1: string[];
  tier2: string[];
  tier3: string[];
  totalAlgorithms: number;
  productionReady: number;
}

/**
 * Classify algorithm into tier based on audit results.
 *
 * Tier 0: Production
 *   - Output type matches registry claim (no "lies")
 *   - WASM export exists (no NOT_EXPORTED)
 *   - Fitness === 1.0 (valid process model)
 *   - Latency < 5s at 500K events
 *   - No crashes
 *
 * Tier 1: Experimental
 *   - Correct output type and export
 *   - But slow (latency 5–30s at 500K)
 *   - Or low precision/generalization
 *
 * Tier 2: Wrong
 *   - Crashes during execution
 *   - Wrong output type (DFG when registry says petrinet)
 *   - Fitness < 0.85 for declared fitness-capable algorithms
 *   - Name mapping broken (wasmFn mismatch)
 *
 * Tier 3: Lie
 *   - No WASM export (wasmFn = 'NOT_EXPORTED')
 *   - Stub implementation (e.g., inductive_miner just calls discover_dfg)
 *   - No WASM function found at all
 */
export function classifyAlgorithm(
  result: AlgorithmResult,
  registryMetadata: {
    id: string;
    wasmFn: string;
    outputType: string;
    fitnessCapable: boolean;
    expectedLatencyBudgetMs: number;
    description: string;
  }
): TierClassification {
  const reasons: string[] = [];

  // Tier 3: Lies (highest priority — remove immediately)
  if (registryMetadata.wasmFn === 'NOT_EXPORTED') {
    reasons.push(`No WASM export: ${registryMetadata.wasmFn}`);
    return {
      algorithm: result.algorithm,
      tier: 3,
      reasons,
      recommendation: 'REMOVE from registry — no WASM implementation',
    };
  }

  if (registryMetadata.description.includes('STUB')) {
    reasons.push(`Stub implementation: ${registryMetadata.description}`);
    return {
      algorithm: result.algorithm,
      tier: 3,
      reasons,
      recommendation: 'REMOVE or RENAME — not a real implementation',
    };
  }

  // Check if algorithm crashed
  if (result.crashed) {
    reasons.push(`Algorithm crashed: ${result.error}`);
    return {
      algorithm: result.algorithm,
      tier: 2,
      reasons,
      recommendation: 'FIX or REMOVE — crashes on standard input',
    };
  }

  // Check output type mismatch (Tier 2)
  if (result.outputType !== registryMetadata.outputType) {
    reasons.push(
      `Output type mismatch: registry says ${registryMetadata.outputType}, actual is ${result.outputType}`
    );
    // Still check other criteria, but this is a hard failure
  }

  // Check fitness requirement (Tier 2 if failed)
  if (registryMetadata.fitnessCapable && result.quality.fitness < 1.0) {
    reasons.push(
      `Fitness too low for admission: ${result.quality.fitness.toFixed(3)} < 1.0 (Andon Pull)`
    );
  }

  // Tier 2: Wrong (Wrong type, low fitness, slow)
  if (result.outputType !== registryMetadata.outputType || (registryMetadata.fitnessCapable && result.quality.fitness < 1.0)) {
    return {
      algorithm: result.algorithm,
      tier: 2,
      reasons,
      recommendation: 'FIX — correct output type and/or improve fitness',
    };
  }

  // Check latency at 500K budget
  const budgetMs = registryMetadata.expectedLatencyBudgetMs;
  if (result.latencyMs > budgetMs) {
    reasons.push(
      `Latency exceeds budget: ${result.latencyMs.toFixed(1)}ms > ${budgetMs}ms at 500K events`
    );
  }

  // Tier 1: Experimental (correct but slow or low precision)
  if (result.latencyMs > 5000 || result.quality.precision < 0.5) {
    if (result.latencyMs > 5000) {
      reasons.push(`Slow: ${result.latencyMs.toFixed(1)}ms > 5s at 500K`);
    }
    if (result.quality.precision < 0.5) {
      reasons.push(`Low precision: ${result.quality.precision.toFixed(3)}`);
    }
    return {
      algorithm: result.algorithm,
      tier: 1,
      reasons,
      recommendation: 'Keep in registry but mark @experimental or @slow',
    };
  }

  // Tier 0: Production-ready
  if (result.latencyMs <= 5000 && result.quality.fitness >= 0.85) {
    reasons.push(`Production-ready: fitness=${result.quality.fitness.toFixed(3)}, latency=${result.latencyMs.toFixed(1)}ms`);
    return {
      algorithm: result.algorithm,
      tier: 0,
      reasons,
      recommendation: 'KEEP in Tier 0 production algorithms',
    };
  }

  // Default Tier 1 if unclear
  return {
    algorithm: result.algorithm,
    tier: 1,
    reasons: reasons.length > 0 ? reasons : ['Unclear classification'],
    recommendation: 'Review classification manually',
  };
}

/**
 * Classify all results.
 */
export function classifyAll(
  results: AlgorithmResult[],
  registryMetadata: Map<string, any>
): TierClassification[] {
  return results.map((result) => {
    const meta = registryMetadata.get(result.algorithm);
    if (!meta) {
      return {
        algorithm: result.algorithm,
        tier: 3,
        reasons: ['Algorithm not in registry metadata'],
        recommendation: 'REMOVE — unknown algorithm',
      };
    }
    return classifyAlgorithm(result, meta);
  });
}

/**
 * Summarize tiers.
 */
export function summarizeTiers(classifications: TierClassification[]): TierSummary {
  const tier0 = classifications.filter((c) => c.tier === 0).map((c) => c.algorithm);
  const tier1 = classifications.filter((c) => c.tier === 1).map((c) => c.algorithm);
  const tier2 = classifications.filter((c) => c.tier === 2).map((c) => c.algorithm);
  const tier3 = classifications.filter((c) => c.tier === 3).map((c) => c.algorithm);

  return {
    tier0,
    tier1,
    tier2,
    tier3,
    totalAlgorithms: classifications.length,
    productionReady: tier0.length,
  };
}

/**
 * Print tier summary (human-readable report).
 */
export function printTierSummary(summary: TierSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('╔════════════════════════════════════════════╗');
  lines.push('║   Algorithm Tier Classification Summary    ║');
  lines.push('╚════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`📊 Total Algorithms: ${summary.totalAlgorithms}`);
  lines.push(`✅ Tier 0 (Production): ${summary.tier0.length}`);
  if (summary.tier0.length > 0) {
    lines.push(`   ${summary.tier0.join(', ')}`);
  }
  lines.push(`⚠️  Tier 1 (Experimental): ${summary.tier1.length}`);
  if (summary.tier1.length > 0) {
    lines.push(`   ${summary.tier1.join(', ')}`);
  }
  lines.push(`❌ Tier 2 (Wrong): ${summary.tier2.length}`);
  if (summary.tier2.length > 0) {
    lines.push(`   ${summary.tier2.join(', ')}`);
  }
  lines.push(`🔴 Tier 3 (Lie): ${summary.tier3.length}`);
  if (summary.tier3.length > 0) {
    lines.push(`   ${summary.tier3.join(', ')}`);
  }
  lines.push('');

  return lines.join('\n');
}
