/**
 * machine-thresholds.ts
 *
 * Machine-specific timing thresholds for test assertions.
 *
 * Instead of hardcoding `toBeLessThan(200)`, tests call
 * `machineThreshold(category, operation)` which reads from
 * `~/.config/wasm4pm/timings.json` when present, falling back to
 * conservative defaults. Generate the file with `wpm benchmark --calibrate`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TIMINGS_PATH = join(homedir(), '.config', 'wasm4pm', 'timings.json');

type TimingsFile = {
  generatedAt: string;
  thresholds: Record<string, Record<string, number>>;
};

let _cached: TimingsFile | null | undefined = undefined;

function loadTimings(): TimingsFile | null {
  if (_cached !== undefined) return _cached;
  if (!existsSync(TIMINGS_PATH)) {
    _cached = null;
    return null;
  }
  try {
    _cached = JSON.parse(readFileSync(TIMINGS_PATH, 'utf8')) as TimingsFile;
    return _cached;
  } catch {
    _cached = null;
    return null;
  }
}

/**
 * Conservative defaults (milliseconds) used when no calibration file exists.
 * These are tuned to pass on a loaded CI runner at 4 cores, 8 GB RAM.
 */
const DEFAULTS: Record<string, Record<string, number>> = {
  prediction: {
    baseline: 200,
    fit_1k: 200,
    fit_predict: 200,
    predict_1k: 200,
  },
  discovery: {
    dfg_100: 500,
    dfg_1k: 2000,
  },
  ml: {
    cluster: 500,
    classify: 300,
  },
};

/**
 * Returns the timing threshold (ms) for a given category + operation.
 * Reads from the calibration file if present; uses defaults otherwise.
 *
 * @param category  e.g. 'prediction', 'discovery', 'ml'
 * @param operation e.g. 'baseline', 'fit_1k', 'dfg_100'
 */
export function machineThreshold(category: string, operation: string): number {
  const timings = loadTimings();
  const val = timings?.thresholds?.[category]?.[operation]
    ?? DEFAULTS[category]?.[operation];
    
  if (val === undefined) {
    throw new Error(`Missing timing threshold for ${category}.${operation}. Run 'wpm benchmark --calibrate' to update expectations.`);
  }
  return val;
}

/**
 * Run a function N times and return the median duration in milliseconds.
 */
export function medianMs(fn: () => void, runs = 5): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    fn();
    samples.push(Date.now() - t);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

/**
 * Calibration payload shape — written by `wpm benchmark --calibrate`.
 */
export type CalibrationResult = {
  generatedAt: string;
  hostInfo: { platform: string; arch: string; cpus: number };
  thresholds: Record<string, Record<string, number>>;
};
