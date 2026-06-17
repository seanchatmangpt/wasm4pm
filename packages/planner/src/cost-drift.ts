import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateDurationMs } from './benchmark-costs.js';

export interface CostDriftSignal {
  algorithm: string;
  sampleCount: number;
  predictedMeanMs: number;
  actualMeanMs: number;
  ewmaRatio: number;           // EWMA of actual/predicted ratios
  trend: 'stable' | 'degrading' | 'improving';
  isAlert: boolean;
}

export function checkCostModelDrift(
  receiptsDir: string,
  algorithm: string,
  alpha = 0.3,
  driftThreshold = 1.5,
): CostDriftSignal | undefined {
  let files: string[];
  try {
    files = readdirSync(receiptsDir);
  } catch {
    return undefined;
  }

  const samples: Array<{ actual: number; predicted: number }> = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = readFileSync(join(receiptsDir, file), 'utf-8');
      const data = JSON.parse(raw) as {
        summary?: { algorithm?: string; duration_ms?: number; eventCount?: number };
      };
      if (data.summary?.algorithm !== algorithm) continue;
      const actual = data.summary.duration_ms;
      if (actual == null) continue;
      const eventCount = data.summary.eventCount ?? 1000;
      // Use bench estimate; fall back to a 1ms baseline (not actual) so drift is detectable
      const predicted = estimateDurationMs(algorithm, eventCount) ?? 1.0;
      samples.push({ actual, predicted });
    } catch {
      // skip malformed files
    }
  }

  if (samples.length < 2) return undefined;

  // Compute EWMA of ratios
  const ratios = samples.map((s) => s.actual / Math.max(s.predicted, 0.001));
  const ewmaValues: number[] = [ratios[0]!];
  for (let i = 1; i < ratios.length; i++) {
    ewmaValues.push(alpha * ratios[i]! + (1 - alpha) * ewmaValues[i - 1]!);
  }

  const ewmaRatio = ewmaValues[ewmaValues.length - 1]!;
  const firstEwma = ewmaValues[0]!;
  const lastEwma = ewmaRatio;

  let trend: 'stable' | 'degrading' | 'improving';
  const delta = lastEwma - firstEwma;
  if (Math.abs(delta) < 0.05) {
    trend = 'stable';
  } else if (delta > 0) {
    trend = 'degrading';
  } else {
    trend = 'improving';
  }

  const actualMeanMs =
    samples.reduce((sum, s) => sum + s.actual, 0) / samples.length;
  const predictedMeanMs =
    samples.reduce((sum, s) => sum + s.predicted, 0) / samples.length;

  return {
    algorithm,
    sampleCount: samples.length,
    predictedMeanMs,
    actualMeanMs,
    ewmaRatio,
    trend,
    isAlert: ewmaRatio > driftThreshold,
  };
}
