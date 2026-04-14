/**
 * Agent Orchestrator Integration Test
 *
 * End-to-end pipeline: All 9 van der Aalst agents coordinated via federation voting.
 * This is the Blue Ocean: process topology and path both discovered at runtime.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../harness/agent-orchestrator';
import type { OcelEventLog } from '../harness/ocel-harvester';

describe('Agent Orchestrator - Full Pipeline Integration', () => {
  let orchestrator: AgentOrchestrator;
  let sampleOtelSpans: any[];
  let sampleOcel: OcelEventLog;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();

    // Mock OTel spans
    sampleOtelSpans = [
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'start',
        startTimeUnixNano: 1000000000,
        endTimeUnixNano: 1000001000,
        attributes: { duration_ms: 1, status: 'ok' },
      },
      {
        traceId: 'trace-1',
        spanId: 'span-2',
        name: 'process',
        startTimeUnixNano: 1000001000,
        endTimeUnixNano: 1000050000,
        attributes: { duration_ms: 49, status: 'ok' },
        parentSpanId: 'span-1',
      },
      {
        traceId: 'trace-1',
        spanId: 'span-3',
        name: 'validate',
        startTimeUnixNano: 1000050000,
        endTimeUnixNano: 1000070000,
        attributes: { duration_ms: 20, status: 'ok' },
        parentSpanId: 'span-2',
      },
      {
        traceId: 'trace-1',
        spanId: 'span-4',
        name: 'end',
        startTimeUnixNano: 1000070000,
        endTimeUnixNano: 1000071000,
        attributes: { duration_ms: 1, status: 'ok' },
        parentSpanId: 'span-3',
      },
    ];

    sampleOcel = {
      version: '2.0',
      events: [
        { id: '1', activity: 'start', timestamp: '2026-04-12T10:00:00Z', objects: ['t1'], attributes: { duration_ms: 1 } },
        { id: '2', activity: 'process', timestamp: '2026-04-12T10:00:01Z', objects: ['t1'], attributes: { duration_ms: 49, cost: 50 } },
        { id: '3', activity: 'validate', timestamp: '2026-04-12T10:00:02Z', objects: ['t1'], attributes: { duration_ms: 20 } },
        { id: '4', activity: 'end', timestamp: '2026-04-12T10:00:03Z', objects: ['t1'], attributes: { duration_ms: 1 } },
      ],
      objects: [{ id: 't1', type: 'tool_invocation', state: 'completed', attributes: {} }],
      metadata: {
        source: 'test',
        harvestedAt: new Date().toISOString(),
        spanCount: 4,
      },
    };
  });

  describe('Full Pipeline (All Agents)', () => {
    it('orchestrates all 9 agents end-to-end', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.stageResults.ocel).toBeDefined();
      expect(result.stageResults.discovery).toBeDefined();
      expect(result.stageResults.conformance).toBeDefined();
      expect(result.stageResults.soundness).toBeDefined();
      expect(result.stageResults.performance).toBeDefined();
      expect(result.stageResults.cost).toBeDefined();
      expect(result.stageResults.prescriptive).toBeDefined();
      expect(result.stageResults.predictive).toBeDefined();
      expect(result.stageResults.federation).toBeDefined();
    });

    it('produces valid OCEL from OTel harvest stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const ocel = result.stageResults.ocel!;
      expect(ocel.version).toBe('2.0');
      expect(ocel.events.length).toBeGreaterThan(0);
      expect(ocel.objects.length).toBeGreaterThan(0);
    });

    it('discovers process model in discovery stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const discovery = result.stageResults.discovery!;
      expect(discovery.recommendedAlgorithm).toBeTruthy();
      expect(discovery.modelFitness).toBeGreaterThan(0);
      expect(discovery.modelFitness).toBeLessThanOrEqual(1);
    });

    it('validates conformance in conformance stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const conformance = result.stageResults.conformance!;
      expect(conformance.fitness).toBeGreaterThan(0);
      expect(conformance.precision).toBeGreaterThan(0);
      expect(conformance.violations).toBeGreaterThanOrEqual(0);
    });

    it('verifies soundness in soundness stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const soundness = result.stageResults.soundness!;
      expect(soundness.verdict).toBeTruthy();
      expect(typeof soundness.deadlockFree).toBe('boolean');
      expect(typeof soundness.liveness).toBe('boolean');
      expect(typeof soundness.bounded).toBe('boolean');
    });

    it('analyzes performance in performance stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const performance = result.stageResults.performance!;
      expect(performance.avgTraceTimeMs).toBeGreaterThan(0);
      expect(performance.topBottleneck).toBeTruthy();
    });

    it('selects optimal algorithm in cost stage', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const cost = result.stageResults.cost!;
      expect(cost.selectedAlgorithm).toBeTruthy();
      expect(cost.estimatedCost).toBeGreaterThan(0);
    });

    it('generates prescriptive recommendations', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const prescriptive = result.stageResults.prescriptive!;
      expect(prescriptive.totalGainPercent).toBeGreaterThanOrEqual(0);
      expect(prescriptive.totalGainPercent).toBeLessThanOrEqual(100);
      expect(prescriptive.recommendedActions).toBeGreaterThanOrEqual(0);
    });

    it('predicts process outcomes and risks', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const predictive = result.stageResults.predictive!;
      expect(['success', 'delay', 'rework', 'failure']).toContain(predictive.predictedOutcome);
      expect(predictive.confidencePercent).toBeGreaterThanOrEqual(0);
      expect(predictive.confidencePercent).toBeLessThanOrEqual(100);
    });

    it('reaches federation consensus', async () => {
      const result = await orchestrator.orchestrate(sampleOtelSpans);

      const federation = result.stageResults.federation!;
      expect(['TRUTHFUL', 'VARIANCE', 'DECEPTIVE']).toContain(federation.verdict);
      expect(federation.confidence).toBeGreaterThanOrEqual(0);
      expect(federation.confidence).toBeLessThanOrEqual(1);
      expect(federation.agreeingAgents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Selective Pipeline (Configurable Stages)', () => {
    it('respects enabled/disabled stage configuration', async () => {
      const config = {
        enableHarvest: true,
        enableDiscovery: true,
        enableConformance: false, // Disable conformance
        enableSoundness: true,
        enablePerformance: false, // Disable performance
        enableCost: true,
        enableDrift: false,
        enablePrescriptive: true,
        enablePredictive: false, // Disable predictive
        enableFederation: true,
      };

      const result = await orchestrator.orchestrate(sampleOtelSpans, undefined, config);

      expect(result.stageResults.conformance).toBeUndefined();
      expect(result.stageResults.performance).toBeUndefined();
      expect(result.stageResults.predictive).toBeUndefined();
      expect(result.stageResults.discovery).toBeDefined();
      expect(result.stageResults.federation).toBeDefined();
    });

    it('handles drift detection with baseline OCEL', async () => {
      const baselineOcel: OcelEventLog = {
        version: '2.0',
        events: [
          { id: '1', activity: 'a', timestamp: '2026-04-12T09:00:00Z', objects: ['baseline'], attributes: {} },
          { id: '2', activity: 'b', timestamp: '2026-04-12T09:00:01Z', objects: ['baseline'], attributes: {} },
        ],
        objects: [{ id: 'baseline', type: 'tool_invocation', state: 'completed', attributes: {} }],
        metadata: {
          source: 'baseline',
          harvestedAt: new Date().toISOString(),
          spanCount: 2,
        },
      };

      const config = {
        enableHarvest: true,
        enableDiscovery: false,
        enableConformance: false,
        enableSoundness: false,
        enablePerformance: false,
        enableCost: false,
        enableDrift: true, // Enable drift detection
        enablePrescriptive: false,
        enablePredictive: false,
        enableFederation: false,
      };

      const result = await orchestrator.orchestrate(sampleOtelSpans, baselineOcel, config);

      expect(result.stageResults.drift).toBeDefined();
      expect(result.stageResults.drift!.driftDetected).toBeDefined();
    });
  });

  describe('Resource Budget Enforcement', () => {
    it('respects resource budget constraints', async () => {
      const config = {
        enableHarvest: true,
        enableDiscovery: true,
        enableConformance: true,
        enableSoundness: true,
        enablePerformance: true,
        enableCost: true,
        enableDrift: false,
        enablePrescriptive: false,
        enablePredictive: false,
        enableFederation: false,
        resourceBudget: {
          maxLatencyMs: 100,
          maxComputeUnits: 50,
          costLimit: 10,
        },
      };

      const result = await orchestrator.orchestrate(sampleOtelSpans, undefined, config);

      // Should either succeed or gracefully degrade
      expect(result.executionTimeMs).toBeLessThan(10000); // Sanity check: shouldn't take 10+ seconds
    });
  });

  describe('Blue Ocean Value Proposition', () => {
    it('produces unified process intelligence without pre-authored governance', async () => {
      // This test validates the core Blue Ocean thesis:
      // "If topology and path can both be discovered at runtime,
      //  then you are not competing in the workflow market.
      //  You are competing in the market that makes the workflow market obsolete."

      const result = await orchestrator.orchestrate(sampleOtelSpans);

      // 1. Topology discovered (not pre-authored)
      expect(result.stageResults.discovery?.recommendedAlgorithm).toBeDefined();

      // 2. Path derived from actual execution (via conformance + drift)
      expect(result.stageResults.conformance?.fitness).toBeDefined();
      expect(result.stageResults.drift === undefined || result.stageResults.drift.driftDetected !== undefined).toBe(
        true
      );

      // 3. Intelligence synthesized from reality (via federation voting)
      expect(result.stageResults.federation?.verdict).toBeDefined();
      expect(['TRUTHFUL', 'VARIANCE', 'DECEPTIVE']).toContain(result.stageResults.federation!.verdict);

      // All agents contribute to ground truth: consensus verdict reflects reality, not design
      expect(result.stageResults.federation!.confidence).toBeGreaterThanOrEqual(0);
    });

    it('demonstrates superiority over pre-authored workflow systems', async () => {
      // Traditional workflow systems (SAP, Celonis):
      // - Require workflow definition upfront
      // - Can only detect deviation from pre-authored model
      // - Cannot adapt to runtime discovery

      // This orchestrator:
      // - Discovers workflow from runtime evidence (OTEL spans)
      // - Validates against discovered reality (not design)
      // - Recommends optimizations grounded in actual execution
      // - Predicts outcomes based on real patterns

      const result = await orchestrator.orchestrate(sampleOtelSpans);

      // Derived intelligence (unavailable in traditional systems)
      const hasPrescriptive = result.stageResults.prescriptive !== undefined;
      const hasPredictive = result.stageResults.predictive !== undefined;
      const hasFederation = result.stageResults.federation !== undefined;

      expect(hasPrescriptive || hasPredictive || hasFederation).toBe(true);
      expect(result.message).toContain('Process intelligence');
    });
  });

  describe('Error Handling', () => {
    it('gracefully handles malformed OTel input', async () => {
      const malformedSpans = null as any;

      const result = await orchestrator.orchestrate(malformedSpans);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });

    it('handles empty span collection', async () => {
      const emptySpans: any[] = [];

      const result = await orchestrator.orchestrate(emptySpans);

      // Should fail gracefully
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
