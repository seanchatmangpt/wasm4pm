/**
 * `wpm compile` — Reasoning Compiler unit tests.
 *
 * Pure-unit coverage of the compile core (spec validation, registry
 * admission, topological ordering, BLAKE3 plan hash, exit-code mapping).
 * The real-WASM `--run` integration path is exercised by the Rust test
 * suite and the cognition FM-5 integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  compileSpec,
  CompileError,
  loadAdmittedBreeds,
  foldMetaFacts,
} from '../commands/compile.js';
import { EXIT_CODES } from '../exit-codes.js';

const ADMITTED = new Set([
  'mycin',
  'prolog',
  'meta_reasoning',
  'tableaux',
  'markov_logic',
]);

describe('wpm compile — compileSpec', () => {
  it('unknown breed → exit code 2 (source_error)', () => {
    const spec = { name: 'bad', stages: [{ breed: 'not_a_breed' }] };
    try {
      compileSpec(spec, ADMITTED);
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError);
      expect((e as CompileError).exitCode).toBe(EXIT_CODES.source_error);
      expect((e as CompileError).message).toContain('not_a_breed');
    }
  });

  it('malformed spec → exit code 1 (config_error)', () => {
    try {
      compileSpec({ stages: [] }, ADMITTED);
      expect.unreachable('must throw');
    } catch (e) {
      expect((e as CompileError).exitCode).toBe(EXIT_CODES.config_error);
    }
  });

  it('topologically orders wired stages (meta_reasoning last)', () => {
    const spec = {
      name: 'ensemble',
      stages: [
        {
          breed: 'meta_reasoning',
          wire: [
            { from: 'mycin', map: 'meta_facts' },
            { from: 'prolog', map: 'meta_facts' },
          ],
        },
        { breed: 'mycin', input: { facts: [] } },
        { breed: 'prolog', input: { facts: [] } },
      ],
    };
    const plan = compileSpec(spec, ADMITTED);
    expect(plan.order[plan.order.length - 1]).toBe('meta_reasoning');
    expect(plan.order).toHaveLength(3);
    expect(plan.plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan hash is deterministic and input-sensitive', () => {
    const spec = { name: 'p', stages: [{ breed: 'tableaux' }] };
    const a = compileSpec(spec, ADMITTED);
    const b = compileSpec(spec, ADMITTED);
    expect(a.plan_hash).toBe(b.plan_hash);
    const c = compileSpec({ name: 'p2', stages: [{ breed: 'tableaux' }] }, ADMITTED);
    expect(c.plan_hash).not.toBe(a.plan_hash);
  });

  it('wire from an unknown stage → exit 2', () => {
    const spec = {
      name: 'dangling',
      stages: [{ breed: 'meta_reasoning', wire: { from: 'ghost', map: 'meta_facts' } }],
    };
    try {
      compileSpec(spec, ADMITTED);
      expect.unreachable('must throw');
    } catch (e) {
      expect((e as CompileError).exitCode).toBe(EXIT_CODES.source_error);
    }
  });

  it('cycle in wires → exit 2', () => {
    const spec = {
      name: 'cycle',
      stages: [
        { breed: 'mycin', wire: { from: 'prolog', map: 'meta_facts' } },
        { breed: 'prolog', wire: { from: 'mycin', map: 'meta_facts' } },
      ],
    };
    try {
      compileSpec(spec, ADMITTED);
      expect.unreachable('must throw');
    } catch (e) {
      expect((e as CompileError).exitCode).toBe(EXIT_CODES.source_error);
      expect((e as CompileError).message).toContain('cycle');
    }
  });
});

describe('wpm compile — meta fact folding', () => {
  it('folds upstream selection into breed:<id>:conclusion/confidence facts', () => {
    const facts = foldMetaFacts('mycin', {
      output: { selected: 'therapy=gentamicin' },
    });
    expect(facts).toEqual([
      { key: 'breed:mycin:conclusion', value: 'therapy=gentamicin' },
      { key: 'breed:mycin:confidence', value: '0.9' },
    ]);
  });
});

describe('wpm compile — admitted registry', () => {
  it('loads a non-empty admitted set (registry or schema fallback)', () => {
    const admitted = loadAdmittedBreeds();
    expect(admitted.size).toBeGreaterThan(0);
    expect(admitted.has('mycin')).toBe(true);
  });
});
