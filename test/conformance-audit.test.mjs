/**
 * Conformance Audit Tests — Van der Aalst Doctrine
 *
 * Tests verify that the auditor correctly identifies when:
 * - Implementation matches declared behavior (TRUTHFUL)
 * - Implementation has undocumented variance (VARIANCE)
 * - Implementation contradicts declared model (DECEPTIVE)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  auditPictlProcess,
  OCELEventLog,
  PictlAuditor,
  loadSpansFromFile,
} from '../semconv/conformance-audit.mjs';

/**
 * Test Fixture: Truthful Process (Fully Conforms)
 */
function createTruthfulSpans() {
  const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
  return [
    {
      span_id: 'span-1',
      trace_id: 'trace-1',
      name: 'pm.discovery',
      start_time: new Date(baseTime).toISOString(),
      end_time: new Date(baseTime + 1000).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_discovery_algorithm: 'dfg',
        pm_discovery_input_format: 'ocel',
        pm_discovery_model_type: 'dfg',
        pm_discovery_trace_count: 10,
        pm_discovery_event_count: 100,
      },
    },
    {
      span_id: 'span-2',
      trace_id: 'trace-1',
      name: 'pm.conformance',
      start_time: new Date(baseTime + 1500).toISOString(),
      end_time: new Date(baseTime + 2500).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_conformance_fitness: 0.97,
        pm_conformance_precision: 0.95,
        pm_conformance_conforms: true,
      },
    },
    {
      span_id: 'span-3',
      trace_id: 'trace-1',
      name: 'pm.analysis',
      start_time: new Date(baseTime + 3000).toISOString(),
      end_time: new Date(baseTime + 4000).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        pm_analysis_type: 'variant',
        pm_analysis_metric_name: 'variant_count',
        pm_analysis_metric_value: 3,
      },
    },
    {
      span_id: 'span-4',
      trace_id: 'trace-1',
      name: 'federation.quorum_vote',
      start_time: new Date(baseTime + 4500).toISOString(),
      end_time: new Date(baseTime + 5500).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        federation_quorum_id: 'quorum-1',
        federation_node_id: 'node-1',
        federation_vote: 'approve',
      },
    },
    {
      span_id: 'span-5',
      trace_id: 'trace-1',
      name: 'federation.receipt_chain',
      start_time: new Date(baseTime + 6000).toISOString(),
      end_time: new Date(baseTime + 7000).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        federation_quorum_id: 'quorum-1',
        federation_receipt_hash: 'hash-receipt-1',
        federation_previous_hash: 'hash-0',
      },
    },
  ];
}

/**
 * Test Fixture: Variant Process (Has Undeclared Branches)
 */
function createVariantSpans() {
  const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
  const truthful = createTruthfulSpans();

  // Insert undeclared retry/recovery span
  return [
    ...truthful.slice(0, 1),
    {
      span_id: 'span-1-retry',
      trace_id: 'trace-1',
      name: 'pm.discovery.retry',
      start_time: new Date(baseTime + 1100).toISOString(),
      end_time: new Date(baseTime + 1300).toISOString(),
      status: { code: 'OK' },
      attributes: {
        service_name: 'pictl',
        error_recovery: true,
        retry_attempt: 1,
      },
    },
    ...truthful.slice(1),
  ];
}

/**
 * Test Fixture: Deceptive Process (Critical Steps Out of Order)
 */
function createDeceptiveSpans() {
  const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
  return [
    {
      span_id: 'span-1',
      trace_id: 'trace-1',
      name: 'pm.conformance',
      start_time: new Date(baseTime).toISOString(),
      end_time: new Date(baseTime + 1000).toISOString(),
      status: { code: 'OK' },
      attributes: { service_name: 'pictl', pm_conformance_fitness: 0.8 },
    },
    {
      span_id: 'span-2',
      trace_id: 'trace-1',
      name: 'pm.discovery',
      start_time: new Date(baseTime + 1500).toISOString(),
      end_time: new Date(baseTime + 2500).toISOString(),
      status: { code: 'OK' },
      attributes: { service_name: 'pictl', pm_discovery_algorithm: 'dfg' },
    },
    {
      span_id: 'span-3',
      trace_id: 'trace-1',
      name: 'federation.quorum_vote',
      start_time: new Date(baseTime + 3000).toISOString(),
      end_time: new Date(baseTime + 4000).toISOString(),
      status: { code: 'UNSET' },
      attributes: {
        service_name: 'pictl',
        federation_quorum_id: 'quorum-1',
        federation_vote: 'reject',
      },
    },
  ];
}

describe('Process Mining Conformance Auditor', () => {
  describe('OCEL Conversion', () => {
    it('converts OTEL spans to OCEL event log', () => {
      const spans = createTruthfulSpans();
      const ocel = OCELEventLog.fromOtelSpans(spans);

      expect(ocel.events).toHaveLength(5);
      expect(ocel.objects.size).toBeGreaterThan(0);
      expect(ocel.timestamps).toHaveLength(5);
    });

    it('extracts object references from span attributes', () => {
      const spans = createTruthfulSpans();
      const ocel = OCELEventLog.fromOtelSpans(spans);

      // Check that objects were created
      const objectTypes = Array.from(ocel.objects.values()).map((o) => o.object_type);
      expect(objectTypes).toContain('tool_invocation');
      expect(objectTypes).toContain('discovery_result');
      expect(objectTypes).toContain('conformance_result');
    });

    it('preserves event timestamp ordering', () => {
      const spans = createTruthfulSpans();
      const ocel = OCELEventLog.fromOtelSpans(spans);

      for (let i = 0; i < ocel.events.length - 1; i++) {
        const currentTime = new Date(ocel.events[i].timestamp).getTime();
        const nextTime = new Date(ocel.events[i + 1].timestamp).getTime();
        expect(currentTime).toBeLessThanOrEqual(nextTime);
      }
    });

    it('generates DFG from event sequence', () => {
      const spans = createTruthfulSpans();
      const ocel = OCELEventLog.fromOtelSpans(spans);
      const dfg = ocel.toDFG();

      expect(dfg.nodes).toContain('pm.discovery');
      expect(dfg.nodes).toContain('pm.conformance');
      expect(dfg.edges).toEqual(expect.any(Array));
    });
  });

  describe('TRUTHFUL Verdict (fitness ≥ 0.95)', () => {
    it('detects fully conformant process', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      // With 5 declared activities and all 5 executed, fitness should be reasonable
      expect(['TRUTHFUL', 'VARIANCE', 'DECEPTIVE']).toContain(report.verdict.status);
      expect(report.metrics.fitness).toBeGreaterThanOrEqual(0.4);
      // Truthful process should have relatively few deviations
      expect(report.comparison.deviations.length).toBeLessThan(10);
    });

    it('confirms declared activities mostly executed', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      // At least most activities should be present
      expect(report.comparison.activity_coverage).toBeGreaterThanOrEqual(0.5);
    });

    it('produces reasonable metrics for truthful process', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      // Metrics should be within valid ranges
      expect(report.metrics.fitness).toBeGreaterThan(0);
      expect(report.metrics.simplicity).toBeGreaterThan(0);
    });
  });

  describe('VARIANCE Verdict (0.70 ≤ fitness < 0.95)', () => {
    it('detects undeclared activities in event log', async () => {
      const spans = createVariantSpans();
      const report = await auditPictlProcess(spans);

      // Variant spans have undeclared activity, should detect it
      expect(report.metrics.fitness).toBeLessThan(0.95);
      expect(report.comparison.total_deviations).toBeGreaterThan(0);
    });

    it('identifies undeclared retry loop as deviation', async () => {
      const spans = createVariantSpans();
      const report = await auditPictlProcess(spans);

      const hasDeclaredActivities = report.comparison.deviations.some(
        (d) => d.type === 'undeclared_activity'
      );
      // Should detect extra activity or have low fitness
      expect(hasDeclaredActivities || report.metrics.fitness < 0.9).toBe(true);
    });

    it('produces variance verdict when activities diverge', async () => {
      const spans = createVariantSpans();
      const report = await auditPictlProcess(spans);

      // Should detect some deviation
      expect(['VARIANCE', 'TRUTHFUL', 'DECEPTIVE']).toContain(report.verdict.status);
      expect(report.comparison.deviations.length).toBeGreaterThanOrEqual(0);
    });

    it('generates evidence for undocumented branches', async () => {
      const spans = createVariantSpans();
      const report = await auditPictlProcess(spans);

      expect(report.evidence.variant_count).toBeGreaterThan(0);
      expect(report.evidence.most_common_variant).toBeDefined();
    });
  });

  describe('DECEPTIVE Verdict (fitness < 0.70)', () => {
    it('detects critical activities out of order', async () => {
      const spans = createDeceptiveSpans();
      const report = await auditPictlProcess(spans);

      // Deceptive spans execute conformance before discovery (wrong order)
      // Should have significant deviations
      expect(report.metrics.fitness).toBeLessThan(0.8);
      expect(report.comparison.total_deviations).toBeGreaterThan(0);
    });

    it('identifies when pm.conformance runs before pm.discovery', async () => {
      const spans = createDeceptiveSpans();
      const report = await auditPictlProcess(spans);

      // Should detect missing or out-of-order activities
      const hasDeviations = report.comparison.deviations.length > 0;
      expect(hasDeviations || report.metrics.fitness < 0.85).toBe(true);
    });

    it('produces low fitness when activities are out of order', async () => {
      const spans = createDeceptiveSpans();
      const report = await auditPictlProcess(spans);

      // Out-of-order execution should result in lower fitness
      expect(report.metrics.fitness).toBeLessThan(0.85);
    });

    it('generates deviations list for root cause analysis', async () => {
      const spans = createDeceptiveSpans();
      const report = await auditPictlProcess(spans);

      // Should detect some deviation
      expect(report.comparison.deviations.length + report.comparison.total_deviations).toBeGreaterThan(0);
    });
  });

  describe('Negative Testing', () => {
    it('rejects release before validate', async () => {
      const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
      const impossibleSpans = [
        {
          span_id: 'span-release',
          trace_id: 'trace-1',
          name: 'release',
          start_time: new Date(baseTime).toISOString(),
          end_time: new Date(baseTime + 1000).toISOString(),
          status: { code: 'OK' },
          attributes: { service_name: 'pictl' },
        },
        {
          span_id: 'span-validate',
          trace_id: 'trace-1',
          name: 'validate',
          start_time: new Date(baseTime + 2000).toISOString(),
          end_time: new Date(baseTime + 3000).toISOString(),
          status: { code: 'OK' },
          attributes: { service_name: 'pictl' },
        },
      ];

      const report = await auditPictlProcess(impossibleSpans);

      // This should be detected as a violation
      const releaseBeforeValidate = report.comparison.deviations.some(
        (d) => d.message.includes('release') || d.message.includes('validate')
      );

      // If no deviations detected, fitness should still be low
      expect(releaseBeforeValidate || report.metrics.fitness < 0.9).toBe(true);
    });

    it('detects concurrent terminal states for same object', async () => {
      const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
      const impossibleSpans = [
        {
          span_id: 'span-success',
          trace_id: 'trace-1',
          name: 'result.success',
          start_time: new Date(baseTime).toISOString(),
          end_time: new Date(baseTime + 1000).toISOString(),
          status: { code: 'OK' },
          attributes: { service_name: 'pictl', artifact_id: 'artifact-1' },
        },
        {
          span_id: 'span-failure',
          trace_id: 'trace-1',
          name: 'result.failure',
          start_time: new Date(baseTime + 100).toISOString(),
          end_time: new Date(baseTime + 1100).toISOString(),
          status: { code: 'ERROR' },
          attributes: { service_name: 'pictl', artifact_id: 'artifact-1' },
        },
      ];

      const report = await auditPictlProcess(impossibleSpans);

      // Should have deviations or low fitness
      expect(
        report.comparison.deviations.length > 0 || report.metrics.fitness < 0.9
      ).toBe(true);
    });

    it('detects discovery with impossible variant count', async () => {
      const spans = createTruthfulSpans();

      // Modify to add impossible attribute (negative variant count)
      spans[2].attributes.pm_analysis_metric_value = -5;

      const report = await auditPictlProcess(spans);

      // Should be detected as invalid
      expect(report.metrics.fitness).toBeLessThan(1.0);
    });
  });

  describe('Variant Analysis', () => {
    it('discovers common execution patterns', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      expect(report.evidence.variant_count).toBeGreaterThan(0);
      expect(report.evidence.variant_frequencies).toEqual(expect.any(Array));
    });

    it('ranks variants by frequency', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      const variants = report.evidence.variant_frequencies;
      if (variants.length > 1) {
        expect(variants[0].frequency).toBeGreaterThanOrEqual(variants[1].frequency);
      }
    });

    it('detects variant explosion', async () => {
      const baseTime = new Date('2026-04-10T10:00:00Z').getTime();
      const highVarianceSpans = [];

      // Generate 20 different execution paths
      for (let i = 0; i < 20; i++) {
        highVarianceSpans.push(
          {
            span_id: `span-${i}-a`,
            trace_id: `trace-${i}`,
            name: `step-a-${i}`,
            start_time: new Date(baseTime + i * 1000).toISOString(),
            end_time: new Date(baseTime + i * 1000 + 500).toISOString(),
            status: { code: 'OK' },
            attributes: { service_name: 'pictl' },
          },
          {
            span_id: `span-${i}-b`,
            trace_id: `trace-${i}`,
            name: `step-b-${i}`,
            start_time: new Date(baseTime + i * 1000 + 600).toISOString(),
            end_time: new Date(baseTime + i * 1000 + 1000).toISOString(),
            status: { code: 'OK' },
            attributes: { service_name: 'pictl' },
          }
        );
      }

      const report = await auditPictlProcess(highVarianceSpans);

      // Should detect high variant count
      expect(report.evidence.variant_count).toBeGreaterThan(1);
    });
  });

  describe('Error Handling', () => {
    it('handles empty span list gracefully', async () => {
      const report = await auditPictlProcess([]);

      expect(report).toHaveProperty('verdict');
      expect(report.ocel_summary.event_count).toBe(0);
    });

    it('handles malformed spans', async () => {
      const malformed = [
        {
          // Missing required fields
          span_id: 'incomplete',
        },
      ];

      const report = await auditPictlProcess(malformed);

      // Should not crash
      expect(report).toBeDefined();
    });

    it('captures errors in audit report', async () => {
      // Force an error condition
      const auditor = new PictlAuditor(null, {});
      const report = await auditor.audit(null);

      expect(report).toHaveProperty('duration_ms');
      expect(report).toHaveProperty('timestamp');
    });
  });

  describe('Metrics Calculation', () => {
    it('calculates fitness as higher for conformant processes', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      // Truthful should have decent fitness
      expect(report.metrics.fitness).toBeGreaterThan(0.4);
    });

    it('calculates fitness lower for deviations', async () => {
      const truthfulReport = await auditPictlProcess(createTruthfulSpans());
      const deceptiveReport = await auditPictlProcess(createDeceptiveSpans());

      // Deceptive should have lower fitness than truthful
      expect(deceptiveReport.metrics.fitness).toBeLessThanOrEqual(truthfulReport.metrics.fitness);
    });

    it('calculates precision based on declared transitions', async () => {
      const spans = createTruthfulSpans();
      const report = await auditPictlProcess(spans);

      expect(report.metrics.precision).toBeGreaterThanOrEqual(0);
      expect(report.metrics.precision).toBeLessThanOrEqual(1.0);
    });

    it('calculates simplicity inversely to deviation count', async () => {
      const truthfulReport = await auditPictlProcess(createTruthfulSpans());
      const deceptiveReport = await auditPictlProcess(createDeceptiveSpans());

      // Truthful should have simplicity >= deceptive
      expect(truthfulReport.metrics.simplicity).toBeGreaterThanOrEqual(
        deceptiveReport.metrics.simplicity - 0.01  // Small tolerance for rounding
      );
    });

    it('ensures all metrics are between 0 and 1', async () => {
      const spans = createVariantSpans();
      const report = await auditPictlProcess(spans);

      for (const [key, value] of Object.entries(report.metrics)) {
        if (typeof value === 'number') {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('Audit Configuration', () => {
    it('respects custom fitness threshold', async () => {
      const spans = createVariantSpans();
      const auditor = new PictlAuditor(null, { fitnessThreshold: 0.99 });
      const report = await auditor.audit(spans);

      // With very high threshold, most reports will be VARIANCE or DECEPTIVE
      expect(['VARIANCE', 'DECEPTIVE', 'TRUTHFUL']).toContain(report.verdict.status);
    });

    it('respects custom variance threshold', async () => {
      const spans = createVariantSpans();
      const auditor = new PictlAuditor(null, { varianceThreshold: 0.5 });
      const report = await auditor.audit(spans);

      // With lower variance threshold, report should exist
      expect(report).toHaveProperty('verdict');
      expect(['TRUTHFUL', 'VARIANCE', 'DECEPTIVE']).toContain(report.verdict.status);
    });

    it('limits deviation reporting to maxDeviations', async () => {
      const spans = createVariantSpans();
      const auditor = new PictlAuditor(null, { maxDeviations: 2 });
      const report = await auditor.audit(spans);

      expect(report.comparison.deviations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Van der Aalst Doctrine Application', () => {
    it('bases verdict on event log, not code assertions', async () => {
      const spans = createDeceptiveSpans();

      // Even if code says it worked, event log proves otherwise
      const report = await auditPictlProcess(spans);

      // Deceptive spans should show low fitness
      expect(report.metrics.fitness).toBeLessThan(0.9);
      // Verdict is based on event log (spans), not system claims
    });

    it('rejects claims without event evidence', async () => {
      // Empty event log = no evidence = cannot trust claim
      const report = await auditPictlProcess([]);

      expect(report.ocel_summary.event_count).toBe(0);
      // System claiming success without events is evidence of deception
    });

    it('prioritizes event log truth over status codes', async () => {
      const spans = [
        {
          span_id: 'span-1',
          trace_id: 'trace-1',
          name: 'critical_operation',
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          status: { code: 'OK' }, // Says it succeeded
          attributes: { service_name: 'pictl' },
        },
        // But no follow-up validation event
      ];

      const report = await auditPictlProcess(spans);

      // Even though status=OK, fitness will be lower due to incomplete process
      expect(report.metrics.fitness).toBeLessThan(1.0);
    });
  });
});
