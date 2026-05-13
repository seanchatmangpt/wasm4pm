/**
 * State Management Tests — object storage, deletion, and clear-all merged
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';
import { XES_MINIMAL, OCEL_MINIMAL } from '../helpers/fixtures';

describe('State Management - Object Storage', () => {
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

  it('should store EventLog and OCEL with valid unique handles, and track object count', () => {
    const handle1 = wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(handle1).toBeTruthy();
    expect(typeof handle1).toBe('string');
    expect(handle1).toMatch(/^obj_\d+$/);

    const handle2 = wasm.load_ocel_from_json(OCEL_MINIMAL);
    expect(handle2).toBeTruthy();
    expect(typeof handle2).toBe('string');
    expect(handle2).toMatch(/^obj_\d+$/);

    const handle3 = wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(handle3).not.toBe(handle1);

    const count = wasm.object_count();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('State Management - Object Deletion', () => {
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

  it('should delete by handle, return false for non-existent, and fail on deleted handle', () => {
    const handle = wasm.load_eventlog_from_xes(XES_MINIMAL);
    const initialCount = wasm.object_count();

    const deleted = wasm.delete_object(handle);
    expect(deleted).toBe(true);
    expect(wasm.object_count()).toBe(initialCount - 1);

    expect(wasm.delete_object('obj_999999')).toBe(false);

    const handle2 = wasm.load_eventlog_from_xes(XES_MINIMAL);
    wasm.delete_object(handle2);
    expect(() => wasm.export_eventlog_to_xes(handle2)).toThrow();
  });
});

describe('State Management - Clear All Objects', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {}
  });

  it('should clear all objects and work on empty state', () => {
    wasm.load_eventlog_from_xes(XES_MINIMAL);
    expect(wasm.object_count()).toBeGreaterThan(0);

    wasm.clear_all_objects();
    expect(wasm.object_count()).toBe(0);

    expect(() => wasm.clear_all_objects()).not.toThrow();
    expect(wasm.object_count()).toBe(0);
  });
});
