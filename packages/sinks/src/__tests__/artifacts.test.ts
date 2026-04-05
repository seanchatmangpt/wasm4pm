/**
 * Artifact Type Guard Tests
 * Tests for typed artifact interfaces and type guards
 */

import { describe, it, expect } from 'vitest';
import {
  isReceiptArtifact,
  isModelArtifact,
  isReportArtifact,
} from '../artifacts.js';

describe('Artifact Type Guards', () => {
  describe('isReceiptArtifact()', () => {
    it('should recognize valid receipt', () => {
      const receipt = {
        run_id: 'run-001',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success',
      };
      expect(isReceiptArtifact(receipt)).toBe(true);
    });

    it('should reject receipt without run_id', () => {
      const invalid = {
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success',
      };
      expect(isReceiptArtifact(invalid)).toBe(false);
    });

    it('should reject receipt without algorithm', () => {
      const invalid = {
        run_id: 'run-001',
        timestamp: '2024-01-01T00:00:00Z',
        status: 'success',
      };
      expect(isReceiptArtifact(invalid)).toBe(false);
    });

    it('should reject null', () => {
      expect(isReceiptArtifact(null)).toBe(false);
    });

    it('should reject primitives', () => {
      expect(isReceiptArtifact('string')).toBe(false);
      expect(isReceiptArtifact(42)).toBe(false);
    });

    it('should accept receipt with optional fields', () => {
      const receipt = {
        run_id: 'run-001',
        timestamp: '2024-01-01T00:00:00Z',
        algorithm: 'dfg',
        status: 'success',
        event_count: 100,
        trace_count: 10,
        duration_ms: 500,
      };
      expect(isReceiptArtifact(receipt)).toBe(true);
    });
  });

  describe('isModelArtifact()', () => {
    it('should recognize valid model', () => {
      const model = { name: 'process-model', nodes: [], edges: [] };
      expect(isModelArtifact(model)).toBe(true);
    });

    it('should reject model without name', () => {
      expect(isModelArtifact({ nodes: [], edges: [] })).toBe(false);
    });

    it('should reject null', () => {
      expect(isModelArtifact(null)).toBe(false);
    });

    it('should accept model with type', () => {
      const model = { name: 'model', type: 'petri_net', places: [], transitions: [] };
      expect(isModelArtifact(model)).toBe(true);
    });
  });

  describe('isReportArtifact()', () => {
    it('should recognize valid HTML report', () => {
      const report = { name: 'report', format: 'html', content: '<html/>' };
      expect(isReportArtifact(report)).toBe(true);
    });

    it('should recognize valid Markdown report', () => {
      const report = { name: 'report', format: 'markdown', content: '# Title' };
      expect(isReportArtifact(report)).toBe(true);
    });

    it('should reject report without content', () => {
      expect(isReportArtifact({ name: 'report', format: 'html' })).toBe(false);
    });

    it('should reject report without format', () => {
      expect(isReportArtifact({ name: 'report', content: 'text' })).toBe(false);
    });

    it('should reject null', () => {
      expect(isReportArtifact(null)).toBe(false);
    });
  });
});
