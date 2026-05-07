/**
 * Type Wrapper Tests — WasmEventLog and WasmOCEL merged
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';
import { XES_MINIMAL, OCEL_MINIMAL } from '../helpers/fixtures';

describe('Type Wrapper - WasmEventLog', () => {
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

  it('should create WasmEventLog, expose event_count/case_count/stats, and throw on invalid handle', () => {
    const handle = wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(handle).toBeTruthy();

    const wasmLog = new wasm.WasmEventLog(handle);
    expect(wasmLog).toBeTruthy();
    expect(() => wasmLog.event_count()).not.toThrow();
    expect(() => wasmLog.case_count()).not.toThrow();
    expect(() => wasmLog.stats()).not.toThrow();

    const bad = new wasm.WasmEventLog('obj_999999');
    expect(() => bad.event_count()).toThrow();
  });
});

describe('Type Wrapper - WasmOCEL', () => {
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

  it('should create WasmOCEL, expose event_count/object_count/stats, and throw on invalid handle', () => {
    const handle = wasm.load_ocel_from_json(OCEL_MINIMAL);
    expect(handle).toBeTruthy();

    const wasmOCEL = new wasm.WasmOCEL(handle);
    expect(wasmOCEL).toBeTruthy();
    expect(() => wasmOCEL.event_count()).not.toThrow();
    expect(() => wasmOCEL.object_count()).not.toThrow();
    expect(() => wasmOCEL.stats()).not.toThrow();

    const bad = new wasm.WasmOCEL('obj_999999');
    expect(() => bad.event_count()).toThrow();
  });
});
