/**
 * Integration test: ArgRTracker output connected to emitProofAggregate
 *
 * Verifies that ARGR (Actor-Resolved Gap Rate) metrics computed by ArgRTracker
 * are compatible with the proof.aggregate LIVE-01/LIVE-02 span emitted by
 * emitProofAggregate, and that they can be combined into a single enriched
 * attribute bag for the proof.aggregate event.
 *
 * ArgRTracker API (from argr.ts):
 *   - constructor: no arguments
 *   - recordDetected(gapId, activityId, runId, initialPrecision)
 *   - recordResolved(gapId, finalPrecision)
 *   - computeArgR() → number
 *   - toOtelAttributes() → { 'argr.rate', 'argr.detected', 'argr.resolved',
 *                             'argr.handover_density' }
 *
 * emitProofAggregate API (from spine-bridge.ts):
 *   - emitProofAggregate({ runId, fitness, precision, aggregatedAt })
 *     → SpineTraceRecord with .fields containing 'run.id', 'mcpp.conformance.fitness',
 *       'mcpp.conformance.precision', 'proof.aggregated_at'
 */

import { describe, it, expect } from 'vitest';
import { ArgRTracker } from '../argr';
import { emitProofAggregate } from '../spine-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// ArgRTracker unit behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('ArgRTracker computes ARGR correctly', () => {
  it('rate is 1.0 when all detected gaps are resolved', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordResolved('gap-1', 0.82);
    expect(tracker.computeArgR()).toBe(1.0);
  });

  it('rate is 0.5 when half the gaps are resolved', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.40);
    tracker.recordDetected('gap-2', 'act-B', 'run-1', 0.35);
    tracker.recordResolved('gap-1', 0.85);
    expect(tracker.computeArgR()).toBe(0.5);
  });

  it('rate is 0.0 when no gaps have been resolved', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    expect(tracker.computeArgR()).toBe(0.0);
  });

  it('rate is 0.0 when no gaps have been detected', () => {
    const tracker = new ArgRTracker();
    expect(tracker.computeArgR()).toBe(0.0);
  });

  it('resolving an unknown gap id is a no-op (does not throw)', () => {
    const tracker = new ArgRTracker();
    expect(() => tracker.recordResolved('unknown-gap', 0.9)).not.toThrow();
    expect(tracker.computeArgR()).toBe(0.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ArgRTracker.toOtelAttributes() — attribute key contract
// ─────────────────────────────────────────────────────────────────────────────

describe('ArgRTracker.toOtelAttributes returns expected attribute keys', () => {
  it('returns argr.rate key with the current ARGR value', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordResolved('gap-1', 0.82);
    const attrs = tracker.toOtelAttributes();
    expect(attrs).toHaveProperty('argr.rate');
    expect(attrs['argr.rate']).toBe(1.0);
  });

  it('returns argr.detected key with count of detected gaps', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordDetected('gap-2', 'act-B', 'run-1', 0.30);
    const attrs = tracker.toOtelAttributes();
    expect(attrs).toHaveProperty('argr.detected');
    expect(attrs['argr.detected']).toBe(2);
  });

  it('returns argr.resolved key with count of resolved gaps', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordDetected('gap-2', 'act-B', 'run-1', 0.30);
    tracker.recordResolved('gap-1', 0.85);
    const attrs = tracker.toOtelAttributes();
    expect(attrs).toHaveProperty('argr.resolved');
    expect(attrs['argr.resolved']).toBe(1);
  });

  it('returns argr.handover_density key', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordResolved('gap-1', 0.82);
    const attrs = tracker.toOtelAttributes();
    expect(attrs).toHaveProperty('argr.handover_density');
    expect(typeof attrs['argr.handover_density']).toBe('number');
  });

  it('all four expected keys are present simultaneously', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('gap-1', 'act-A', 'run-1', 0.45);
    tracker.recordResolved('gap-1', 0.82);
    const attrs = tracker.toOtelAttributes();
    expect(Object.keys(attrs).sort()).toEqual(
      ['argr.detected', 'argr.handover_density', 'argr.rate', 'argr.resolved'],
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: ARGR attributes enriching the proof.aggregate span
// ─────────────────────────────────────────────────────────────────────────────

describe('ARGR + spine proof.aggregate integration', () => {
  it('emitProofAggregate returns a span with the required LIVE-02 fields', () => {
    const span = emitProofAggregate({
      runId: 'run-42',
      fitness: 1.0,
      precision: 0.95,
      aggregatedAt: new Date().toISOString(),
    });
    expect(span.name).toBe('proof.aggregate');
    expect(span.fields['run.id']).toBe('run-42');
    expect(span.fields['mcpp.conformance.fitness']).toBe(1.0);
    expect(span.fields['mcpp.conformance.precision']).toBe(0.95);
  });

  it('ARGR attributes can be merged onto the proof.aggregate fields', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('g1', 'act-X', 'run-42', 0.40);
    tracker.recordResolved('g1', 0.90);
    const argrAttrs = tracker.toOtelAttributes();

    const span = emitProofAggregate({
      runId: 'run-42',
      fitness: 1.0,
      precision: 1.0,
      aggregatedAt: new Date().toISOString(),
    });

    // Combine spine fields with ARGR supplemental attributes
    const combined = { ...span.fields, ...argrAttrs };

    // ARGR rate is present in combined bag
    expect(combined['argr.rate']).toBe(1.0);
    // Conformance dims from proof.aggregate are preserved
    expect(combined['mcpp.conformance.fitness']).toBe(1.0);
    // run.id from proof.aggregate is preserved
    expect(combined['run.id']).toBe('run-42');
  });

  it('combined bag preserves all ARGR keys alongside proof.aggregate keys', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('g1', 'act-X', 'run-99', 0.50);
    tracker.recordDetected('g2', 'act-Y', 'run-99', 0.45);
    tracker.recordResolved('g1', 0.88);

    const argrAttrs = tracker.toOtelAttributes();
    const span = emitProofAggregate({
      runId: 'run-99',
      fitness: 0.92,
      precision: 0.85,
      aggregatedAt: new Date().toISOString(),
    });

    const combined = { ...span.fields, ...argrAttrs };

    // ARGR keys
    expect(combined['argr.rate']).toBe(0.5);
    expect(combined['argr.detected']).toBe(2);
    expect(combined['argr.resolved']).toBe(1);
    expect(typeof combined['argr.handover_density']).toBe('number');

    // proof.aggregate keys
    expect(combined['mcpp.conformance.fitness']).toBe(0.92);
    expect(combined['mcpp.conformance.precision']).toBe(0.85);
    expect(combined['run.id']).toBe('run-99');
    expect(combined['proof.aggregated_at']).toBeDefined();
  });

  it('ARGR with no resolved gaps produces argr.rate 0.0 in the combined span', () => {
    const tracker = new ArgRTracker();
    tracker.recordDetected('g1', 'act-A', 'run-7', 0.30);

    const argrAttrs = tracker.toOtelAttributes();
    const span = emitProofAggregate({
      runId: 'run-7',
      fitness: 0.70,
      precision: 0.60,
      aggregatedAt: new Date().toISOString(),
    });

    const combined = { ...span.fields, ...argrAttrs };
    expect(combined['argr.rate']).toBe(0.0);
    expect(combined['argr.detected']).toBe(1);
    expect(combined['argr.resolved']).toBe(0);
  });

  it('proof.aggregate span kind is always "event"', () => {
    const span = emitProofAggregate({
      runId: 'run-kind-check',
      fitness: 0.88,
      precision: 0.77,
      aggregatedAt: new Date().toISOString(),
    });
    expect(span.kind).toBe('event');
  });

  it('proof.aggregate ts_ns is a positive number derived from aggregatedAt', () => {
    const aggregatedAt = new Date().toISOString();
    const span = emitProofAggregate({
      runId: 'run-ts-check',
      fitness: 0.9,
      precision: 0.8,
      aggregatedAt,
    });
    const expectedTsNs = new Date(aggregatedAt).getTime() * 1_000_000;
    expect(span.ts_ns).toBe(expectedTsNs);
  });
});
