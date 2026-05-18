import { describe, it, expect } from 'vitest';
import {
  RefinementOrchestrator,
  initRefinementState,
  stepRefinement,
  serializeState,
  deserializeState,
} from '../refinement-orchestrator';

const BASE_CTX = {
  ocel_path: '/tmp/test.ocel',
  part_id: 'part-001',
  run_id: 'run-test-001',
  gap_activity_id: 'act:gap',
  current_precision: 0.5,
  current_fitness: 0.6,
  threshold: 0.95,
};

describe('RefinementOrchestrator — multi-pass refinement', () => {
  it('should orchestrate refinement passes', () => {
    const state = initRefinementState(BASE_CTX);
    expect(state.run_id).toBe(BASE_CTX.run_id);
    expect(state.attempts).toHaveLength(0);
    expect(state.andon_emitted).toBe(false);
    expect(state.current_variant).toBeDefined();

    const step1 = stepRefinement(state, BASE_CTX);
    expect(step1.action).toBeDefined();
    expect(step1.next_state.attempts.length).toBeGreaterThan(0);
  });

  it('should track refinement progress', () => {
    const state = initRefinementState(BASE_CTX);
    const json = serializeState(state);
    const restored = deserializeState(json);

    expect(restored.run_id).toBe(state.run_id);
    expect(restored.attempts).toHaveLength(0);
    expect(restored.andon_emitted).toBe(state.andon_emitted);
    expect(restored.current_variant).toBe(state.current_variant);
  });
});
