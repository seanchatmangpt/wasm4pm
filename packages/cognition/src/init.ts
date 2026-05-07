//! Lazy singleton initialization for WASM module

let wasmModule: any = null;

export async function initCognition() {
  if (wasmModule) {
    return wasmModule;
  }
  // Import the WASM module (wasm-pack generated)
  try {
    wasmModule = await import('wasm4pm-cognition');
    return wasmModule;
  } catch (err) {
    throw new Error(`Failed to initialize wasm4pm-cognition: ${err}`);
  }
}

export function getWasm() {
  if (!wasmModule) {
    throw new Error('wasm4pm-cognition not initialized. Call initCognition() first.');
  }
  return wasmModule;
}
