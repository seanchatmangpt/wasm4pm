/**
 * prolog8-compiler.ts — Unit tests for the Rule8 / Fact8 construction helpers.
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical theorem (output shape invariants, cap enforcement)
 *   Rank 2 — Domain contract (intern determinism, sentinel rules, body_mask formula)
 *   Rank 3 — Metamorphic relation (order sensitivity, round-trip JSON)
 *
 * No FM-5: no expected values are derived from the implementation under test.
 * All assertions use structural properties (length, invariants, inequalities).
 *
 * See: crates/prolog8/src/types.rs, catalog.rs, wasm.rs for the Rust ground truth.
 */

import { describe, it, expect } from 'vitest';
import {
  internTerms,
  buildFact8,
  buildRule8,
  buildFactBlock,
  buildCatalog,
  buildQueryAtom,
  TERM_SENTINEL,
  ARITY_CAP,
  BODY_CAP,
  FeatureBit,
  type TermInternTable,
  type Rule8Json,
  type Atom8Json,
} from '../prolog8-compiler.js';

// ── Group 1 — TermInternTable invariants (Rank 1 + 2) ────────────────────────

describe('Group 1 — internTerms: intern table invariants', () => {
  it('TermId 0 is sentinel and is never assigned to a label', () => {
    const table = internTerms(['alice', 'bob', 'carol']);
    for (const id of table.termByLabel.values()) {
      expect(id).not.toBe(TERM_SENTINEL);
      expect(id).toBeGreaterThan(0);
    }
  });

  it('first interned term receives TermId 1', () => {
    const table = internTerms(['run-001', '1.0', 'seeded']);
    expect(table.termByLabel.get('run-001')).toBe(1);
  });

  it('terms are assigned sequential IDs starting at 1', () => {
    const labels = ['a', 'b', 'c', 'd', 'e'];
    const table = internTerms(labels);
    labels.forEach((label, idx) => {
      expect(table.termByLabel.get(label)).toBe(idx + 1);
    });
  });

  it('duplicate labels receive the same ID (idempotent interning)', () => {
    const table = internTerms(['alice', 'bob', 'alice', 'carol', 'bob']);
    expect(table.termByLabel.get('alice')).toBe(table.termByLabel.get('alice'));
    expect(table.termByLabel.size).toBe(3); // only 3 unique labels
  });

  it('intern table is deterministic — same input → same IDs', () => {
    const labels = ['run-001', '1.0', 'seeded', 'bred', 'validated'];
    const t1 = internTerms(labels);
    const t2 = internTerms(labels);
    for (const label of labels) {
      expect(t1.termByLabel.get(label)).toBe(t2.termByLabel.get(label));
    }
  });

  it('inverse lookup (labelByTerm) is consistent with termByLabel', () => {
    const table = internTerms(['alice', 'bob', 'carol']);
    for (const [label, id] of table.termByLabel) {
      expect(table.labelByTerm.get(id)).toBe(label);
    }
    for (const [id, label] of table.labelByTerm) {
      expect(table.termByLabel.get(label)).toBe(id);
    }
  });

  it('order sensitivity — different insertion order → different IDs', () => {
    const t1 = internTerms(['alice', 'bob']);
    const t2 = internTerms(['bob', 'alice']);
    expect(t1.termByLabel.get('alice')).not.toBe(t2.termByLabel.get('alice'));
  });

  it('empty term list produces empty tables', () => {
    const table = internTerms([]);
    expect(table.termByLabel.size).toBe(0);
    expect(table.labelByTerm.size).toBe(0);
  });
});

// ── Group 2 — buildFact8 invariants (Rank 1 + 2) ─────────────────────────────

describe('Group 2 — buildFact8: unit clause construction', () => {
  it('buildFact8 produces a valid Rule8Json shape', () => {
    const table = internTerms(['run-001']);
    const runId = table.termByLabel.get('run-001')!;
    const fact = buildFact8(1, 1, [runId]);

    // rule_id and plan_id are present
    expect(fact).toHaveProperty('rule_id');
    expect(fact).toHaveProperty('plan_id');

    // head has the correct pred_id and arity
    expect(fact.head.pred_id).toBe(1);
    expect(fact.head.arity).toBe(1);

    // body is exactly 8 elements (BODY_CAP)
    expect(fact.body).toHaveLength(BODY_CAP);

    // body_len = 0 for a unit clause
    expect(fact.body_len).toBe(0);

    // body_mask = 0 when body_len = 0
    expect(fact.body_mask).toBe(0);
  });

  it('buildFact8 args array in head is exactly 8 elements', () => {
    const table = internTerms(['run-001']);
    const runId = table.termByLabel.get('run-001')!;
    const fact = buildFact8(1, 1, [runId]);
    expect(fact.head.args).toHaveLength(ARITY_CAP);
  });

  it('buildFact8 head binding_mask has all arity bits set (all ground)', () => {
    const table = internTerms(['run-001', '1.0']);
    const t1 = table.termByLabel.get('run-001')!;
    const t2 = table.termByLabel.get('1.0')!;
    const fact = buildFact8(3, 2, [t1, t2]);
    // Arity 2 → binding_mask = 0b11 = 3
    expect(fact.head.binding_mask).toBe(0b11);
  });

  it('buildFact8 head args beyond arity are sentinel (0)', () => {
    const table = internTerms(['run-001']);
    const t1 = table.termByLabel.get('run-001')!;
    const fact = buildFact8(1, 1, [t1]);
    // args[0] is the real term, positions 1-7 must be sentinel
    expect(fact.head.args[0]).toBe(t1);
    for (let i = 1; i < ARITY_CAP; i++) {
      expect(fact.head.args[i]).toBe(TERM_SENTINEL);
    }
  });

  it('buildFact8 throws if a sentinel (0) is passed as an argument', () => {
    // Facts must have all ground (non-sentinel) args
    expect(() => buildFact8(1, 1, [TERM_SENTINEL])).toThrow();
  });

  it('buildFact8 feature_mask includes Facts bit', () => {
    const table = internTerms(['x']);
    const x = table.termByLabel.get('x')!;
    const fact = buildFact8(1, 1, [x]);
    expect(fact.feature_mask & (1 << FeatureBit.Facts)).not.toBe(0);
  });

  it('buildFact8 var_count is 0 (no variables in a ground fact)', () => {
    const table = internTerms(['run-001']);
    const runId = table.termByLabel.get('run-001')!;
    const fact = buildFact8(1, 1, [runId]);
    expect(fact.var_count).toBe(0);
  });

  it('buildFact8 accepts a custom ruleId', () => {
    const table = internTerms(['x']);
    const x = table.termByLabel.get('x')!;
    const fact = buildFact8(1, 1, [x], 42);
    expect(fact.rule_id[0]).toBe(42);
  });

  it('round-trip: buildFact8 output serialises and parses without loss', () => {
    const table = internTerms(['run-001', '1.0']);
    const t1 = table.termByLabel.get('run-001')!;
    const t2 = table.termByLabel.get('1.0')!;
    const fact = buildFact8(3, 2, [t1, t2], 5);
    const json = JSON.stringify(fact);
    const parsed = JSON.parse(json) as Rule8Json;
    expect(parsed.head.pred_id).toBe(3);
    expect(parsed.head.arity).toBe(2);
    expect(parsed.head.args[0]).toBe(t1);
    expect(parsed.head.args[1]).toBe(t2);
    expect(parsed.body_len).toBe(0);
    expect(parsed.rule_id[0]).toBe(5);
  });
});

// ── Group 3 — buildRule8 invariants (Rank 1 + 2) ─────────────────────────────

describe('Group 3 — buildRule8: Horn rule construction', () => {
  it('buildRule8 with two body atoms produces body_len = 2', () => {
    // admitted(X) :- receipt(X), conformance(X, "1.0")
    // X = variable → TermId 0 (sentinel)
    // "1.0" = TermId 2 (ground)
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [TERM_SENTINEL] },          // head: admitted(X)
      [
        { predId: 1, arity: 1, args: [TERM_SENTINEL] },         // receipt(X)
        { predId: 3, arity: 2, args: [TERM_SENTINEL, 2],        // conformance(X, 1.0)
          bindingMask: 0b10 },
      ],
      { ruleId: 1, varCount: 2, varLiveMask: 0b01 }
    );
    expect(rule.body_len).toBe(2);
  });

  it('buildRule8 body array is always exactly 8 elements (BODY_CAP)', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [TERM_SENTINEL] },
      [{ predId: 1, arity: 1, args: [TERM_SENTINEL] }],
    );
    expect(rule.body).toHaveLength(BODY_CAP);
  });

  it('buildRule8 body_mask = (1 << body_len) - 1', () => {
    // 1 body atom → body_mask = 0b1 = 1
    const rule1 = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }],
    );
    expect(rule1.body_mask).toBe(1); // (1 << 1) - 1

    // 3 body atoms → body_mask = 0b111 = 7
    const rule3 = buildRule8(
      { predId: 4, arity: 1, args: [0] },
      [
        { predId: 1, arity: 1, args: [0] },
        { predId: 2, arity: 1, args: [0] },
        { predId: 3, arity: 1, args: [0] },
      ],
    );
    expect(rule3.body_mask).toBe(7); // (1 << 3) - 1
  });

  it('buildRule8 body atoms beyond body_len are sentinel atoms', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }], // only 1 significant body atom
    );
    // Positions 1–7 should be sentinel atoms (arity=0)
    for (let i = 1; i < BODY_CAP; i++) {
      expect(rule.body[i].arity).toBe(0);
    }
  });

  it('buildRule8 head args array is exactly 8 elements', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }],
    );
    expect(rule.head.args).toHaveLength(ARITY_CAP);
  });

  it('buildRule8 default feature_mask includes Facts and HornRules bits', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }],
    );
    expect(rule.feature_mask & (1 << FeatureBit.Facts)).not.toBe(0);
    expect(rule.feature_mask & (1 << FeatureBit.HornRules)).not.toBe(0);
  });

  it('buildRule8 throws when body exceeds BODY_CAP (9 atoms)', () => {
    const bodyAtoms = Array.from({ length: 9 }, (_, i) => ({
      predId: 1, arity: 1, args: [0],
    }));
    expect(() =>
      buildRule8({ predId: 2, arity: 1, args: [0] }, bodyAtoms)
    ).toThrow();
  });

  it('buildRule8 throws when arity exceeds ARITY_CAP (9)', () => {
    expect(() =>
      buildRule8(
        { predId: 2, arity: 9, args: Array(9).fill(1) },
        [],
      )
    ).toThrow();
  });

  it('buildRule8 with negation_mask auto-adds StratifiedNegation to feature_mask', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }],
      { negationMask: 0b1 },
    );
    expect(rule.feature_mask & (1 << FeatureBit.StratifiedNegation)).not.toBe(0);
  });

  it('buildRule8 var_count and varLiveMask round-trip correctly', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [{ predId: 1, arity: 1, args: [0] }],
      { varCount: 1, varLiveMask: 0b01 }
    );
    expect(rule.var_count).toBe(1);
    expect(rule.var_live_mask).toBe(0b01);
  });

  it('buildRule8 produces JSON that parses without loss', () => {
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [0] },
      [
        { predId: 1, arity: 1, args: [0] },
        { predId: 3, arity: 2, args: [0, 2], bindingMask: 0b10 },
      ],
      { ruleId: 7, varCount: 2, varLiveMask: 0b01 }
    );
    const parsed = JSON.parse(JSON.stringify(rule)) as Rule8Json;
    expect(parsed.rule_id[0]).toBe(7);
    expect(parsed.body_len).toBe(2);
    expect(parsed.body_mask).toBe(0b11);
    expect(parsed.head.pred_id).toBe(2);
    expect(parsed.body[0].pred_id).toBe(1);
    expect(parsed.body[1].pred_id).toBe(3);
    expect(parsed.body[1].binding_mask).toBe(0b10);
  });

  it('empty body buildRule8 produces body_mask = 0 and body_len = 0', () => {
    const table = internTerms(['run-001']);
    const runId = table.termByLabel.get('run-001')!;
    // Unit clause (ground): admitted(run-001)
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [runId], bindingMask: 0b1 },
      [],
      { featureMask: 1 << FeatureBit.Facts }
    );
    expect(rule.body_len).toBe(0);
    expect(rule.body_mask).toBe(0);
  });
});

// ── Group 4 — buildFactBlock invariants (Rank 1 + 2) ─────────────────────────

describe('Group 4 — buildFactBlock: fact block construction', () => {
  it('buildFactBlock produces correct pred_id and arity', () => {
    const block = buildFactBlock(1, 1, [[1], [2], [3]]);
    expect(block.pred_id).toBe(1);
    expect(block.arity).toBe(1);
  });

  it('buildFactBlock row count matches input', () => {
    const block = buildFactBlock(4, 2, [[1, 3], [1, 4], [1, 5]]);
    expect(block.rows).toHaveLength(3);
  });

  it('buildFactBlock each row has correct pred_id, arity, and args', () => {
    const block = buildFactBlock(3, 2, [[1, 2]]);
    expect(block.rows[0].pred_id).toBe(3);
    expect(block.rows[0].arity).toBe(2);
    expect(block.rows[0].args).toEqual([1, 2]);
  });

  it('buildFactBlock throws when a row has wrong number of args', () => {
    expect(() => buildFactBlock(1, 2, [[1]])).toThrow(); // need 2 args, got 1
  });

  it('buildFactBlock throws when a sentinel arg is used in a fact row', () => {
    expect(() => buildFactBlock(1, 1, [[TERM_SENTINEL]])).toThrow();
  });

  it('buildFactBlock source_id defaults to 0', () => {
    const block = buildFactBlock(1, 1, [[1]]);
    expect(block.rows[0].source_id).toBe(0);
  });

  it('buildFactBlock accepts custom sourceId', () => {
    const block = buildFactBlock(1, 1, [[1]], 99);
    expect(block.rows[0].source_id).toBe(99);
  });

  it('buildFactBlock round-trip: serialise + parse without loss', () => {
    const block = buildFactBlock(4, 2, [[1, 3], [1, 4]]);
    const parsed = JSON.parse(JSON.stringify(block));
    expect(parsed.pred_id).toBe(4);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].args).toEqual([1, 3]);
    expect(parsed.rows[1].args).toEqual([1, 4]);
  });
});

// ── Group 5 — buildCatalog invariants (Rank 1 + 2) ───────────────────────────

describe('Group 5 — buildCatalog: catalog construction', () => {
  it('buildCatalog produces catalog_id correctly', () => {
    const table = internTerms(['run-001']);
    const cat = buildCatalog(42, [{ predId: 1, label: 'receipt', arity: 1 }], table);
    expect(cat.catalog_id).toBe(42);
  });

  it('buildCatalog predicates map key is predId as string', () => {
    const table = internTerms([]);
    const cat = buildCatalog(1, [
      { predId: 1, label: 'receipt', arity: 1 },
      { predId: 2, label: 'admitted', arity: 1 },
    ], table);
    expect(cat.predicates['1']).toBeDefined();
    expect(cat.predicates['2']).toBeDefined();
  });

  it('buildCatalog predicate_by_label is correctly populated', () => {
    const table = internTerms([]);
    const cat = buildCatalog(1, [
      { predId: 1, label: 'receipt', arity: 1 },
      { predId: 3, label: 'conformance', arity: 2 },
    ], table);
    expect(cat.predicate_by_label['receipt']).toBe(1);
    expect(cat.predicate_by_label['conformance']).toBe(3);
  });

  it('buildCatalog term_labels and term_by_label are consistent', () => {
    const table = internTerms(['run-001', '1.0', 'seeded']);
    const cat = buildCatalog(1, [{ predId: 1, label: 'p', arity: 1 }], table);
    // Every entry in term_by_label should have a matching term_labels entry
    for (const [label, id] of Object.entries(cat.term_by_label)) {
      expect(cat.term_labels[String(id)]).toBe(label);
    }
  });

  it('buildCatalog throws when arity exceeds ARITY_CAP', () => {
    const table = internTerms([]);
    expect(() =>
      buildCatalog(1, [{ predId: 1, label: 'fat', arity: 9 }], table)
    ).toThrow();
  });

  it('buildCatalog proof_policy defaults to OnRequest', () => {
    const table = internTerms([]);
    const cat = buildCatalog(1, [{ predId: 1, label: 'p', arity: 1 }], table);
    expect(cat.predicates['1'].proof_policy).toBe('OnRequest');
  });

  it('buildCatalog round-trip: serialise + parse is JSON-safe', () => {
    const table = internTerms(['run-001', '1.0']);
    const cat = buildCatalog(
      42,
      [
        { predId: 1, label: 'receipt', arity: 1 },
        { predId: 3, label: 'conformance', arity: 2 },
      ],
      table,
    );
    const parsed = JSON.parse(JSON.stringify(cat));
    expect(parsed.catalog_id).toBe(42);
    expect(parsed.predicates['1'].label).toBe('receipt');
    expect(parsed.term_by_label['run-001']).toBe(1);
    expect(parsed.term_labels['1']).toBe('run-001');
  });
});

// ── Group 6 — buildQueryAtom invariants (Rank 1) ─────────────────────────────

describe('Group 6 — buildQueryAtom: query construction', () => {
  it('buildQueryAtom produces correct structure', () => {
    const q = buildQueryAtom(1, 1, [1], 1, 0);
    expect(q.atom.pred_id).toBe(1);
    expect(q.atom.arity).toBe(1);
    expect(q.atom.args[0]).toBe(1);
    expect(q.binding_mask).toBe(1);
    expect(q.output_mask).toBe(0);
  });

  it('buildQueryAtom defaults to PositiveOnly proof mode', () => {
    const q = buildQueryAtom(1, 1, [1]);
    expect(q.proof_mode).toBe('PositiveOnly');
  });

  it('buildQueryAtom atom.args has exactly ARITY_CAP elements', () => {
    const q = buildQueryAtom(1, 2, [1, 2]);
    expect(q.atom.args).toHaveLength(ARITY_CAP);
  });

  it('buildQueryAtom epoch defaults to 0', () => {
    const q = buildQueryAtom(1, 1, [1]);
    expect(q.epoch).toBe(0);
  });
});

// ── Group 7 — Integration: audit chain round-trip (Rank 2 + 3) ───────────────

describe('Group 7 — Integration: audit chain JSON shape (matches prolog8-audit-chain.test.ts)', () => {
  /**
   * Reproduce the audit catalog from prolog8-audit-chain.test.ts using the
   * compiler helpers, then compare the JSON shape. This validates that the
   * compiler produces output that is structurally compatible with the existing
   * enterprise test payloads.
   */
  it('compiler produces a catalog structurally matching the enterprise audit catalog', () => {
    const terms = ['run-001', '1.0', 'seeded', 'bred', 'validated'];
    const table = internTerms(terms);

    const cat = buildCatalog(
      42,
      [
        { predId: 1, label: 'receipt',     arity: 1 },
        { predId: 2, label: 'admitted',    arity: 1 },
        { predId: 3, label: 'conformance', arity: 2 },
        { predId: 4, label: 'stage',       arity: 2 },
      ],
      table,
    );

    // Terms must match the enterprise test's hardcoded IDs
    expect(cat.term_by_label['run-001']).toBe(1);
    expect(cat.term_by_label['1.0']).toBe(2);
    expect(cat.term_by_label['seeded']).toBe(3);
    expect(cat.term_by_label['bred']).toBe(4);
    expect(cat.term_by_label['validated']).toBe(5);

    // Predicates must be present
    expect(cat.predicate_by_label['receipt']).toBe(1);
    expect(cat.predicate_by_label['admitted']).toBe(2);
    expect(cat.predicate_by_label['conformance']).toBe(3);
    expect(cat.predicate_by_label['stage']).toBe(4);
  });

  it('compiler builds receipt fact block matching enterprise test payload', () => {
    const table = internTerms(['run-001']);
    const runId = table.termByLabel.get('run-001')!; // = 1
    const block = buildFactBlock(1, 1, [[runId]]);

    // Matches makeReceiptFact() in the enterprise test
    expect(block.pred_id).toBe(1);
    expect(block.arity).toBe(1);
    expect(block.rows[0].args).toEqual([1]);
    expect(block.rows[0].pred_id).toBe(1);
    expect(block.rows[0].source_id).toBe(0);
  });

  it('compiler builds conformance fact block matching enterprise test payload', () => {
    const table = internTerms(['run-001', '1.0']);
    const runId = table.termByLabel.get('run-001')!; // = 1
    const scoreId = table.termByLabel.get('1.0')!;   // = 2
    const block = buildFactBlock(3, 2, [[runId, scoreId]]);

    // Matches makeConformanceFact() in the enterprise test
    expect(block.pred_id).toBe(3);
    expect(block.rows[0].args).toEqual([1, 2]);
  });

  it('compiler builds admitted Horn rule structurally matching enterprise test Rule8', () => {
    // admitted(X) :- receipt(X), conformance(X, "1.0")
    // X = variable → sentinel (0); "1.0" = TermId 2
    const rule = buildRule8(
      { predId: 2, arity: 1, args: [TERM_SENTINEL] },        // admitted(X)
      [
        { predId: 1, arity: 1, args: [TERM_SENTINEL] },       // receipt(X)
        { predId: 3, arity: 2, args: [TERM_SENTINEL, 2],      // conformance(X, 1.0)
          bindingMask: 0b10 },
      ],
      { ruleId: 1, varCount: 2, varLiveMask: 0b01 }
    );

    // Structural invariants
    expect(rule.body_len).toBe(2);
    expect(rule.body_mask).toBe(0b11);
    expect(rule.var_count).toBe(2);
    expect(rule.var_live_mask).toBe(0b01);
    expect(rule.head.pred_id).toBe(2);
    expect(rule.head.arity).toBe(1);
    expect(rule.body[0].pred_id).toBe(1);
    expect(rule.body[1].pred_id).toBe(3);
    expect(rule.body[1].binding_mask).toBe(0b10);
    expect(rule.body[1].args[1]).toBe(2);      // "1.0" is ground
    expect(rule.body).toHaveLength(BODY_CAP);
    expect(rule.head.args).toHaveLength(ARITY_CAP);
  });

  it('full audit query JSON is parseable and structurally valid', () => {
    const terms = ['run-001', '1.0'];
    const table = internTerms(terms);
    const runId = table.termByLabel.get('run-001')!;
    const scoreId = table.termByLabel.get('1.0')!;

    const cat = buildCatalog(42, [
      { predId: 1, label: 'receipt', arity: 1 },
      { predId: 2, label: 'admitted', arity: 1 },
      { predId: 3, label: 'conformance', arity: 2 },
    ], table);

    const facts = [
      buildFactBlock(1, 1, [[runId]]),
      buildFactBlock(3, 2, [[runId, scoreId]]),
    ];

    const rule = buildRule8(
      { predId: 2, arity: 1, args: [TERM_SENTINEL] },
      [
        { predId: 1, arity: 1, args: [TERM_SENTINEL] },
        { predId: 3, arity: 2, args: [TERM_SENTINEL, scoreId], bindingMask: 0b10 },
      ],
      { ruleId: 1, varCount: 2, varLiveMask: 0b01 }
    );

    const query = buildQueryAtom(2, 1, [runId], 1);

    const payload = { catalog: cat, facts, rules: [rule], query };
    const json = JSON.stringify(payload);

    // Must be parseable
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty('catalog');
    expect(parsed).toHaveProperty('facts');
    expect(parsed).toHaveProperty('rules');
    expect(parsed).toHaveProperty('query');
    expect(parsed.rules[0].body_len).toBe(2);
    expect(parsed.rules[0].body_mask).toBe(0b11);
  });
});

// ── Group 8 — Structural constants (Rank 1) ───────────────────────────────────

describe('Group 8 — Constants match Prolog8 ARD caps', () => {
  it('ARITY_CAP is 8', () => { expect(ARITY_CAP).toBe(8); });
  it('BODY_CAP is 8', () => { expect(BODY_CAP).toBe(8); });
  it('TERM_SENTINEL is 0', () => { expect(TERM_SENTINEL).toBe(0); });

  it('FeatureBit values are correct bit positions', () => {
    expect(FeatureBit.Facts).toBe(0);
    expect(FeatureBit.HornRules).toBe(1);
    expect(FeatureBit.Equality).toBe(2);
    expect(FeatureBit.TypedComparisons).toBe(3);
    expect(FeatureBit.StratifiedNegation).toBe(4);
  });
});
