#!/usr/bin/env node
/**
 * verify-skip-zod.mjs
 *
 * Integration smoke-test for the WASM4PM_SKIP_ZOD opt-out.
 * Run as:
 *   WASM4PM_SKIP_ZOD=1 node scripts/verify-skip-zod.mjs   → prints "SKIP: ok"
 *   node scripts/verify-skip-zod.mjs                       → prints "VALIDATE: ok"
 *
 * The module-level constant is evaluated at import time, so this script must
 * be invoked in a fresh process with the desired env var already set.
 */

import { validateWasmPayload } from '../dist/zod-validators.js';
import { ZOD_VALIDATION_ENABLED as configFlag } from '../dist/validation-config.js';

const BAD_PAYLOAD = { bad: 'payload' };

if (configFlag) {
  // Expect a throw
  try {
    validateWasmPayload('inductive_miner', BAD_PAYLOAD);
    console.error('FAIL: expected throw but got none');
    process.exit(1);
  } catch {
    console.log('VALIDATE: ok');
  }
} else {
  // Expect no throw
  try {
    validateWasmPayload('inductive_miner', BAD_PAYLOAD);
    console.log('SKIP: ok');
  } catch (e) {
    console.error('FAIL: expected no throw but got', e.message);
    process.exit(1);
  }
}
