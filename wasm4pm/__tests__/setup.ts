/**
 * Vitest setup file - runs before each test
 * Centralizes WASM module initialization and cleanup
 */

import { beforeEach, afterEach } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';

// Initialize WASM module before each test
beforeEach(async () => {
  try {
    await wasm.default();
    await wasm.clear_all_objects();
  } catch (e) {
    console.warn('WASM initialization warning:', e);
    throw new Error(`Failed to initialize WASM module: ${e}`);
  }
});

// Clean up handles after each test
afterEach(async () => {
  try {
    await wasm.clear_all_objects();
  } catch (e) {
    console.warn('WASM cleanup warning:', e);
  }
});
