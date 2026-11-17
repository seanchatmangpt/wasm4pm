import { createRequire } from 'node:module';

let wasmModule = null;

function getWasm() {
  if (!wasmModule) {
    const require = createRequire(import.meta.url);
    wasmModule = require('./wasm4pm_cognition.cjs');
  }
  return wasmModule;
}

/**
 * Run any old-AI breed contract with automatic JSON serialization and typed error handling.
 */
export function runBreed(input) {
  const wasm = getWasm();
  const raw = wasm.cognition_run(JSON.stringify(input));
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * List available cognition breeds and lineage metadata.
 */
export function getCapabilities() {
  const wasm = getWasm();
  const raw = wasm.cognition_show();
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Replay a proof receipt by run_id.
 */
export function replay(runId) {
  const wasm = getWasm();
  const raw = wasm.cognition_replay(runId);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Verify session state without executing a turn.
 */
export function verifySession(state) {
  const wasm = getWasm();
  const raw = wasm.cognition_session_verify(JSON.stringify(state));
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
