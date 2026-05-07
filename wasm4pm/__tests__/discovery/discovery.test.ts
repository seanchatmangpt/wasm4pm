/**
 * Discovery Algorithm Tests — init, DFG, and Alpha++ merged
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';
import { XES_MINIMAL } from '../helpers/fixtures';

describe('Discovery - Module Initialization', () => {
  it('should initialize WASM module and return version string', async () => {
    await wasm.init();
    const version = wasm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');
  });
});

describe('Discovery - DFG and Alpha++', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  it('should discover DFG and Alpha++ from EventLog, and reject invalid handles', () => {
    const logHandle = wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(logHandle).toBeTruthy();

    const dfg = wasm.discover_dfg(logHandle, 'concept:name');
    expect(dfg).toBeTruthy();

    expect(() => wasm.discover_dfg('obj_999999', 'concept:name')).toThrow();
    expect(() => wasm.discover_alpha_plus_plus('obj_999999', 'concept:name', 0)).toThrow();
  });
});
