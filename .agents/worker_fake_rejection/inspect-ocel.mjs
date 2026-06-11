import * as wasm from '../../crates/wasm4pm-cognition/pkg/wasm4pm_cognition.js';

const breed = 'eliza';
const contract = {
  intent: 'integration test to inspect ocel logs',
  candidates: [],
  facts: [],
  cases: [],
  rules: [],
  goals: [],
  state: [],
};

const inputJson = JSON.stringify({ breed, contract, options: {} });
const raw = wasm.cognition_run(inputJson);
const result = typeof raw === 'string' ? JSON.parse(raw) : raw;

console.log("Status:", result.status);
console.log("Breed:", result.breed);
console.log("Run ID:", result.run_id);
console.log("OCEL Log Objects count:", result.output.ocel_log.objects.length);
console.log("OCEL Log Events count:", result.output.ocel_log.events.length);
console.log("OCEL Log Events:");
result.output.ocel_log.events.forEach((event, idx) => {
  console.log(`Event ${idx}: ID=${event.event_id}, Activity=${event.activity}, logical_step=${event.attributes.logical_step}, detail="${event.attributes.detail}"`);
});
