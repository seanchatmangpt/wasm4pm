/**
 * I/O Operations Tests
 * Tests for loading and exporting EventLogs and OCELs
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as wasm from '../../pkg/wasm4pm.js';

describe('I/O Operations - OCEL JSON', () => {
  beforeEach(async () => {
    try {
      await wasm.init();
      await wasm.clear_all_objects();
    } catch (e) {
      // Ignore
    }
  });

  afterEach(async () => {
    try {
      await wasm.clear_all_objects();
    } catch (e) {
      // Ignore
    }
  });

  it('should load a valid OCEL JSON file', () => {
    const json = `{
  "event_types": ["Create", "Update"],
  "object_types": ["Order"],
  "events": [{"id": "e1", "event_type": "Create", "timestamp": "2023-01-01T10:00:00", "attributes": {}, "object_ids": ["o1"]}],
  "objects": [{"id": "o1", "object_type": "Order", "attributes": {}}]
}`;

    const handle = wasm.load_ocel_from_json(json);
    expect(handle).toBeTruthy();
    expect(typeof handle).toBe('string');
  });

  it('should export OCEL to JSON format', () => {
    const json = `{
  "event_types": ["Create", "Update"],
  "object_types": ["Order"],
  "events": [{"id": "e1", "event_type": "Create", "timestamp": "2023-01-01T10:00:00", "attributes": {}, "object_ids": ["o1"]}],
  "objects": [{"id": "o1", "object_type": "Order", "attributes": {}}]
}`;

    const loadHandle = wasm.load_ocel_from_json(json);
    const jsonContent = wasm.export_ocel_to_json(loadHandle);

    expect(jsonContent).toBeTruthy();
    expect(typeof jsonContent).toBe('string');

    const jsonObj = JSON.parse(jsonContent);
    expect(jsonObj).toBeTruthy();
  });

  it('should fail when OCEL handle is invalid', () => {
    expect(() => {
      wasm.export_ocel_to_json('obj_999999');
    }).toThrow();
  });
});
