import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGate,
  runCertification,
  clearGates,
  getRegisteredGates,
  createGate,
  formatReport,
} from '../../src/certification.js';
import type { CertificationReport } from '../../src/certification.js';

describe('Certification', () => {
  beforeEach(() => {
    clearGates();
  });

  describe('registerGate', () => {
    it('registers a gate function', () => {
      registerGate('test-gate', () => ({
        gate: 'test-gate', passed: true, details: 'ok', duration_ms: 0,
      }));
      expect(getRegisteredGates()).toContain('test-gate');
    });

    it('overwrites existing gate', () => {
      registerGate('gate', () => ({ gate: 'gate', passed: true, details: 'v1', duration_ms: 0 }));
      registerGate('gate', () => ({ gate: 'gate', passed: false, details: 'v2', duration_ms: 0 }));
      expect(getRegisteredGates().filter(g => g === 'gate')).toHaveLength(1);
    });
  });

  describe('createGate', () => {
    it('creates a passing gate', async () => {
      createGate('simple', () => true, 'All good');
      const report = await runCertification('1.0.0');
      expect(report.gates.find(g => g.gate === 'simple')?.passed).toBe(true);
    });

    it('creates a failing gate', async () => {
      createGate('failing', () => false);
      const report = await runCertification('1.0.0');
      expect(report.gates.find(g => g.gate === 'failing')?.passed).toBe(false);
    });

    it('creates an async gate', async () => {
      createGate('async', async () => true);
      const report = await runCertification('1.0.0');
      expect(report.gates.find(g => g.gate === 'async')?.passed).toBe(true);
    });
  });

  describe('runCertification', () => {
    it('runs all registered gates', async () => {
      registerGate('g1', () => ({ gate: 'g1', passed: true, details: 'ok', duration_ms: 0 }));
      registerGate('g2', () => ({ gate: 'g2', passed: true, details: 'ok', duration_ms: 0 }));
      const report = await runCertification('1.0.0');
      expect(report.gates).toHaveLength(2);
    });

    it('reports overall pass when all gates pass', async () => {
      registerGate('g1', () => ({ gate: 'g1', passed: true, details: 'ok', duration_ms: 0 }));
      const report = await runCertification('1.0.0');
      expect(report.passed).toBe(true);
      expect(report.summary).toContain('1/1');
    });

    it('reports overall fail when any gate fails', async () => {
      registerGate('pass', () => ({ gate: 'pass', passed: true, details: 'ok', duration_ms: 0 }));
      registerGate('fail', () => ({ gate: 'fail', passed: false, details: 'nope', duration_ms: 0 }));
      const report = await runCertification('1.0.0');
      expect(report.passed).toBe(false);
      expect(report.summary).toContain('1/2');
    });

    it('catches throwing gates', async () => {
      registerGate('throw', () => { throw new Error('boom'); });
      const report = await runCertification('1.0.0');
      expect(report.gates[0].passed).toBe(false);
      expect(report.gates[0].details).toContain('boom');
    });

    it('includes version and timestamp', async () => {
      const report = await runCertification('2.0.0');
      expect(report.version).toBe('2.0.0');
      expect(report.timestamp).toBeDefined();
      expect(new Date(report.timestamp).getTime()).not.toBeNaN();
    });

    it('measures gate duration', async () => {
      registerGate('slow', async () => {
        await new Promise(r => setTimeout(r, 20));
        return { gate: 'slow', passed: true, details: 'done', duration_ms: 0 };
      });
      const report = await runCertification('1.0.0');
      expect(report.gates[0].duration_ms).toBeGreaterThanOrEqual(10);
    });

    it('handles empty gate list', async () => {
      const report = await runCertification('1.0.0');
      expect(report.passed).toBe(true);
      expect(report.gates).toHaveLength(0);
      expect(report.summary).toContain('0/0');
    });
  });

  describe('clearGates', () => {
    it('removes all registered gates', () => {
      registerGate('g1', () => ({ gate: 'g1', passed: true, details: '', duration_ms: 0 }));
      registerGate('g2', () => ({ gate: 'g2', passed: true, details: '', duration_ms: 0 }));
      clearGates();
      expect(getRegisteredGates()).toHaveLength(0);
    });
  });

  describe('formatReport', () => {
    it('formats passing report', () => {
      const report: CertificationReport = {
        timestamp: '2026-04-04T00:00:00Z',
        version: '1.0.0',
        gates: [{ gate: 'test', passed: true, details: 'ok', duration_ms: 5 }],
        passed: true,
        summary: '1/1 gates passed',
      };
      const formatted = formatReport(report);
      expect(formatted).toContain('PASSED');
      expect(formatted).toContain('[PASS]');
      expect(formatted).toContain('test');
      expect(formatted).toContain('1.0.0');
    });

    it('formats failing report', () => {
      const report: CertificationReport = {
        timestamp: '2026-04-04T00:00:00Z',
        version: '1.0.0',
        gates: [{ gate: 'test', passed: false, details: 'nope', duration_ms: 5 }],
        passed: false,
        summary: '0/1 gates passed',
      };
      const formatted = formatReport(report);
      expect(formatted).toContain('FAILED');
      expect(formatted).toContain('[FAIL]');
    });

    it('includes duration', () => {
      const report: CertificationReport = {
        timestamp: '2026-04-04T00:00:00Z',
        version: '1.0.0',
        gates: [{ gate: 'test', passed: true, details: 'ok', duration_ms: 42 }],
        passed: true,
        summary: '1/1',
      };
      const formatted = formatReport(report);
      expect(formatted).toContain('42ms');
    });
  });
});
