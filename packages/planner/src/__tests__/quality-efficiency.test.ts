import { describe, it, expect } from 'vitest';
import { plan, type Config } from '../planner.js';

function makeConfig(profile: string, algo?: string): Config {
  return {
    version: '1.0',
    source: { format: 'xes' },
    execution: { profile, maxEvents: 1000 },
    algorithm: algo ? { name: algo } : undefined,
  };
}

describe('quality_efficiency on ExecutionPlan', () => {
  it('is non-negative for all profiles', () => {
    for (const profile of ['fast', 'balanced', 'quality']) {
      const p = plan(makeConfig(profile));
      expect(p.quality_efficiency).toBeGreaterThanOrEqual(0);
    }
  });

  it('is present and numeric on all alternatives', () => {
    const p = plan(makeConfig('balanced'));
    for (const alt of p.alternatives) {
      expect(typeof alt.quality_efficiency).toBe('number');
      expect(alt.quality_efficiency).toBeGreaterThanOrEqual(0);
    }
  });
});
