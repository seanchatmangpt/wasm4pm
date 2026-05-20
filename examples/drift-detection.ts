/**
 * Example — Streaming concept-drift detection
 *
 * Replays an XES log event-by-event through the drift detector and prints
 * an alert whenever the EWMA-smoothed Jaccard distance crosses a threshold.
 *
 * Run:
 *   tsx examples/drift-detection.ts ./sample.xes 100 0.25
 *
 * Args: <log.xes> <window_size> <threshold>
 *
 * Docs:
 *   docs/drift-detection.md
 *   docs/explanation/concept-drift-detection.md
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getRegistry } from 'wasm4pm';

interface DriftSnapshot {
  windowIndex: number;
  rawDistance: number;     // Jaccard d_t
  smoothedDistance: number; // EWMA s_t
  alert: boolean;
}

async function main(logPath: string, windowSize: number, threshold: number): Promise<void> {
  const xes = readFileSync(resolve(logPath), 'utf8');
  const registry = getRegistry();
  const handle = await registry.run('load_eventlog_from_xes', null, { xes });

  // detect_concept_drift returns one snapshot per window.
  const result = (await registry.run('detect_concept_drift', handle, {
    windowSize,
    threshold,
    smoothingLambda: 0.2,
    activityKey: 'concept:name',
  })) as { snapshots: DriftSnapshot[]; baselineSize: number };

  console.log(`baseline size : ${result.baselineSize} events`);
  console.log(`window size   : ${windowSize}`);
  console.log(`threshold τ   : ${threshold}\n`);
  console.log('window  raw    smoothed  alert');
  console.log('------  -----  --------  -----');

  let alertCount = 0;
  for (const s of result.snapshots) {
    const flag = s.alert ? 'ALERT' : '     ';
    if (s.alert) alertCount++;
    const bar =
      '█'.repeat(Math.max(0, Math.round(s.smoothedDistance * 30))).padEnd(30, ' ');
    console.log(
      `${String(s.windowIndex).padStart(6)}  ${s.rawDistance.toFixed(3)}  ` +
        `${s.smoothedDistance.toFixed(3)}    ${flag}  ${bar}`,
    );
  }

  console.log(`\ntotal alerts: ${alertCount} / ${result.snapshots.length} windows`);
  if (alertCount === 0) {
    console.log('process appears stable — no drift detected.');
  } else {
    console.log('process drift detected — consider re-discovering the model.');
  }
}

const logPath = process.argv[2] ?? './sample.xes';
const windowSize = Number.parseInt(process.argv[3] ?? '100', 10);
const threshold = Number.parseFloat(process.argv[4] ?? '0.25');
main(logPath, windowSize, threshold).catch((err) => {
  console.error('drift detection failed:', err);
  process.exit(1);
});
