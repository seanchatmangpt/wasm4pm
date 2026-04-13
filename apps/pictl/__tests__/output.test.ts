import { describe, it, expect } from 'vitest';
import { HumanFormatter, JSONFormatter, getFormatter } from '../src/output.js';

describe('getFormatter', () => {
  it('should return JSONFormatter when format is json', () => {
    const formatter = getFormatter({ format: 'json' });
    expect(formatter instanceof JSONFormatter).toBe(true);
  });

  it('should return HumanFormatter for human format', () => {
    const formatter = getFormatter({ format: 'human' });
    expect(formatter instanceof HumanFormatter).toBe(true);
  });

  it('should return HumanFormatter by default', () => {
    const formatter = getFormatter();
    expect(formatter instanceof HumanFormatter).toBe(true);
  });
});
