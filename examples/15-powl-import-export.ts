/**
 * Case Study: Vendor Cross-Platform Integration
 */
import assert from 'node:assert/strict';
import { Kernel } from 'wasm4pm';
import * as core from '@wasm4pm/core';
import { logger } from './utils/logger.js';

async function runVendorIntegration(): Promise<void> {
  logger.header('🔄', 'Vendor Cross-Platform Integration', 'Bridging real XML process topologies via POWL');
  
  if (typeof (core as any).default === 'function') {
    await (core as any).default();
  }
  const kernel = new Kernel(core as any);
  await kernel.init();

  logger.step(1, 2, 'Importing Model Payloads');
  // Real PNML structure
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">
  <net id="net1" type="http://www.pnml.org/version-2009/grammar/ptnet">
    <page id="n0">
      <place id="p1"><name><text>start</text></name></place>
      <transition id="t1"><name><text>a</text></name></transition>
      <arc id="a1" source="p1" target="t1"/>
    </page>
  </net>
</pnml>`;

  logger.success('PNML payload mapped into internal buffer.');

  logger.step(2, 2, 'Projecting Topologies into Mathematical Space');
  try {
    // pnml_import doesn't strictly need a log handle if it's purely importing the model
    const result = await kernel.run('pnml_import', 'mock_log', { 
      pnml_xml: xml
    });
    
    // ── RIGOROUS VALIDATION ────────────────────────────────────────────────
    assert.ok(result.handle, 'PNML Result handle must be defined');
    
    const pnJson = core.export_petri_net_to_json(result.handle);
    assert.ok(pnJson, 'Imported Petri net JSON missing');
    const petriNet = JSON.parse(pnJson);
    assert.ok(petriNet.places.length > 0, 'Imported Petri net must have places');
    
    logger.success(`[pnml_import] executed in ${result.durationMs.toFixed(2)}ms`);
    logger.info(`Synthesized model has ${petriNet.places.length} places and ${petriNet.transitions.length} transitions.`);
  } catch (e) {
    logger.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
runVendorIntegration().catch((error: Error) => {
  console.error('Uncaught error:', error);
  process.exit(1);
});
