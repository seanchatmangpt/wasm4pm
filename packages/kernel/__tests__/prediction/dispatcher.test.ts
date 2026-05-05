/**
 * Tests for PredictionDispatcher — validation gating, mode orchestration,
 * batch error isolation, diagnostic shape.
 */
import { describe, it, expect } from 'vitest';
import {
  PredictionDispatcher,
  PredictionRegistry,
  PredictionValidationError,
} from '../../src/prediction/index.js';
import type {
  PredictionLog,
  PredictionRequest,
  PredictionTrace,
} from '../../src/prediction/index.js';

function mkTrace(caseId: string, activities: string[], startMs = 0): PredictionTrace {
  return {
    caseId,
    events: activities.map((activity, i) => ({
      activity,
      timestamp: startMs + i * 1000,
      resource: i % 2 === 0 ? 'Alice' : 'Bob',
    })),
  };
}

const log: PredictionLog = {
  traces: [
    mkTrace('c1', ['A', 'B', 'C']),
    mkTrace('c2', ['A', 'B', 'D']),
    mkTrace('c3', ['A', 'C']),
  ],
};

describe('PredictionDispatcher.execute', () => {
  const dispatcher = new PredictionDispatcher();

  it('rejects an invalid perspective with PredictionValidationError', () => {
    const req = {
      mode: 'fit',
      task: { perspective: 'bogus' as any },
      log,
    } as unknown as PredictionRequest;
    expect(() => dispatcher.execute(req)).toThrow(PredictionValidationError);
  });

  it("'fit' mode trains and returns a model with no predictions", () => {
    const res = dispatcher.execute({
      mode: 'fit',
      task: { perspective: 'next_activity' },
      log,
    });
    expect(res.mode).toBe('fit');
    expect(res.predictions).toHaveLength(0);
    expect(res.model).toBeDefined();
    expect(res.model!.perspective).toBe('next_activity');
    expect(res.model!.trainedOn).toBe(3);
    expect(res.diagnostics.scored).toBe(0);
  });

  it("'fit_predict' mode trains and scores in one call", () => {
    const res = dispatcher.execute({
      mode: 'fit_predict',
      task: { perspective: 'next_activity', topK: 2 },
      log,
      prefixes: [mkTrace('p1', ['A'])],
    });
    expect(res.predictions).toHaveLength(1);
    expect(res.model).toBeDefined();
    expect(res.diagnostics.scored).toBe(1);
    const candidates = res.predictions[0].prediction.candidates as Array<{ activity: string }>;
    expect(candidates.length).toBe(2);
  });

  it("'predict' mode requires a model with matching perspective", () => {
    const fit = dispatcher.execute({
      mode: 'fit',
      task: { perspective: 'next_activity' },
      log,
    });
    expect(() =>
      dispatcher.execute({
        mode: 'predict',
        task: { perspective: 'drift' },
        prefixes: [mkTrace('p1', ['A'])],
        model: fit.model,
      }),
    ).toThrow(/model_mismatch/);
  });

  it('skips empty prefixes and reports them in diagnostics', () => {
    const res = dispatcher.execute({
      mode: 'fit_predict',
      task: { perspective: 'features' },
      log,
      prefixes: [mkTrace('p1', ['A']), { caseId: 'p2', events: [] }],
    });
    expect(res.diagnostics.scored).toBe(1);
    expect(res.diagnostics.skipped).toBe(1);
  });

  it("requires log for 'fit' and prefixes for 'predict'", () => {
    expect(() =>
      dispatcher.execute({ mode: 'fit', task: { perspective: 'drift' } } as PredictionRequest),
    ).toThrow(/missing_log/);
    expect(() =>
      dispatcher.execute({
        mode: 'predict',
        task: { perspective: 'drift' },
      } as PredictionRequest),
    ).toThrow(/missing_prefixes/);
  });

  it('rejects out-of-range parameters', () => {
    expect(() =>
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'next_activity', ngramOrder: 99 },
        log,
      }),
    ).toThrow(/param_out_of_range/);
    expect(() =>
      dispatcher.execute({
        mode: 'fit',
        task: { perspective: 'drift', ewmaAlpha: 5 },
        log,
      }),
    ).toThrow(/param_out_of_range/);
  });
});

describe('PredictionDispatcher.executeBatch', () => {
  it('isolates failures per request', () => {
    const dispatcher = new PredictionDispatcher();
    const reqs: PredictionRequest[] = [
      { mode: 'fit', task: { perspective: 'next_activity' }, log },
      { mode: 'fit', task: { perspective: 'bogus' as any }, log },
      { mode: 'fit', task: { perspective: 'drift' }, log },
    ];
    const results = dispatcher.executeBatch(reqs);
    expect(results).toHaveLength(3);
    expect(results[0].response).toBeDefined();
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBeInstanceOf(PredictionValidationError);
    expect(results[1].response).toBeUndefined();
    expect(results[2].response).toBeDefined();
  });

  it('honors a custom registry', () => {
    const reg = new PredictionRegistry(PredictionRegistry.defaultHandlers().slice(0, 1));
    const dispatcher = new PredictionDispatcher({ registry: reg });
    expect(() =>
      dispatcher.execute({ mode: 'fit', task: { perspective: 'drift' }, log }),
    ).toThrow(PredictionValidationError);
  });
});
