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

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import * as wasm4pm from 'wasm4pm';

interface DriftRecord {
  position: number;
  distance: number;
  type: string;
}

async function main(logPath: string, windowSize: number, threshold: number): Promise<void> {
  const xes = fs.readFileSync(resolve(logPath), 'utf8');
  const logHandle = wasm4pm.load_eventlog_from_xes(xes);

  // detect_concept_drift returns a JSON string containing drifts
  const driftJson = wasm4pm.detect_concept_drift(logHandle, 'concept:name', windowSize);
  const drifts = JSON.parse(driftJson) as DriftRecord[];

  console.log(`window size   : ${windowSize}`);
  console.log(`threshold τ   : ${threshold}\n`);
  console.log('position  distance   type');
  console.log('--------  --------   ----');

  let alertCount = 0;
  for (const drift of drifts) {
    if (drift.distance >= threshold) {
      alertCount++;
      const bar = '█'.repeat(Math.max(0, Math.round(drift.distance * 30))).padEnd(30, ' ');
      console.log(
        `${String(drift.position).padStart(8)}  ${drift.distance.toFixed(3)}      ${drift.type}  ${bar}`,
      );
    }
  }

  console.log(`\ntotal alerts: ${alertCount}`);
  if (alertCount === 0) {
    console.log('process appears stable — no drift detected.');
  } else {
    console.log('process drift detected — consider re-discovering the model.');
  }
}

const logPath = process.argv[2] ?? 'data/small-example.xes';
const windowSize = Number.parseInt(process.argv[3] ?? '2', 10);
const threshold = Number.parseFloat(process.argv[4] ?? '0.25');
main(logPath, windowSize, threshold).catch((err) => {
  console.error('drift detection failed:', err);
  process.exit(1);
});
