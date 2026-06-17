import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MetaCase {
  algorithm: string;
  qualityTier: number;
  avgDurationMs: number;   // mean of positive_cases[].duration_ms where status==='passed'
  passRate: number;        // passed / total positive_cases (0 if no cases)
  sampleCount: number;     // total positive_cases count
}

const DEFAULT_QUALITY_TIERS: Record<string, number> = {
  dfg: 30, heuristic_miner: 50, inductive_miner: 55, ilp: 90,
  genetic_algorithm: 80, aco: 75, pso: 75, a_star: 70,
  hill_climbing: 55, simulated_annealing: 65, alignments: 85,
  alpha_plus_plus: 50, correlation_miner: 60, batches: 55,
  transition_system: 50, log_to_trie: 50, detect_drift: 70,
  compute_ewma: 30,
};

export function readAlgoBehaviorCases(
  receiptsDir: string,
  qualityTierMap?: Record<string, number>,
): MetaCase[] {
  let files: string[];
  try {
    files = readdirSync(receiptsDir);
  } catch {
    return [];
  }

  const tierMap = qualityTierMap ?? DEFAULT_QUALITY_TIERS;
  const results: MetaCase[] = [];

  for (const file of files) {
    if (!file.endsWith('.receipt.json')) continue;
    try {
      const raw = readFileSync(join(receiptsDir, file), 'utf-8');
      const data = JSON.parse(raw) as {
        algorithm_id: string;
        positive_cases?: Array<{ status: string; duration_ms: number }>;
      };
      const { algorithm_id, positive_cases = [] } = data;
      const passed = positive_cases.filter((c) => c.status === 'passed');
      const avgDurationMs =
        passed.length > 0
          ? passed.reduce((sum, c) => sum + c.duration_ms, 0) / passed.length
          : 0;
      const passRate =
        positive_cases.length > 0 ? passed.length / positive_cases.length : 0;
      const qualityTier = tierMap[algorithm_id] ?? 50;

      results.push({
        algorithm: algorithm_id,
        qualityTier,
        avgDurationMs,
        passRate,
        sampleCount: positive_cases.length,
      });
    } catch {
      // skip malformed files
    }
  }

  return results;
}

/**
 * Read runtime CommandReceipt files (written by `wpm run` / `wpm autopilot`)
 * and convert to MetaCase[] grouped by algorithm.
 *
 * Each receipt must have `summary.algorithm` and `summary.duration_ms` to be
 * counted. passRate is derived from receipt `status === 'success'`.
 */
export function readRuntimeCases(
  receiptsDir = '.wasm4pm/receipts',
  qualityTierMap?: Record<string, number>,
): MetaCase[] {
  let files: string[];
  try {
    files = readdirSync(receiptsDir);
  } catch {
    return [];
  }

  const tierMap = qualityTierMap ?? DEFAULT_QUALITY_TIERS;
  const groups = new Map<string, { durations: number[]; successes: number; total: number }>();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(receiptsDir, file), 'utf-8');
      const data = JSON.parse(raw) as {
        status?: string;
        summary?: { algorithm?: string; duration_ms?: number };
      };
      const algorithm = data.summary?.algorithm;
      const durationMs = data.summary?.duration_ms;
      if (typeof algorithm !== 'string' || typeof durationMs !== 'number') continue;

      let group = groups.get(algorithm);
      if (!group) {
        group = { durations: [], successes: 0, total: 0 };
        groups.set(algorithm, group);
      }
      group.total += 1;
      if (data.status === 'success') {
        group.successes += 1;
        group.durations.push(durationMs);
      }
    } catch {
      // skip malformed files
    }
  }

  const results: MetaCase[] = [];
  for (const [algorithm, group] of groups) {
    const avgDurationMs =
      group.durations.length > 0
        ? group.durations.reduce((sum, d) => sum + d, 0) / group.durations.length
        : 0;
    results.push({
      algorithm,
      qualityTier: tierMap[algorithm] ?? 50,
      avgDurationMs,
      passRate: group.total > 0 ? group.successes / group.total : 0,
      sampleCount: group.total,
    });
  }
  return results;
}

/**
 * Merge static corpus cases with runtime cases. For algorithms present in
 * both, avgDurationMs and passRate are blended weighted by sampleCount —
 * runtime evidence gains influence as receipts accumulate.
 */
export function mergeMetaCases(corpus: MetaCase[], runtime: MetaCase[]): MetaCase[] {
  const merged = new Map<string, MetaCase>();
  for (const c of corpus) merged.set(c.algorithm, { ...c });

  for (const r of runtime) {
    const existing = merged.get(r.algorithm);
    if (!existing) {
      merged.set(r.algorithm, { ...r });
      continue;
    }
    const totalSamples = existing.sampleCount + r.sampleCount;
    if (totalSamples === 0) continue;
    merged.set(r.algorithm, {
      algorithm: r.algorithm,
      qualityTier: existing.qualityTier,
      avgDurationMs:
        (existing.avgDurationMs * existing.sampleCount + r.avgDurationMs * r.sampleCount) /
        totalSamples,
      passRate:
        (existing.passRate * existing.sampleCount + r.passRate * r.sampleCount) / totalSamples,
      sampleCount: totalSamples,
    });
  }
  return [...merged.values()];
}
