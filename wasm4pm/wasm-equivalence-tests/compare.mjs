// W4PM-LEAN-GALL-036: wasm32 half of the native-vs-wasm32 cross-target
// execution-equivalence harness.
//
// Loads the wasm-pack `nodejs`-target build of the `wasm4pm` crate
// (wasm4pm/wasm4pm/pkg, built via `wasm-pack build --target nodejs
// --out-dir pkg` per CLAUDE.md's documented build command) and runs it
// under Node's actual wasm32 runtime (V8's WebAssembly engine — this is a
// real wasm32 execution, not a native shim). Calls the SAME two algorithms
// exercised natively by tests/wasm_equivalence_native.rs on the SAME fixed
// fixture log, then diffs the two outputs.
//
// Normalization performed (documented, not silent):
//   - `discover_dfg` and `analyze_event_statistics` both return a JSON
//     *string* wrapped as a JsValue (`to_js_str`, see src/discovery.rs:145
//     and src/analysis.rs:64/66) -- specifically chosen in this codebase to
//     avoid the documented `to_js(&json!({...}))` -> `{}` wasm32
//     divergence. The only normalization applied here is `JSON.parse()` of
//     that returned string on the JS side, to get a JS object comparable to
//     the native side's `serde_json::Value`. This is undoing the string
//     envelope required to cross the wasm-bindgen boundary -- it is not a
//     shape change and does not touch DFG/stats field names or values.
//   - `load_eventlog_from_json` is used to load the identical fixture file
//     (byte-for-byte) that the native test reads, so both sides consume
//     exactly the same input.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, "fixture_log.json");
const nativeOutputPath = path.join(here, "native_output.json");
const wasmOutputPath = path.join(here, "wasm_output.json");

if (!existsSync(nativeOutputPath)) {
  console.error(
    `MISSING native_output.json -- run 'cargo test --test wasm_equivalence_native' first (from wasm4pm/wasm4pm).`
  );
  process.exit(3);
}

const wasm = await import(path.join(here, "..", "pkg", "wasm4pm.js"));

const fixtureRaw = readFileSync(fixturePath, "utf8");

// Algorithm 1 + 2 input: load the identical fixture via the same
// wasm-bindgen entry point the real app uses.
const handle = wasm.load_eventlog_from_json(fixtureRaw);

// Algorithm 1: DFG discovery.
const dfgJsonStr = wasm.discover_dfg(handle, "concept:name");
const dfgParsed = JSON.parse(dfgJsonStr);

// Algorithm 2: event statistics.
const statsJsonStr = wasm.analyze_event_statistics(handle);
const statsParsed = JSON.parse(statsJsonStr);

const wasmCombined = {
  algorithm_dfg: dfgParsed,
  algorithm_event_statistics: statsParsed,
};

writeFileSync(wasmOutputPath, JSON.stringify(wasmCombined, null, 2));

const nativeCombined = JSON.parse(readFileSync(nativeOutputPath, "utf8"));

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffReport(native, wasmVal, label) {
  const eq = deepEqual(native, wasmVal);
  console.log(`\n=== ${label} ===`);
  console.log(eq ? "AGREE (byte-identical JSON after normalization)" : "DISAGREE");
  if (!eq) {
    console.log("native:", JSON.stringify(native, null, 2));
    console.log("wasm32:", JSON.stringify(wasmVal, null, 2));
  }
  return eq;
}

let allAgree = true;
allAgree =
  diffReport(nativeCombined.algorithm_dfg, wasmCombined.algorithm_dfg, "discover_dfg (DFG discovery)") &&
  allAgree;
allAgree =
  diffReport(
    nativeCombined.algorithm_event_statistics,
    wasmCombined.algorithm_event_statistics,
    "analyze_event_statistics (event/case counts)"
  ) && allAgree;

console.log(`\n=== SUMMARY ===`);
console.log(allAgree ? "ALL ALGORITHMS AGREE (native vs wasm32)" : "AT LEAST ONE DIVERGENCE FOUND");
process.exit(allAgree ? 0 : 1);
