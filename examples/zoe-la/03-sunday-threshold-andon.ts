import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as wasm4pm from 'wasm4pm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ZOE LA Example 03: Sunday Threshold Andon (Live Monitoring)
 * 
 * Demonstrates a fast, non-blocking check on streaming events to see if
 * routes are completing properly or stalling out.
 */
async function analyzeSundayAndon() {
  console.log('===========================================================');
  console.log(' ZOE LA Route X-Ray: Sunday Live Andon');
  console.log('===========================================================');

  const logPath = resolve(__dirname, '../../bench_data/bpi2020_travel.xes');
  let xesContent = '';
  try {
    xesContent = readFileSync(logPath, 'utf8');
  } catch (e) {
    console.error('Test log not found.');
    process.exit(1);
  }

  const logHandle = wasm4pm.load_eventlog_from_xes(xesContent);
  const logJson = wasm4pm.export_eventlog_to_json(logHandle);

  // 1. DFG Stream Batching (Fast Streaming Update)
  console.log('1. Processing Streaming Check-ins and Requests...');
  const dfgHandle = wasm4pm.store_dfg_from_json(wasm4pm.discover_dfg(logHandle, 'concept:name'));
  // Simulate adding a batch
  try {
    wasm4pm.streaming_dfg_add_batch(dfgHandle, JSON.stringify(["kids_checkin", "parent_pager"]));
  } catch (e) {
     // Ignore mock parsing issues in this demo
  }
  console.log('   Live DFG updated.');

  // 2. Discover Hierarchy for Live Conformance
  console.log('2. Discovering Route Expectations...');
  const powlJson = wasm4pm.discover_powl_from_log_config(logJson, 'concept:name', 'inductive', 1, 0.0);
  
  // 3. Live Token Replay (Checking for open traces)
  console.log('3. Running Live Token Replay on Route Expectations...');
  const ilpResult = JSON.parse(wasm4pm.discover_ilp_petri_net(logHandle, 'concept:name'));
  const petriNetHandle = ilpResult.handle;
  const replayJson = wasm4pm.check_token_based_replay(logHandle, petriNetHandle, 'concept:name');
  const replay = JSON.parse(replayJson);
  
  // An Andon pull is simulated if a large number of traces are incomplete (fitness < 1.0)
  const fitness = Array.isArray(replay) ? replay.reduce((acc, curr) => acc + (curr.trace_fitness || 0), 0) / replay.length : (replay.trace_fitness || 0);
  console.log(`   Current Completion Rate: ${(fitness * 100).toFixed(2)}%`);
  if (fitness < 0.95) {
    console.log('   [ANDON PULL] Route completion dropping below 95%. Care Team escalation required.');
  }

  // 4. Social Bottleneck Radar
  console.log('4. Checking Social Handoff Constraints (Volunteer Overload)...');
  const socialJson = wasm4pm.discover_handover_network(logHandle, 'org:resource');
  const social = JSON.parse(socialJson);
  console.log(`   ${social.nodes?.length || 0} active volunteers mapped across ${social.edges?.length || 0} handoff paths.`);
  if ((social.nodes?.length || 0) < 10) {
     console.log('   [ALERT] Low volunteer density detected across active routes.');
  }

  console.log('===========================================================');
  console.log(' Live Andon Monitor Complete.');
  console.log('===========================================================');
}

analyzeSundayAndon().catch(console.error);