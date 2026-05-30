const fs = require('fs');
const path = require('path');

const agents = [
    { name: "generalist", prompt: "Agent 1 — Primitive inventory agent\nOwns: docs/primitives/00-WASM4PM-PRIMITIVE-INVENTORY.md\nMission: Map what already exists (OCEL, DFG, heuristic, POWL, etc.). Output a primitive map with existing file/module, current tests, missing tests, paper grounding, downstream use. No implementation." },
    { name: "generalist", prompt: "Agent 2 — OCEL v2 primitive agent\nOwns: docs/primitives/01-OCEL-V2-PRIMITIVES.md\nMission: Make OCEL v2 the canonical object-centric evidence surface. Build or harden primitives for object types, event types, event-object relations, flattened projections, OCEL JSON import/export." },
    { name: "generalist", prompt: "Agent 3 — POWL 2.0 primitive agent\nOwns: docs/primitives/02-POWL-2-PRIMITIVES.md\nMission: Center POWL 2.0 as the lawful route model. Build or harden primitives for partial order, choice graph, POWL -> process tree, POWL -> Petri net, POWL validation." },
    { name: "generalist", prompt: "Agent 4 — WF-net / Petri-net primitive agent\nOwns: docs/primitives/03-WFNET-PETRI-PRIMITIVES.md\nMission: Make Petri/WF-net compatibility the formal execution substrate. Build primitives for places, transitions, arcs, markings, soundness checks, token replay, PNML import." },
    { name: "generalist", prompt: "Agent 5 — Conformance primitive agent\nOwns: docs/primitives/04-CONFORMANCE-PRIMITIVES.md\nMission: Make conformance a primitive, not an application feature. Build or harden token replay, alignment fitness, ET conformance precision, Declare conformance, prefix conformance." },
    { name: "generalist", prompt: "Agent 6 — Process-world foundry agent\nOwns: docs/primitives/05-PROCESS-WORLD-FOUNDRY.md\nMission: Build the generator family from the papers. Given a domain (e.g. Order-to-Cash Object-Centric World), manufacture OCEL v2 log, POWL 2.0 model, WF-net projection, positive/negative traces." },
    { name: "generalist", prompt: "Agent 7 — Negative fixture / sabotage corpus agent\nOwns: docs/primitives/06-NEGATIVE-CORPUS.md\nMission: Manufacture invalid traces and invalid models. Negative cases must include missing required event, event out of order, dead transition, unsafe net, OCEL relation violation." },
    { name: "generalist", prompt: "Agent 8 — Route-driven TDD primitive agent\nOwns: docs/primitives/07-ROUTE-DRIVEN-TDD.md\nMission: Build or refine the testing substrate using PowlTestHarness, ExpectedConformance, AndonPull. A test can declare expected POWL route, observed OCEL evidence, required conformance = 1.0." },
    { name: "generalist", prompt: "Agent 9 — Benchmark / real-data gate agent\nOwns: docs/primitives/08-BENCHMARK-GATES.md\nMission: Preserve the existing benchmark doctrine. Every new primitive must fit G1 determinism, G2 receipt integrity, G3 truth, G4 equivalence, G5 report completeness." },
    { name: "generalist", prompt: "Agent 10 — Primitive build-plan synthesizer\nOwns: docs/primitives/00-BUILD-PLAN.md, docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md\nMission: Synthesize all streams into a primitive dependency DAG. List existing modules, new modules, tests, benchmark gates, paper grounding, acceptance sequence, blocked items. Provide final verdict ALIVE/PARTIAL/BLOCKED." }
];

for (let i=0; i<agents.length; i++) {
  const agent = agents[i];
  const fileMatches = agent.prompt.match(/Owns:\s*([^\n]+)/);
  if (fileMatches && fileMatches[1]) {
    const files = fileMatches[1].split(',').map(f => f.trim());
    for (const f of files) {
       if (f.endsWith('.md')) {
         const p = path.resolve(f);
         fs.mkdirSync(path.dirname(p), { recursive: true });
         fs.writeFileSync(p, `# ${agent.prompt.split('\n')[0]}\n\n## Mission\n${agent.prompt.split('Mission: ')[1]}\n\n## Status\nScaffolded.`);
         console.log(`Created ${f}`);
       }
    }
  }
}