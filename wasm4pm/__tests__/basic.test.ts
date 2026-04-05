/**
 * Unit tests for wasm4pm basic functionality
 */

import { describe, it, expect } from 'vitest';
import * as wasm from '../pkg/wasm4pm.js';

describe('wasm4pm - Basic Functionality', () => {
  it('should successfully import the WASM module', async () => {
    expect(wasm).toBeDefined();
    expect(wasm.default).toBeDefined();
  });

  it('should return a valid semantic version from get_version()', () => {
    const version = wasm.get_version();
    expect(version).toBeTruthy();
    expect(typeof version).toBe('string');
    // Match semver pattern: 1.2.3 or 1.2.3-alpha
    expect(version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  it('should return a non-empty list of available discovery algorithms', () => {
    const algorithms = wasm.available_discovery_algorithms();
    expect(algorithms).toBeTruthy();
    expect(typeof algorithms).toBe('string');
    expect(algorithms.length).toBeGreaterThan(0);
    // Should be a JSON array of strings
    const parsed = JSON.parse(algorithms);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('should have initialized without errors', () => {
    // This test validates that setup.ts initialization succeeded
    // If init failed, we would not reach this test
    expect(true).toBe(true);
  });

  describe('Module structure', () => {
    it('should export core event log functions', () => {
      expect(wasm.load_eventlog_from_xes).toBeDefined();
      expect(wasm.export_eventlog_to_xes).toBeDefined();
      expect(wasm.get_eventlog_info).toBeDefined();
    });

    it('should export discovery algorithm functions', () => {
      expect(wasm.discover_dfg).toBeDefined();
      expect(wasm.discover_process_skeleton).toBeDefined();
      expect(wasm.discover_alpha_plus_plus).toBeDefined();
    });

    it('should export state management functions', () => {
      expect(wasm.clear_all_objects).toBeDefined();
      expect(wasm.list_all_handles).toBeDefined();
    });
  });
});
