// Working example — consuming the `wasm4pm-breeds-ts` ggen pack.
//
// `breed-ids.ts` and `breed-catalog.ts` were GENERATED from the breed ontology
// by `ggen sync` (see ggen.toml). `breed-types.ts` and `client.ts` are the fixed
// WASM contract + typed client, copied from the pack's `static/`. Nothing here
// was hand-written per breed.
//
// Run: `ggen sync && npm install && npm start`

import { BREED_CATALOG } from "./breed-catalog.js";
import { BREED_IDS, type BreedId } from "./breed-ids.js";
import type { BreedInput, CognitionRunInput } from "./breed-types.js";
// import { cognitionRun } from "./client.js"; // ← uncomment when the WASM pkg is wired

function main(): void {
  // 1. The generated catalog: every breed, with its paper citation.
  console.log(`wasm4pm cognition breeds: ${BREED_CATALOG.length} total\n`);
  console.log("First 5 (id · label · citation):");
  for (const info of BREED_CATALOG.slice(0, 5)) {
    const cite = info.citation.split(".")[0];
    console.log(`  ${info.id.padEnd(22)} ${info.label.padEnd(22)} ${cite}.`);
  }

  // 2. The generated id union is total over the ontology — no magic strings.
  console.log(`\nBREED_IDS has ${BREED_IDS.length} entries`);
  const everyCatalogIdIsAKnownBreedId = BREED_CATALOG.every((info) =>
    (BREED_IDS as readonly string[]).includes(info.id),
  );
  console.log(`✓ all ${BREED_CATALOG.length} catalog ids are valid BreedId: ${everyCatalogIdIsAKnownBreedId}`);

  // A BreedId is a compile-time-checked literal union: this is type-safe.
  const breed: BreedId = "mycin";

  // 3. Build a typed MYCIN request. The shape is the exact WASM contract; a wrong
  //    field name (e.g. `decision` instead of `output_hash` on the result) is a
  //    compile error, not a runtime surprise.
  const contract: BreedInput = {
    intent: "diagnose bacteremia organism",
    candidates: [],
    facts: [
      { key: "gram-stain", value: "gram-positive" },
      { key: "morphology", value: "coccus" },
      { key: "growth-conformation", value: "chains" },
    ],
    cases: [],
    rules: [
      {
        id: "RULE050",
        premise: ["gram-positive", "coccus", "chains"],
        conclusion: "streptococcus",
        certainty: 0.7,
      },
    ],
    goals: [],
    state: [],
  };
  const request: CognitionRunInput = { breed, contract };

  console.log(`\ncognition_run request for \`${request.breed}\`:`);
  console.log(JSON.stringify(request, null, 2));

  // 4. To actually run it against the WASM core, wire loadWasm() in client.ts to
  //    your @wasm4pm/cognition package, then:
  //
  //    const result = await cognitionRun(breed, contract);
  //    console.log(result.run_id, result.output_hash, result.replay_pointer);
  console.log(
    "\n(To execute: implement loadWasm() in client.ts against @wasm4pm/cognition, then call cognitionRun.)",
  );
}

main();
