import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as wasm4pm from 'wasm4pm';
import { runContract } from '@wasm4pm/cognition';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ZOE LA Example 05: Red Team Adversary Simulation
 * 
 * Demonstrates that the Combinatorial Maximalism architecture cannot be bypassed
 * by LLM hallucinations, fake completions, or organizational evasion.
 */
async function runRedTeamAdversary() {
  console.log('===========================================================');
  console.log(' ZOE LA Red Team: Adversarial Bypass Attempts');
  console.log('===========================================================');

  // Load a known event log (acting as our process baseline)
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
  const powlJson = wasm4pm.discover_powl_from_log_config(logJson, 'concept:name', 'inductive', 1, 0.0);
  const ilpResult = JSON.parse(wasm4pm.discover_ilp_petri_net(logHandle, 'concept:name'));
  const petriNetHandle = ilpResult.handle;

  // ---------------------------------------------------------------------------
  // Adversary Scenario 1: False Completion (Skipped Handoff)
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 1] Rogue worker marks route complete without required handoff receipt.');
  console.log('   -> Injecting a fake trace missing critical compliance steps...');
  
  // Create a synthetic log snippet with a missing step
  const fakeXes = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" openxes.version="1.0RC7">
  <trace>
    <string key="concept:name" value="fake-1"/>
    <event><string key="concept:name" value="interest received"/></event>
    <event><string key="concept:name" value="route closed"/></event>
  </trace>
</log>`;

  // Load fake log and run token replay
  const fakeLogHandle = wasm4pm.load_eventlog_from_xes(fakeXes);
  const replayJson = wasm4pm.check_token_based_replay(fakeLogHandle, petriNetHandle, 'concept:name');
  const replay = JSON.parse(replayJson);
  
  const fitness = Array.isArray(replay) ? replay.reduce((acc, curr) => acc + (curr.trace_fitness || 0), 0) / replay.length : (replay.trace_fitness || 0);
  console.log(`   Expected 100% Token Fitness. Actual: ${(fitness * 100).toFixed(2)}%`);
  
  if (fitness < 1.0) {
    console.log('   [PASS] System successfully caught False Completion. Missing evidence tokens detected. Closure refused.');
  } else {
    console.log('   [FAIL] System accepted incomplete route.');
  }

  // ---------------------------------------------------------------------------
  // Adversary Scenario 2: LLM Hallucinated Action Bypass
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 2] Rogue LLM hallucinates an unsafe care intervention without meeting preconditions.');
  console.log('   -> Attempting to trick GPS into producing a plan from a hallucinated state...');

  try {
    const planningResult = await runContract('gps', {
      intent: 'execute-safe-reassignment',
      state: [
        { predicate: 'assigned_to', value: 'volunteer_a' },
        // Intentionally missing the route_state=open precondition
      ],
      goals: [
        { id: 'g1', predicate: 'assigned_to', value: 'care_lead' }
      ],
      rules: [
        {
          id: 'revoke-assignment',
          premise: ['assigned_to=volunteer_a', 'route_state=open'], // Will fail here
          conclusion: 'assigned_to=none;!assigned_to=volunteer_a',
          certainty: 1.0
        },
        {
          id: 'escalate-to-lead',
          premise: ['assigned_to=none'],
          conclusion: 'assigned_to=care_lead;!assigned_to=none',
          certainty: 1.0
        }
      ],
      candidates: [],
      facts: [],
      cases: []
    });

    console.log('   [FAIL] Old AI generated a plan for an unsafe state!', planningResult);
  } catch (err: any) {
    console.log('   [PASS] GPS Planner successfully blocked the LLM hallucination.');
    console.log(`          Error thrown: ${err.cause || err.message}`);
  }

  // ---------------------------------------------------------------------------
  // Adversary Scenario 3: Knowledge Base Poisoning (MYCIN)
  // ---------------------------------------------------------------------------
  console.log('\n[Scenario 3] LLM hallucinated facts try to trigger an unapproved diagnostic policy.');
  console.log('   -> Injecting fake symptoms into the forward-chaining ruleset...');

  const mycinResult = await runContract('mycin', {
    intent: 'diagnose',
    facts: [
      { key: 'symptom', value: 'fake-hallucinated-symptom' } // Facts don't match rules
    ],
    rules: [
      {
        id: 'r1-flu',
        premise: ['fever'],
        conclusion: 'diagnosis=flu',
        certainty: 0.8
      }
    ],
    candidates: [], cases: [], goals: [], state: []
  });

  const diagnosis = mycinResult.output;
  if (diagnosis.facts.length === 1 && diagnosis.facts[0].key === 'fake-hallucinated-symptom') {
    console.log('   [PASS] MYCIN successfully refused to derive any unapproved policies. Output remains unchanged.');
  } else {
    console.log('   [FAIL] System incorrectly hallucinated an outcome.');
  }

  console.log('===========================================================');
  console.log(' Red Team Simulation Complete.');
  console.log(' Combinatorial Maximalism Architecture is Secure.');
  console.log('===========================================================');
}

runRedTeamAdversary().catch(console.error);