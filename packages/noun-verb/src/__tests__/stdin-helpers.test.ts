import { describe, expect, it } from 'vitest';
import { needsStdin, resolveStdinRefs, substituteStdinToken } from '../stdin.js';

describe('needsStdin', () => {
  it('is false when no token references stdin', () => {
    expect(needsStdin(['calc', 'add', '2', '3'])).toBe(false);
  });

  it('is true for a bare @- token', () => {
    expect(needsStdin(['calc', 'echo', '@-'])).toBe(true);
  });

  it('is true for an @-::path token', () => {
    expect(needsStdin(['calc', 'add', '@-::left', '10'])).toBe(true);
  });
});

describe('substituteStdinToken', () => {
  it('replaces a bare @- with the raw stdin content', () => {
    expect(substituteStdinToken('@-', 'hello world')).toBe('hello world');
  });

  it('leaves unrelated tokens untouched', () => {
    expect(substituteStdinToken('10', '{"left":5}')).toBe('10');
  });

  it('extracts a scalar field from JSON stdin via @-::path', () => {
    expect(substituteStdinToken('@-::left', '{"left":5,"right":10}')).toBe('5');
  });

  it('extracts a nested field via a dotted @-::path', () => {
    expect(substituteStdinToken('@-::model.path', '{"model":{"path":"/tmp/x.json"}}')).toBe('/tmp/x.json');
  });

  it('JSON-encodes a non-scalar extracted value', () => {
    expect(substituteStdinToken('@-::model', '{"model":{"path":"/tmp/x.json"}}')).toBe(
      JSON.stringify({ path: '/tmp/x.json' })
    );
  });

  it('throws a structured error when stdin is not valid JSON for @-::path', () => {
    expect(() => substituteStdinToken('@-::left', 'not json')).toThrow(/valid JSON/);
  });

  it('throws a structured error when the path is missing from stdin JSON', () => {
    expect(() => substituteStdinToken('@-::nope', '{"left":5}')).toThrow(/not found in stdin JSON/);
  });

  it('throws a structured error when the path segment is empty', () => {
    expect(() => substituteStdinToken('@-::', '{"left":5}')).toThrow(/missing a path/);
  });
});

describe('resolveStdinRefs', () => {
  it('reads stdin at most once, only when a token needs it', async () => {
    let reads = 0;
    const readStdin = async () => {
      reads += 1;
      return '{"left":5,"right":7}';
    };

    const resolved = await resolveStdinRefs(['calc', 'add', '@-::left', '@-::right'], readStdin);
    expect(resolved).toEqual(['calc', 'add', '5', '7']);
    expect(reads).toBe(1);
  });

  it('never calls readStdin when no token references stdin', async () => {
    let called = false;
    const readStdin = async () => {
      called = true;
      return '';
    };

    const resolved = await resolveStdinRefs(['calc', 'add', '2', '3'], readStdin);
    expect(resolved).toEqual(['calc', 'add', '2', '3']);
    expect(called).toBe(false);
  });

  it('returns a new array and never mutates the input', async () => {
    const input = Object.freeze(['calc', 'add', '2', '3']);
    const resolved = await resolveStdinRefs(input, async () => '');
    expect(resolved).not.toBe(input);
    expect(resolved).toEqual(input);
  });
});
