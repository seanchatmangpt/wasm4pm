import { describe, it, expect } from 'vitest';
import { queryCommand } from '../commands/query.js';

describe('queryCommand structure', () => {
  it('is a valid citty command with required meta fields', () => {
    expect(queryCommand).toBeDefined();
    expect(queryCommand.meta).toBeDefined();
    expect(queryCommand.meta?.name).toBe('query');
    expect(typeof queryCommand.meta?.description).toBe('string');
  });

  it('declares required ocel and query args', () => {
    const args = queryCommand.args as Record<string, { type: string; required?: boolean }>;
    expect(args).toBeDefined();
    expect(args['ocel']).toBeDefined();
    expect(args['ocel'].type).toBe('string');
    expect(args['ocel'].required).toBe(true);
    expect(args['query']).toBeDefined();
    expect(args['query'].type).toBe('string');
    expect(args['query'].required).toBe(true);
  });

  it('has a run function', () => {
    expect(typeof queryCommand.run).toBe('function');
  });
});
