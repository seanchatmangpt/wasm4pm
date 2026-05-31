/**
 * Domain-contract tests for span factories and Instrumentation class.
 *
 * All contracts are derived from the source API (spans.ts, instrumentation.ts,
 * fields.ts) and from the observability doctrine (PRD §18.2-3). Expected values
 * are never copied from the implementation; instead they are derived from the
 * following oracles:
 *
 *   Rank 1 — Mathematical: span names follow `<phase>.<operation>` dot notation
 *   Rank 2 — Domain contract: Instrumentation events carry required OTEL fields
 *   Rank 3 — Metamorphic: same input → same output (determinism)
 */

import { describe, it, expect } from 'vitest';
import {
  AnalysisSpans,
  BootstrapSpans,
  RunningSpans,
  WatchingSpans,
  LawfulDispatchSpans,
} from '../spans.js';
import { Instrumentation } from '../instrumentation.js';
import {
  REQUIRED_FIELD_NAMES,
  createRequiredFields,
  validateRequiredFields,
} from '../fields.js';
import type { RequiredOtelAttributes } from '../types.js';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

function makeRequiredAttrs(): RequiredOtelAttributes {
  return {
    'run.id': 'test-run-id-001',
    'config.hash': 'aabbcc0011223344aabbcc0011223344aabbcc0011223344aabbcc0011223344',
    'input.hash': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'plan.hash': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'execution.profile': 'balanced',
    'source.kind': 'xes',
    'sink.kind': 'dfg',
  };
}

const TRACE_ID = 'aabbccddeeff00112233445566778899';

// ---------------------------------------------------------------------------
// Section 1: AnalysisSpans factory contract tests (12 tests)
// ---------------------------------------------------------------------------

describe('AnalysisSpans — span factory contracts', () => {
  it('compareStart(n) returns a non-empty string', () => {
    const name = AnalysisSpans.compareStart(3);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('compareStart(3) embeds the algo count in the span name', () => {
    const name = AnalysisSpans.compareStart(3);
    // Span template: `analysis.compare.start.3_algos`
    expect(name).toMatch(/3/);
    expect(name).toMatch(/algos/);
  });

  it('compareEnd() returns a non-empty string', () => {
    const name = AnalysisSpans.compareEnd();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('qualityCheck("dfg") contains "dfg" in the span name', () => {
    const name = AnalysisSpans.qualityCheck('dfg');
    expect(name).toContain('dfg');
  });

  it('diffCompute() returns a non-empty string', () => {
    const name = AnalysisSpans.diffCompute();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });

  it('all AnalysisSpans values return strings', () => {
    const results = [
      AnalysisSpans.compareStart(1),
      AnalysisSpans.compareEnd(),
      AnalysisSpans.qualityCheck('ilp'),
      AnalysisSpans.diffCompute(),
    ];
    for (const r of results) {
      expect(typeof r).toBe('string');
    }
  });

  it('span names do not contain spaces (dot/underscore notation only)', () => {
    const names = [
      AnalysisSpans.compareStart(5),
      AnalysisSpans.compareEnd(),
      AnalysisSpans.qualityCheck('heuristic'),
      AnalysisSpans.diffCompute(),
    ];
    for (const name of names) {
      expect(name).not.toMatch(/ /);
    }
  });

  it('compareStart(0) is still non-empty (zero-algo edge case)', () => {
    const name = AnalysisSpans.compareStart(0);
    expect(name.length).toBeGreaterThan(0);
  });

  it('span factories are deterministic — same args produce same result', () => {
    expect(AnalysisSpans.compareStart(7)).toBe(AnalysisSpans.compareStart(7));
    expect(AnalysisSpans.compareEnd()).toBe(AnalysisSpans.compareEnd());
    expect(AnalysisSpans.qualityCheck('genetic')).toBe(AnalysisSpans.qualityCheck('genetic'));
    expect(AnalysisSpans.diffCompute()).toBe(AnalysisSpans.diffCompute());
  });

  it('AnalysisSpans has exactly the 5 declared methods', () => {
    const keys = Object.keys(AnalysisSpans);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('compareStart');
    expect(keys).toContain('compareEnd');
    expect(keys).toContain('compareAlgo');
    expect(keys).toContain('qualityCheck');
    expect(keys).toContain('diffCompute');
  });

  it('qualityCheck embeds the algorithm name verbatim', () => {
    const algo = 'alpha_plus_plus';
    const name = AnalysisSpans.qualityCheck(algo);
    expect(name).toContain(algo);
  });

  it('compareStart with different counts produces different names', () => {
    const n1 = AnalysisSpans.compareStart(2);
    const n2 = AnalysisSpans.compareStart(9);
    expect(n1).not.toBe(n2);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Other span factory contract tests (8 tests)
// ---------------------------------------------------------------------------

describe('BootstrapSpans — span factory contracts', () => {
  it('configLoad() returns a non-empty dot-notation string', () => {
    const name = BootstrapSpans.configLoad();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).toContain('.');
    expect(name).not.toMatch(/ /);
  });

  it('configValidation() returns a non-empty string that does not contain spaces', () => {
    const name = BootstrapSpans.configValidation();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toMatch(/ /);
  });
});

describe('RunningSpans — span factory contracts', () => {
  it('algorithmExec(alg) embeds the algorithm name in the span name', () => {
    const name = RunningSpans.algorithmExec('dfg');
    expect(name).toContain('dfg');
    expect(name).not.toMatch(/ /);
  });

  it('mlAnalysis(task) embeds the task name in the span name', () => {
    const name = RunningSpans.mlAnalysis('cluster');
    expect(name).toContain('cluster');
    expect(name).not.toMatch(/ /);
  });

  it('all RunningSpans string factories are deterministic', () => {
    expect(RunningSpans.runStart()).toBe(RunningSpans.runStart());
    expect(RunningSpans.sourceRead()).toBe(RunningSpans.sourceRead());
    expect(RunningSpans.sinkWrite()).toBe(RunningSpans.sinkWrite());
    expect(RunningSpans.runEnd()).toBe(RunningSpans.runEnd());
  });
});

describe('WatchingSpans — span factory contracts', () => {
  it('heartbeat() returns a non-empty string without spaces', () => {
    const name = WatchingSpans.heartbeat();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toMatch(/ /);
  });

  it('checkpointSave and checkpointLoad are distinct span names', () => {
    expect(WatchingSpans.checkpointSave()).not.toBe(WatchingSpans.checkpointLoad());
  });
});

describe('LawfulDispatchSpans — span factory contracts', () => {
  it('perception() returns a non-empty string without spaces', () => {
    const name = LawfulDispatchSpans.perception();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toMatch(/ /);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Instrumentation class event factory tests (14 tests)
// ---------------------------------------------------------------------------

describe('Instrumentation.createStateChangeEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('returns an object with event and otelEvent keys', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'ready', 'running', attrs);
    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
  });

  it('event.runId matches run.id from requiredAttrs', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'ready', 'running', attrs);
    expect(result.event.runId).toBe(attrs['run.id']);
  });

  it('event.fromState and event.toState are preserved verbatim', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'degraded', 'bootstrapping', attrs);
    expect(result.event.fromState).toBe('degraded');
    expect(result.event.toState).toBe('bootstrapping');
  });

  it('otelEvent.name uses engine.state_change span name', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'ready', 'planning', attrs);
    expect(result.otelEvent.name).toBe('engine.state_change');
  });

  it('otelEvent.attributes contains service.name = "wasm4pm"', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'ready', 'running', attrs);
    expect(result.otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('otelEvent.trace_id matches the provided traceId', () => {
    const result = Instrumentation.createStateChangeEvent(TRACE_ID, 'failed', 'bootstrapping', attrs);
    expect(result.otelEvent.trace_id).toBe(TRACE_ID);
  });
});

describe('Instrumentation.createAlgorithmStartedEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('returns event with algorithmName matching the provided algorithm', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(TRACE_ID, 'dfg', attrs);
    expect(result.event.algorithmName).toBe('dfg');
  });

  it('otelEvent.name contains the algorithm name', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(TRACE_ID, 'ilp', attrs);
    expect(result.otelEvent.name).toContain('ilp');
  });

  it('does not throw for any valid algorithm name string', () => {
    const algos = ['dfg', 'heuristic_miner', 'alpha_plus_plus', 'genetic_algorithm', 'ilp'];
    for (const algo of algos) {
      expect(() =>
        Instrumentation.createAlgorithmStartedEvent(TRACE_ID, algo, attrs)
      ).not.toThrow();
    }
  });

  it('event.type is AlgorithmStarted', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(TRACE_ID, 'dfg', attrs);
    expect(result.event.type).toBe('AlgorithmStarted');
  });
});

describe('Instrumentation.createSourceStartedEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('event.operationType is "source"', () => {
    const result = Instrumentation.createSourceStartedEvent(TRACE_ID, 'xes', attrs);
    expect(result.event.operationType).toBe('source');
  });

  it('otelEvent.attributes["source.kind"] matches the provided kind', () => {
    const result = Instrumentation.createSourceStartedEvent(TRACE_ID, 'csv', attrs);
    expect(result.otelEvent.attributes['source.kind']).toBe('csv');
  });

  it('does not throw for common source kinds', () => {
    for (const kind of ['xes', 'csv', 'json', 'parquet']) {
      expect(() =>
        Instrumentation.createSourceStartedEvent(TRACE_ID, kind, attrs)
      ).not.toThrow();
    }
  });
});

describe('Instrumentation.createSinkStartedEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('event.operationType is "sink"', () => {
    const result = Instrumentation.createSinkStartedEvent(TRACE_ID, 'stdout', attrs);
    expect(result.event.operationType).toBe('sink');
  });

  it('does not throw for "json" or "human" format kinds', () => {
    expect(() =>
      Instrumentation.createSinkStartedEvent(TRACE_ID, 'json', attrs)
    ).not.toThrow();
    expect(() =>
      Instrumentation.createSinkStartedEvent(TRACE_ID, 'human', attrs)
    ).not.toThrow();
  });
});

describe('Instrumentation.createErrorEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('returns object including event, otelEvent, and jsonEvent', () => {
    const result = Instrumentation.createErrorEvent(TRACE_ID, 'ERR_001', 'test error', attrs);
    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
    expect(result).toHaveProperty('jsonEvent');
  });

  it('event.errorCode and event.errorMessage are preserved verbatim', () => {
    const result = Instrumentation.createErrorEvent(TRACE_ID, 'ERR_404', 'not found', attrs);
    expect(result.event.errorCode).toBe('ERR_404');
    expect(result.event.errorMessage).toBe('not found');
  });
});

describe('Instrumentation ID generators — contracts', () => {
  it('generateSpanId() returns a 16-character hex string', () => {
    const id = Instrumentation.generateSpanId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generateTraceId() returns a 32-character hex string', () => {
    const id = Instrumentation.generateTraceId();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('two consecutive generateSpanId() calls return different values (UUID entropy)', () => {
    const id1 = Instrumentation.generateSpanId();
    const id2 = Instrumentation.generateSpanId();
    // Statistically, two random 8-byte IDs collide with probability 2^-64
    expect(id1).not.toBe(id2);
  });

  it('two consecutive generateTraceId() calls return different values', () => {
    const id1 = Instrumentation.generateTraceId();
    const id2 = Instrumentation.generateTraceId();
    expect(id1).not.toBe(id2);
  });
});

describe('Instrumentation.extractTraceContext — contracts', () => {
  it('parses a valid W3C traceparent header correctly', () => {
    const header = `00-${TRACE_ID}-abcdef0123456789-01`;
    const ctx = Instrumentation.extractTraceContext(header);
    expect(ctx.traceId).toBe(TRACE_ID);
    expect(ctx.spanId).toBe('abcdef0123456789');
    expect(ctx.traceFlags).toBe('01');
  });

  it('returns empty object for undefined input', () => {
    const ctx = Instrumentation.extractTraceContext(undefined);
    expect(ctx).toEqual({});
  });

  it('returns empty object for malformed header (wrong part count)', () => {
    const ctx = Instrumentation.extractTraceContext('00-onlytwoparts');
    expect(ctx).toEqual({});
  });
});

describe('Instrumentation.createTraceContextHeader — contracts', () => {
  it('formats a valid W3C traceparent header', () => {
    const spanId = 'abcdef0123456789';
    const header = Instrumentation.createTraceContextHeader(TRACE_ID, spanId);
    expect(header).toBe(`00-${TRACE_ID}-${spanId}-01`);
  });

  it('uses trace-flags 00 when traceSampled is false', () => {
    const header = Instrumentation.createTraceContextHeader(TRACE_ID, 'a1b2c3d4e5f60718', false);
    expect(header).toMatch(/-00$/);
  });
});

// ---------------------------------------------------------------------------
// Section 4: fields.ts contract tests (8 tests)
// ---------------------------------------------------------------------------

describe('RequiredFields / REQUIRED_FIELD_NAMES — domain contracts', () => {
  it('REQUIRED_FIELD_NAMES is a non-empty array', () => {
    expect(Array.isArray(REQUIRED_FIELD_NAMES)).toBe(true);
    expect(REQUIRED_FIELD_NAMES.length).toBeGreaterThan(0);
  });

  it('field names use dot notation (no spaces)', () => {
    for (const name of REQUIRED_FIELD_NAMES) {
      expect(name).not.toMatch(/ /);
      expect(name).toContain('.');
    }
  });

  it('required fields include run.id, config.hash, and execution.profile', () => {
    const nameSet = new Set(REQUIRED_FIELD_NAMES);
    expect(nameSet.has('run.id')).toBe(true);
    expect(nameSet.has('config.hash')).toBe(true);
    expect(nameSet.has('execution.profile')).toBe(true);
  });

  it('required fields include source.kind and sink.kind', () => {
    const nameSet = new Set(REQUIRED_FIELD_NAMES);
    expect(nameSet.has('source.kind')).toBe(true);
    expect(nameSet.has('sink.kind')).toBe(true);
  });

  it('createRequiredFields() returns defaults for all required fields when no partial supplied', () => {
    const fields = createRequiredFields();
    for (const name of REQUIRED_FIELD_NAMES) {
      const val = fields[name];
      expect(val).toBeDefined();
      expect(typeof val).toBe('string');
      expect((val as string).length).toBeGreaterThan(0);
    }
  });

  it('createRequiredFields() preserves provided values verbatim', () => {
    const partial = {
      'run.id': 'my-custom-run',
      'execution.profile': 'quality',
    };
    const fields = createRequiredFields(partial);
    expect(fields['run.id']).toBe('my-custom-run');
    expect(fields['execution.profile']).toBe('quality');
  });

  it('validateRequiredFields() returns empty array for a fully populated attrs object', () => {
    const attrs: Record<string, unknown> = {
      'run.id': 'run-abc',
      'config.hash': 'hash1',
      'input.hash': 'hash2',
      'plan.hash': 'hash3',
      'execution.profile': 'fast',
      'source.kind': 'xes',
      'sink.kind': 'dfg',
    };
    const missing = validateRequiredFields(attrs);
    expect(missing).toHaveLength(0);
  });

  it('validateRequiredFields() reports missing fields when required keys are absent', () => {
    const attrs: Record<string, unknown> = {
      'run.id': 'run-abc',
      // missing all other required fields
    };
    const missing = validateRequiredFields(attrs);
    expect(missing.length).toBeGreaterThan(0);
    // Specifically, config.hash should be flagged
    expect(missing).toContain('config.hash');
  });
});

// ---------------------------------------------------------------------------
// Section 5: ML / RL instrumentation smoke tests (4 tests)
// ---------------------------------------------------------------------------

describe('Instrumentation.createMlAnalysisStartedEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('returns event and otelEvent', () => {
    const result = Instrumentation.createMlAnalysisStartedEvent(TRACE_ID, 'cluster', 'kmeans', attrs);
    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
  });

  it('otelEvent.name follows ml.<task> convention', () => {
    const result = Instrumentation.createMlAnalysisStartedEvent(TRACE_ID, 'anomaly', 'ema', attrs);
    expect(result.otelEvent.name).toBe('ml.anomaly');
  });
});

describe('Instrumentation.createRlAgentDecisionEvent — contracts', () => {
  const attrs = makeRequiredAttrs();

  it('otelEvent.name is rl.agent.decision', () => {
    const result = Instrumentation.createRlAgentDecisionEvent(
      TRACE_ID,
      {
        agentType: 'QLearning',
        agentId: 'agent-0',
        actionSelected: 1,
        stateHealthLevel: 0,
        stateCircuitState: 'Closed',
      },
      attrs
    );
    expect(result.otelEvent.name).toBe('rl.agent.decision');
  });

  it('event.agentType and event.actionSelected are preserved', () => {
    const result = Instrumentation.createRlAgentDecisionEvent(
      TRACE_ID,
      {
        agentType: 'SARSA',
        agentId: 'agent-1',
        actionSelected: 'recover',
        stateHealthLevel: 3,
        stateCircuitState: 'Open',
      },
      attrs
    );
    expect(result.event.agentType).toBe('SARSA');
    expect(result.event.actionSelected).toBe('recover');
  });
});
