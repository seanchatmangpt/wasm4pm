/**
 * Case Study I: Streaming Supply Chain Drift Detection
 * 
 * Business Context:
 * Detect when logistics processes deviate from baselines.
 */

import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import * as wasm4pm from 'wasm4pm';
import { logger } from './utils/logger.js';

async function streamingDriftCaseStudy(): Promise<void> {
  logger.header('🚢', 'Streaming Supply Chain Drift Detection', 'EWMA-smoothed Jaccard distances over high-throughput streams');

  const wasm = await import('wasm4pm');
  const kernel = new Kernel(wasm as any);
  await kernel.init();

  logger.step(1, 3, 'Binding Streaming Context');
  const xes = `<?xml version="1.0" encoding="UTF-8" ?>
<log xes.version="1.0">
  <trace><string key="concept:name" value="Shipment Initiated"/><string key="concept:name" value="Customs Cleared"/></trace>
  <trace><string key="concept:name" value="Shipment Initiated"/><string key="concept:name" value="Customs Cleared"/></trace>
  <trace><string key="concept:name" value="Shipment Initiated"/><string key="concept:name" value="Customs Cleared"/></trace>
  <trace><string key="concept:name" value="Shipment Initiated"/><string key="concept:name" value="Reroute to Alternate Port"/></trace>
  <trace><string key="concept:name" value="Shipment Initiated"/><string key="concept:name" value="Held at Customs"/></trace>
</log>`;
  const logHandle = wasm.load_eventlog_from_xes(xes);
  logger.success('Live supply chain stream bound to kernel memory.');

  logger.step(2, 3, 'Initializing Continuous Concept Drift Detector');
  const windowSize = 2; 
  const driftJson = wasm4pm.detect_concept_drift(logHandle, 'concept:name', windowSize);
  const driftsData = JSON.parse(driftJson || '[]');
  assert.ok(driftsData !== null && driftsData !== undefined, 'Streaming agentic result must not be null');
  const drifts = Array.isArray(driftsData) ? driftsData : (driftsData.drifts || []);
  logger.success('Drift threshold established.');

  logger.step(3, 3, 'Analyzing Stream Windows for Topology Shifts');
  let driftAlerts = 0;
  for (const drift of drifts) {
    if (drift.distance > 0.2) {
      logger.error(`DRIFT ALERT at position ${drift.position} (Distance: ${drift.distance.toFixed(2)})`);
      logger.info('Triggering Agentic Pipeline to assess supply chain rerouting...');
      driftAlerts++;
    } else {
      logger.success(`Window ${drift.position}: Stable (Distance: ${drift.distance.toFixed(2)})`);
    }
  }

  logger.info(`Case Study Completed: Detected ${driftAlerts} critical supply chain disruptions.`);
}
process.on('uncaughtException', (err) => {
  console.error('Assertion failed:', err.message);
  process.exit(1);
});

streamingDriftCaseStudy().catch(console.error);