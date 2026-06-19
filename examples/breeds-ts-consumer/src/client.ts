// Typed wrapper sketch for cognition_run.
// STATIC file (shipped by the pack). The init()/WASM call below is a documented stub —
// wire it to your actual wasm4pm-cognition build (`wasm-pack build --target nodejs`).

import type { BreedId } from "./breed-ids";
import type {
  BreedInput,
  CognitionRunInput,
  CognitionRunOptions,
  ContractResult,
} from "./breed-types";

/**
 * Stub: replace with your generated WASM binding.
 * e.g. `import init, { cognition_run } from "wasm4pm-cognition";`
 */
interface CognitionWasm {
  cognition_run(inputJson: string): string;
}

let _wasm: CognitionWasm | null = null;

/**
 * Documented stub. Wire this to the real WASM module:
 *
 *   import init, { cognition_run } from "wasm4pm-cognition";
 *   export async function loadWasm() {
 *     await init();
 *     return { cognition_run } as CognitionWasm;
 *   }
 */
async function loadWasm(): Promise<CognitionWasm> {
  if (_wasm) return _wasm;
  throw new Error(
    "cognition WASM not wired: replace loadWasm() in client.ts with a real init()/cognition_run import.",
  );
}

/**
 * Run a single cognition breed against a BreedInput contract.
 * `breed` is constrained to a known BreedId from the generated catalog.
 */
export async function cognitionRun(
  breed: BreedId,
  contract: BreedInput,
  options?: CognitionRunOptions,
): Promise<ContractResult> {
  const wasm = await loadWasm();
  const input: CognitionRunInput = { breed, contract, options };
  const raw = wasm.cognition_run(JSON.stringify(input));
  const result = JSON.parse(raw) as ContractResult;
  if (result.status !== "ok") {
    throw new Error(`cognition_run did not return ok for breed "${breed}"`);
  }
  return result;
}
