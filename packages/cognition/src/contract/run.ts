//! Run cognition contract via WASM bridge

import { initCognition } from '../init';
import type { BreedInput, ContractResult } from '../types';

export async function runContract(input: BreedInput): Promise<ContractResult> {
  const wasm = await initCognition();
  const inputJson = JSON.stringify(input);
  const resultJson = wasm.cognition_run(inputJson);
  const result = JSON.parse(resultJson);
  return result as ContractResult;
}
