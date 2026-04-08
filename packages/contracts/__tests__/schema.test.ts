/**
 * Schema validation tests — type guards and JSON schemas
 */
import { describe, it, expect } from 'vitest';
import {
  isTypedError,
  createTypedError,
  resolveErrorCode,
  TYPED_ERROR_CODES,
  TYPED_ERROR_JSON_SCHEMA,
  type TypedError,
  type ErrorCode,
} from '../src/errors';
import { isReceipt, RECEIPT_JSON_SCHEMA, type Receipt } from '../src/receipt';
import { isPlan, validatePlanDAG, PLAN_JSON_SCHEMA, type Plan, type PlanNode } from '../src/plan';
import { isStatus, isLifecycleState, isValidTransition, STATUS_JSON_SCHEMA, LIFECYCLE_STATES, STATE_TRANSITIONS, type Status } from '../src/status';
import { isExplainSnapshot, EXPLAIN_JSON_SCHEMA } from '../src/explain';

// Helpers
const makeNode = (id: string, kind: 'source' | 'algorithm' | 'sink'): PlanNode => ({
  id, kind, label: `Node ${id}`, config: {}, version: '1.0.0',
});

const VALID_HASH = 'a'.repeat(64);

const validReceipt: Receipt = {
  run_id: '550e8400-e29b-41d4-a716-446655440000',
  schema_version: '1.0',
  config_hash: VALID_HASH,
  input_hash: VALID_HASH,
  plan_hash: VALID_HASH,
  output_hash: VALID_HASH,
  start_time: '2026-04-04T00:00:00Z',
  end_time: '2026-04-04T00:01:00Z',
  duration_ms: 60000,
  status: 'success',
  summary: { traces_processed: 100, objects_processed: 50, variants_discovered: 10 },
  algorithm: { name: 'alpha', version: '1.0.0', parameters: {} },
  model: { nodes: 5, edges: 7 },
};

const validPlan: Plan = {
  schema_version: '1.0',
  plan_id: 'plan-001',
  created_at: '2026-04-04T00:00:00Z',
  nodes: [
    makeNode('src-1', 'source'),
    makeNode('algo-1', 'algorithm'),
    makeNode('sink-1', 'sink'),
  ],
  edges: [
    { from: 'src-1', to: 'algo-1' },
    { from: 'algo-1', to: 'sink-1' },
  ],
  metadata: { planner: 'default', planner_version: '1.0.0' },
};

const validStatus: Status = {
  schema_version: '1.0',
  state: 'ready',
  timestamp: '2026-04-04T00:00:00Z',
  last_transition: '2026-04-04T00:00:00Z',
  previous_state: 'bootstrapping',
  transition_count: 2,
  run_id: null,
  uptime_ms: 5000,
};

describe('TypedError schema', () => {
  it('createTypedError creates valid TypedError', () => {
    const err = createTypedError('CONFIG_INVALID', 'Bad config', { file: 'pictl.toml' });
    expect(isTypedError(err)).toBe(true);
    expect(err.schema_version).toBe('1.0');
    expect(err.code).toBe(TYPED_ERROR_CODES.CONFIG_INVALID);
    expect(err.code).toBe(10);
    expect(err.message).toBe('Bad config');
    expect(err.context).toEqual({ file: 'pictl.toml' });
  });

  it('all error codes map to 0-255 range', () => {
    for (const [code, num] of Object.entries(TYPED_ERROR_CODES)) {
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(255);
    }
  });

  it('resolveErrorCode round-trips correctly', () => {
    const codes: ErrorCode[] = [
      'CONFIG_INVALID', 'CONFIG_MISSING',
      'SOURCE_NOT_FOUND', 'SOURCE_INVALID', 'SOURCE_PERMISSION',
      'ALGORITHM_FAILED', 'ALGORITHM_NOT_FOUND',
      'WASM_INIT_FAILED', 'WASM_MEMORY_EXCEEDED',
      'SINK_FAILED', 'SINK_PERMISSION',
      'OTEL_FAILED',
    ];
    for (const code of codes) {
      const typed = createTypedError(code, 'test');
      expect(resolveErrorCode(typed)).toBe(code);
    }
  });

  it('isTypedError rejects invalid objects', () => {
    expect(isTypedError(null)).toBe(false);
    expect(isTypedError({})).toBe(false);
    expect(isTypedError({ code: 300, message: 'out of range' })).toBe(false);
    expect(isTypedError({ schema_version: '1.0', code: 300, message: 'x', remediation: 'y', context: {} })).toBe(false);
  });

  it('JSON schema has required structure', () => {
    expect(TYPED_ERROR_JSON_SCHEMA.$id).toContain('typed-error');
    expect(TYPED_ERROR_JSON_SCHEMA.required).toContain('code');
    expect(TYPED_ERROR_JSON_SCHEMA.required).toContain('message');
    expect(TYPED_ERROR_JSON_SCHEMA.required).toContain('remediation');
    expect(TYPED_ERROR_JSON_SCHEMA.required).toContain('context');
    expect(TYPED_ERROR_JSON_SCHEMA.properties.code.maximum).toBe(255);
  });
});

describe('Receipt schema', () => {
  it('isReceipt validates a correct receipt', () => {
    expect(isReceipt(validReceipt)).toBe(true);
  });

  it('isReceipt requires output_hash', () => {
    const { output_hash, ...noOutput } = validReceipt;
    expect(isReceipt(noOutput)).toBe(false);
  });

  it('isReceipt rejects invalid objects', () => {
    expect(isReceipt(null)).toBe(false);
    expect(isReceipt({})).toBe(false);
    expect(isReceipt({ ...validReceipt, status: 'unknown' })).toBe(false);
  });

  it('JSON schema has required fields', () => {
    expect(RECEIPT_JSON_SCHEMA.required).toContain('output_hash');
    expect(RECEIPT_JSON_SCHEMA.required).toContain('config_hash');
    expect(RECEIPT_JSON_SCHEMA.required).toContain('input_hash');
    expect(RECEIPT_JSON_SCHEMA.required).toContain('plan_hash');
    expect(RECEIPT_JSON_SCHEMA.properties.output_hash.pattern).toBe('^[0-9a-f]{64}$');
  });
});

describe('Plan schema', () => {
  it('isPlan validates a correct plan', () => {
    expect(isPlan(validPlan)).toBe(true);
  });

  it('isPlan rejects invalid objects', () => {
    expect(isPlan(null)).toBe(false);
    expect(isPlan({})).toBe(false);
    expect(isPlan({ ...validPlan, schema_version: '2.0' })).toBe(false);
  });

  it('validatePlanDAG accepts valid DAG', () => {
    const errors = validatePlanDAG(validPlan);
    expect(errors).toEqual([]);
  });

  it('validatePlanDAG detects cycles', () => {
    const cyclic: Plan = {
      ...validPlan,
      edges: [
        { from: 'src-1', to: 'algo-1' },
        { from: 'algo-1', to: 'sink-1' },
        { from: 'sink-1', to: 'src-1' },
      ],
    };
    const errors = validatePlanDAG(cyclic);
    expect(errors).toContain('Plan contains a cycle');
  });

  it('validatePlanDAG detects missing source node', () => {
    const noSource: Plan = {
      ...validPlan,
      nodes: [makeNode('algo-1', 'algorithm'), makeNode('sink-1', 'sink')],
      edges: [{ from: 'algo-1', to: 'sink-1' }],
    };
    const errors = validatePlanDAG(noSource);
    expect(errors).toContain('Plan must contain at least one source node');
  });

  it('validatePlanDAG detects missing sink node', () => {
    const noSink: Plan = {
      ...validPlan,
      nodes: [makeNode('src-1', 'source'), makeNode('algo-1', 'algorithm')],
      edges: [{ from: 'src-1', to: 'algo-1' }],
    };
    const errors = validatePlanDAG(noSink);
    expect(errors).toContain('Plan must contain at least one sink node');
  });

  it('validatePlanDAG detects self-loops', () => {
    const selfLoop: Plan = {
      ...validPlan,
      edges: [
        ...validPlan.edges,
        { from: 'algo-1', to: 'algo-1' },
      ],
    };
    const errors = validatePlanDAG(selfLoop);
    expect(errors).toContain('Self-loop detected on node: algo-1');
  });

  it('validatePlanDAG detects unknown node references', () => {
    const badRef: Plan = {
      ...validPlan,
      edges: [
        { from: 'src-1', to: 'algo-1' },
        { from: 'algo-1', to: 'nonexistent' },
      ],
    };
    const errors = validatePlanDAG(badRef);
    expect(errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('JSON schema has required structure', () => {
    expect(PLAN_JSON_SCHEMA.$id).toContain('plan');
    expect(PLAN_JSON_SCHEMA.required).toContain('nodes');
    expect(PLAN_JSON_SCHEMA.required).toContain('edges');
  });
});

describe('Status schema', () => {
  it('isStatus validates a correct status', () => {
    expect(isStatus(validStatus)).toBe(true);
  });

  it('isStatus rejects invalid objects', () => {
    expect(isStatus(null)).toBe(false);
    expect(isStatus({})).toBe(false);
    expect(isStatus({ ...validStatus, state: 'invalid_state' })).toBe(false);
  });

  it('isLifecycleState validates all lifecycle states', () => {
    for (const state of LIFECYCLE_STATES) {
      expect(isLifecycleState(state)).toBe(true);
    }
    expect(isLifecycleState('bogus')).toBe(false);
  });

  it('LIFECYCLE_STATES contains all 8 required states', () => {
    const required = [
      'uninitialized', 'bootstrapping', 'ready', 'planning',
      'running', 'watching', 'degraded', 'failed',
    ];
    for (const state of required) {
      expect(LIFECYCLE_STATES).toContain(state);
    }
    expect(LIFECYCLE_STATES).toHaveLength(8);
  });

  it('isValidTransition allows valid transitions', () => {
    expect(isValidTransition('uninitialized', 'bootstrapping')).toBe(true);
    expect(isValidTransition('bootstrapping', 'ready')).toBe(true);
    expect(isValidTransition('ready', 'planning')).toBe(true);
    expect(isValidTransition('planning', 'running')).toBe(true);
    expect(isValidTransition('running', 'ready')).toBe(true);
    expect(isValidTransition('failed', 'uninitialized')).toBe(true);
  });

  it('isValidTransition rejects invalid transitions', () => {
    expect(isValidTransition('uninitialized', 'running')).toBe(false);
    expect(isValidTransition('ready', 'bootstrapping')).toBe(false);
    expect(isValidTransition('planning', 'watching')).toBe(false);
  });

  it('every state has at least one outgoing transition', () => {
    for (const state of LIFECYCLE_STATES) {
      expect(STATE_TRANSITIONS[state].length).toBeGreaterThan(0);
    }
  });

  it('JSON schema has required structure', () => {
    expect(STATUS_JSON_SCHEMA.$id).toContain('status');
    expect(STATUS_JSON_SCHEMA.required).toContain('state');
    expect(STATUS_JSON_SCHEMA.properties.state.enum).toEqual([...LIFECYCLE_STATES]);
  });
});

describe('ExplainSnapshot schema', () => {
  it('isExplainSnapshot validates a correct snapshot', () => {
    const snapshot = {
      schema_version: '1.0',
      receipt: validReceipt,
      plan: validPlan,
      status: validStatus,
      execution_profile: {
        phases: [{ phase: 'discovery', start: '2026-04-04T00:00:00Z', end: '2026-04-04T00:00:01Z', duration_ms: 1000 }],
        resources: { peak_memory_bytes: 1024, events_processed: 100, algorithm_invocations: 1 },
        total_duration_ms: 1000,
      },
      output_hash: VALID_HASH,
      captured_at: '2026-04-04T00:01:00Z',
      environment: { platform: 'node', runtime_version: '20.0.0', package_version: '0.5.4' },
    };
    expect(isExplainSnapshot(snapshot)).toBe(true);
  });

  it('isExplainSnapshot rejects missing fields', () => {
    expect(isExplainSnapshot(null)).toBe(false);
    expect(isExplainSnapshot({})).toBe(false);
    expect(isExplainSnapshot({ schema_version: '1.0' })).toBe(false);
  });

  it('JSON schema has required structure', () => {
    expect(EXPLAIN_JSON_SCHEMA.$id).toContain('explain');
    expect(EXPLAIN_JSON_SCHEMA.required).toContain('receipt');
    expect(EXPLAIN_JSON_SCHEMA.required).toContain('plan');
    expect(EXPLAIN_JSON_SCHEMA.required).toContain('status');
    expect(EXPLAIN_JSON_SCHEMA.required).toContain('execution_profile');
    expect(EXPLAIN_JSON_SCHEMA.required).toContain('output_hash');
  });
});
