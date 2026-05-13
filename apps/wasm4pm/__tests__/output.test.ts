import { describe, it, expect } from 'vitest';
import { HumanFormatter, JSONFormatter, getFormatter } from '../src/output.js';

describe('getFormatter', () => {
  it('returns JSONFormatter for "json", HumanFormatter for "human" and by default', () => {
    expect(getFormatter({ format: 'json' }) instanceof JSONFormatter).toBe(true);
    expect(getFormatter({ format: 'human' }) instanceof HumanFormatter).toBe(true);
    expect(getFormatter() instanceof HumanFormatter).toBe(true);
  });
});
