import { describe, expect, it } from 'vitest';
import { defineNoun, defineVerb } from '../index.js';

describe('defineVerb', () => {
  it('defaults stability to stable', () => {
    const verb = defineVerb({
      noun: 'thing',
      verb: 'do',
      summary: 'Do the thing',
      handler: () => ({ ok: true }),
    });
    expect(verb.stability).toBe('stable');
    expect(verb.__kind).toBe('verb');
  });

  it('rejects invalid noun/verb identifiers', () => {
    expect(() =>
      defineVerb({ noun: 'Thing', verb: 'do', summary: 'x', handler: () => ({}) })
    ).toThrow(/Invalid noun name/);
    expect(() =>
      defineVerb({ noun: 'thing', verb: 'Do Thing', summary: 'x', handler: () => ({}) })
    ).toThrow(/Invalid verb name/);
  });

  it('rejects an empty summary', () => {
    expect(() => defineVerb({ noun: 'thing', verb: 'do', summary: '  ', handler: () => ({}) })).toThrow(
      /non-empty summary/
    );
  });

  it('rejects a reserved arg name', () => {
    expect(() =>
      defineVerb({
        noun: 'thing',
        verb: 'do',
        summary: 'x',
        args: { human: { type: 'boolean' } } as any,
        handler: () => ({}),
      })
    ).toThrow(/reserved by the framework/);
  });
});

describe('defineNoun', () => {
  it('folds a verb table and preserves order', () => {
    const a = defineVerb({ noun: 'thing', verb: 'a', summary: 'A', handler: () => 1 });
    const b = defineVerb({ noun: 'thing', verb: 'b', summary: 'B', handler: () => 2 });
    const noun = defineNoun({ name: 'thing', verbs: [a, b] });
    expect(noun.verbs.map((v) => v.verb)).toEqual(['a', 'b']);
    expect(noun.__kind).toBe('noun');
  });

  it('rejects a verb registered under the wrong noun', () => {
    const mismatched = defineVerb({ noun: 'other', verb: 'a', summary: 'A', handler: () => 1 });
    expect(() => defineNoun({ name: 'thing', verbs: [mismatched] })).toThrow(/declares noun 'other'/);
  });

  it('rejects duplicate verbs under the same noun', () => {
    const a1 = defineVerb({ noun: 'thing', verb: 'a', summary: 'A1', handler: () => 1 });
    const a2 = defineVerb({ noun: 'thing', verb: 'a', summary: 'A2', handler: () => 2 });
    expect(() => defineNoun({ name: 'thing', verbs: [a1, a2] })).toThrow(/Duplicate verb 'a'/);
  });
});
