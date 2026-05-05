/**
 * Tests for PredictionRegistry — handler registration, lookup, completeness.
 */
import { describe, it, expect } from 'vitest';
import {
  PredictionRegistry,
  getDefaultPredictionRegistry,
  ALL_PREDICTION_PERSPECTIVES,
  PredictionValidationError,
} from '../../src/prediction/index.js';
import type {
  PerspectiveHandler,
  PredictionLog,
  PredictionModel,
  PredictionTask,
} from '../../src/prediction/index.js';

class StubHandler implements PerspectiveHandler {
  constructor(public readonly perspective: PredictionRegistry extends never ? never : any) {}
  fit(_task: PredictionTask, log: PredictionLog): PredictionModel {
    return {
      perspective: this.perspective,
      state: {},
      trainedOn: log.traces.length,
      fitDurationMs: 0,
    };
  }
  predict(): readonly never[] {
    return [];
  }
}

describe('PredictionRegistry', () => {
  it('default registry covers every canonical perspective', () => {
    const reg = new PredictionRegistry();
    expect(reg.isComplete()).toBe(true);
    for (const p of ALL_PREDICTION_PERSPECTIVES) {
      expect(reg.has(p)).toBe(true);
      expect(reg.get(p).perspective).toBe(p);
    }
  });

  it('list() returns sorted perspectives', () => {
    const reg = new PredictionRegistry();
    const list = reg.list();
    expect([...list]).toEqual([...list].sort());
    expect(list.length).toBe(ALL_PREDICTION_PERSPECTIVES.length);
  });

  it('throws PredictionValidationError on unknown perspective', () => {
    const reg = new PredictionRegistry([]);
    expect(reg.has('next_activity')).toBe(false);
    try {
      reg.get('next_activity');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PredictionValidationError);
      expect((err as PredictionValidationError).code).toBe('unknown_perspective');
    }
  });

  it('register() allows handler injection (mock-friendly)', () => {
    const reg = new PredictionRegistry([]);
    const stub = new StubHandler('next_activity' as any);
    reg.register(stub);
    expect(reg.get('next_activity')).toBe(stub);
  });

  it('register() overrides previous handler for same perspective', () => {
    const reg = new PredictionRegistry();
    const stub = new StubHandler('drift' as any);
    reg.register(stub);
    expect(reg.get('drift')).toBe(stub);
  });

  it('default singleton is reused across calls', () => {
    const a = getDefaultPredictionRegistry();
    const b = getDefaultPredictionRegistry();
    expect(a).toBe(b);
  });

  it('isComplete returns false when a perspective is missing', () => {
    const partial = PredictionRegistry.defaultHandlers().slice(0, 3);
    const reg = new PredictionRegistry(partial);
    expect(reg.isComplete()).toBe(false);
  });
});
