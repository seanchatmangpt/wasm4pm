/**
 * I/O Operations Tests — EventLog XES and OCEL JSON merged
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';
import { XES_MINIMAL, OCEL_MINIMAL } from '../helpers/fixtures';

describe('I/O Operations - EventLog XES', () => {
  it('should load, export, and reject invalid handle', () => {
    const handle = wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(handle).toBeTruthy();
    expect(typeof handle).toBe('string');

    const xesContent = wasm.export_eventlog_to_xes(handle);
    expect(xesContent).toBeTruthy();
    expect(typeof xesContent).toBe('string');
    expect(xesContent).toContain('<?xml');
    expect(xesContent).toContain('<log');

    expect(() => wasm.export_eventlog_to_xes('obj_999999')).toThrow();
  });
});

describe('I/O Operations - OCEL JSON', () => {
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

  it('should load, export, and reject invalid handle', () => {
    const handle = wasm.load_ocel_from_json(OCEL_MINIMAL);
    expect(handle).toBeTruthy();
    expect(typeof handle).toBe('string');

    const jsonContent = wasm.export_ocel_to_json(handle);
    expect(jsonContent).toBeTruthy();
    expect(typeof jsonContent).toBe('string');
    expect(JSON.parse(jsonContent)).toBeTruthy();

    expect(() => wasm.export_ocel_to_json('obj_999999')).toThrow();
  });
});
