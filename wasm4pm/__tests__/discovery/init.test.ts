/**
 * Discovery Algorithm Tests
 */

import { describe, it, expect } from 'vitest';
import * as wasm from '../../pkg/pictl.js';

describe('Discovery - Module Initialization', () => {
  it('should initialize WASM module', async () => {
    await wasm.init();
    const version = wasm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');
  });
});
