/**
 * Tests for gap-events.ts emitters and getGapEvents from refinement-orchestrator.ts.
 * Covers LIVE-09 span event lifecycle: detected → closed | exhausted.
 */

import { describe, it, expect } from 'vitest';

import {
  emitGapDetected,
  emitGapClosed,
  emitGapExhausted,
  emitGapAlternateEvidence,
  type GapDetectedEvent,
  type GapClosedEvent,
  type GapExhaustedEvent,
  type GapAlternateEvidenceEvent,
} from '../gap-events.js';

import {
  getGapEvents,
  type RefinementState,
  type StepResult,
} from '../refinement-orchestrator.js';

import type { RefinementAttempt } from '../route-refinement.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-05-16T00:00:00.000Z';

function makeAttempt(overrides: Partial<RefinementAttempt> = {}): RefinementAttempt {
  return {
    attempt_id: 'ULID-0001',
    variant: 'RelaxThreshold',
    cost: 1,
    triggered_by: 'run-abc',
    started_at: NOW,
    gap_activity_id: 'act:gap-1',
    previous_precision: 0.6,
    previous_fitness: 0.7,
    ...overrides,
  };
}

function makeState(overrides: Partial<RefinementState> = {}): RefinementState {
  return {
    attempts: [],
    current_variant: 'KeepCurrent',
    andon_emitted: false,
    started_at: NOW,
    run_id: 'run-abc',
    ...overrides,
  };
}

function makeStepResult(
  action: StepResult['action'],
  stateOverrides: Partial<RefinementState> = {},
): StepResult {
  return {
    next_state: makeState(stateOverrides),
    action,
  };
}

// ---------------------------------------------------------------------------
// emitGapDetected
// ---------------------------------------------------------------------------

describe('emitGapDetected', () => {
  const evt: GapDetectedEvent = {
    runId: 'run-001',
    gapActivityId: 'act:gap-detect',
    correlationId: 'corr-xyz',
    detectedAt: NOW,
  };

  it('returns event with name === "powl.gap.detected"', () => {
    const record = emitGapDetected(evt);
    expect(record.name).toBe('powl.gap.detected');
  });

  it('event has powl.gap.activity_id in attributes', () => {
    const record = emitGapDetected(evt);
    expect(record.attributes['powl.gap.activity_id']).toBe('act:gap-detect');
  });

  it('event has powl.gap.correlation_id in attributes', () => {
    const record = emitGapDetected(evt);
    expect(record.attributes['powl.gap.correlation_id']).toBe('corr-xyz');
  });

  it('event has run.id in attributes', () => {
    const record = emitGapDetected(evt);
    expect(record.attributes['run.id']).toBe('run-001');
  });
});

// ---------------------------------------------------------------------------
// emitGapClosed
// ---------------------------------------------------------------------------

describe('emitGapClosed', () => {
  const evt: GapClosedEvent = {
    runId: 'run-002',
    gapActivityId: 'act:gap-close',
    correlationId: 'corr-abc',
    closedAt: NOW,
    closingVariant: 'ExtendWindow',
  };

  it('returns event with name === "powl.gap.closed"', () => {
    const record = emitGapClosed(evt);
    expect(record.name).toBe('powl.gap.closed');
  });

  it('event has powl.gap.closing_variant in attributes', () => {
    const record = emitGapClosed(evt);
    expect(record.attributes['powl.gap.closing_variant']).toBe('ExtendWindow');
  });
});

// ---------------------------------------------------------------------------
// emitGapExhausted
// ---------------------------------------------------------------------------

describe('emitGapExhausted', () => {
  const evt: GapExhaustedEvent = {
    runId: 'run-003',
    gapActivityId: 'act:gap-exhaust',
    correlationId: 'corr-def',
    exhaustedAt: NOW,
    attemptsCount: 8,
  };

  it('returns event with name === "powl.gap.exhausted"', () => {
    const record = emitGapExhausted(evt);
    expect(record.name).toBe('powl.gap.exhausted');
  });

  it('event has powl.gap.attempts_count in attributes', () => {
    const record = emitGapExhausted(evt);
    expect(record.attributes['powl.gap.attempts_count']).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// emitGapAlternateEvidence
// ---------------------------------------------------------------------------

describe('emitGapAlternateEvidence', () => {
  const evt: GapAlternateEvidenceEvent = {
    runId: 'run-004',
    gapActivityId: 'act:gap-alt',
    correlationId: 'corr-ghi',
    receivedAt: NOW,
    evidenceSource: 'secondary-model-v2',
  };

  it("returns event with name 'powl.gap.alternate_evidence_received'", () => {
    const record = emitGapAlternateEvidence(evt);
    expect(record.name).toBe('powl.gap.alternate_evidence_received');
  });

  it('event has powl.gap.evidence_source attribute', () => {
    const record = emitGapAlternateEvidence(evt);
    expect(record.attributes['powl.gap.evidence_source']).toBe('secondary-model-v2');
  });
});

// ---------------------------------------------------------------------------
// getGapEvents
// ---------------------------------------------------------------------------

describe('getGapEvents', () => {
  it('returns [GapDetected] when state.attempts is empty (first detection)', () => {
    const state = makeState({ attempts: [] });
    // next_state has one attempt so gapActivityId can be resolved
    const result = makeStepResult('continue', {
      attempts: [makeAttempt({ gap_activity_id: 'act:gap-first' })],
      current_variant: 'RelaxThreshold',
    });

    const events = getGapEvents(state, result, 'corr-first');

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('powl.gap.detected');
  });

  it('returns [GapExhausted] when result.action === "escalate"', () => {
    // state must have at least one attempt so it is not the first-detection branch
    const attempt = makeAttempt({ gap_activity_id: 'act:gap-esc' });
    const state = makeState({ attempts: [attempt] });
    const result = makeStepResult('escalate', {
      attempts: [attempt],
      andon_emitted: true,
    });

    const events = getGapEvents(state, result, 'corr-esc');

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('powl.gap.exhausted');
  });

  it('returns [GapClosed] when result.action === "resolved"', () => {
    const attempt = makeAttempt({ gap_activity_id: 'act:gap-res' });
    const state = makeState({
      attempts: [attempt],
      current_variant: 'SwitchVariant',
    });
    const result = makeStepResult('resolved', {
      attempts: [attempt],
    });

    const events = getGapEvents(state, result, 'corr-res');

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('powl.gap.closed');
  });

  it('returns [] for other actions (mid-ladder continue with existing attempts)', () => {
    // state has ≥1 attempt, action is 'continue' → no lifecycle boundary
    const attempt = makeAttempt({ gap_activity_id: 'act:gap-mid' });
    const state = makeState({ attempts: [attempt] });
    const nextAttempt = makeAttempt({
      attempt_id: 'ULID-0002',
      variant: 'ExtendWindow',
      cost: 2,
      gap_activity_id: 'act:gap-mid',
    });
    const result = makeStepResult('continue', {
      attempts: [attempt, nextAttempt],
      current_variant: 'ExtendWindow',
    });

    const events = getGapEvents(state, result, 'corr-mid');

    expect(events).toHaveLength(0);
  });
});
