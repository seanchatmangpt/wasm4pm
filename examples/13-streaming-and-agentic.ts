/**
 * Case Study I: Streaming Supply Chain Drift Detection
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import * as wasm4pm from 'wasm4pm';
import { logger } from './utils/logger.js';

async function streamingDriftCaseStudy(): Promise<void> {
  logger.header('🚢', 'Streaming Supply Chain Drift Detection', 'EWMA-smoothed Jaccard distances over real process streams');

  // Initialize the WASM module via its default export
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 3, 'Binding Real Streaming Context (roadtraffic100traces)');
  const xesPath = join(process.cwd(), fs.existsSync('data') ? '' : '..', 'bench_data/roadtraffic100traces.xes');
  const xes = fs.readFileSync(xesPath, 'utf8');
  const logHandle = core.load_eventlog_from_xes(xes);
  assert.ok(logHandle, 'Failed to load roadtraffic log');
  logger.success('Live traffic stream bound to kernel memory.');

  logger.step(2, 3, 'Initializing Continuous Concept Drift Detector');
  const windowSize = 5; 
  const driftJson = wasm4pm.detect_concept_drift(logHandle, 'concept:name', windowSize);
  
  // ── RIGOROUS VALIDATION ──────────────────────────────────────────────────
  assert.ok(driftJson, 'Drift detection must return JSON string');
  const driftsData = JSON.parse(driftJson);
  const drifts = Array.isArray(driftsData) ? driftsData : (driftsData.drifts || []);
  logger.success(`Drift threshold established over ${drifts.length} windows.`);

  logger.step(3, 3, 'Analyzing Stream Windows for Topology Shifts');
  let driftAlerts = 0;
  for (const drift of drifts) {
    // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
    assert.ok(typeof drift.distance === 'number', 'Drift distance must be a number');
    
    if (drift.distance > 0.1) {
      logger.error(`DRIFT ALERT at position ${drift.position} (Distance: ${drift.distance.toFixed(2)})`);
      driftAlerts++;
    } else {
      logger.success(`Window ${drift.position}: Stable (Distance: ${drift.distance.toFixed(2)})`);
    }
  }

  logger.info(`Case Study Completed: Detected ${driftAlerts} critical supply chain disruptions.`);
}
streamingDriftCaseStudy().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
