/**
 * rule8-bridge.test.ts — Unit tests for auditEntriesToCatalog()
 *
 * Oracle rank: Rank 2 — Domain contract.
 *
 * Validates that the Rule8 bridge correctly compiles AuditEntry records into
 * Prolog8-admissible catalogs without requiring callers to manually call
 * buildFact8() + internTerms().
 *
 * No mocks of WASM or init.js. All functions are pure TypeScript. Gemba principle.
 */

import { describe, it, expect } from 'vitest';
import { auditEntriesToCatalog, AUDIT_PRED_ID, AUDIT_PRED_LABEL } from '../rule8-bridge.js';
import type { AuditRule8Bundle } from '../rule8-bridge.js';
import type { AuditEntry } from '../types.js';
import { TERM_SENTINEL } from '@wasm4pm/contracts/prolog8-compiler';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2026-05-18T10:00:00Z',
    agent_name: 'receipt-chain-attacker',
    correction_type: 'receipt_chain_repair',
    violation: {
      agent_name: 'receipt-chain-attacker',
      violation_type: 'broken_hash_chain',
      severity: 'critical',
      evidence: {},
      process_mining_proof: null,
      timestamp: '2026-05-18T10:00:00Z',
      blocked_manufacturing: true,
      target: 'mcpp-run-001',
    },
    correction_action: 'receipt_chain_repair applied',
    correction_success: true,
    correction_details: {},
    artifact_id: 'mcpp-run-001',
    snapshot_data: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Group 1 — Return shape
// ─────────────────────────────────────────────────────────────────────────────

describe('auditEntriesToCatalog: return shape', () => {
  it('returns a Prolog8Catalog with the audit_entry predicate registered', () => {
    const bundle: AuditRule8Bundle = auditEntriesToCatalog([makeEntry()]);

    expect(bundle.catalog.predicate_by_label[AUDIT_PRED_LABEL]).toBe(AUDIT_PRED_ID);
    expect(bundle.catalog.predicates[String(AUDIT_PRED_ID)].label).toBe(AUDIT_PRED_LABEL);
    expect(bundle.catalog.predicates[String(AUDIT_PRED_ID)].arity).toBe(4);
    expect(bundle.catalog.predicates[String(AUDIT_PRED_ID)].proof_policy).toBe('OnRequest');
  });

  it('returns a facts array with one entry per AuditEntry', () => {
    const entries = [makeEntry(), makeEntry({ agent_name: 'mock-interceptor', correction_type: 'code_refactoring' })];
    const { facts } = auditEntriesToCatalog(entries);

    expect(facts).toHaveLength(2);
  });

  it('returns an internTable with non-empty termByLabel', () => {
    const { internTable } = auditEntriesToCatalog([makeEntry()]);

    expect(internTable.termByLabel.size).toBeGreaterThan(0);
    expect(internTable.labelByTerm.size).toBeGreaterThan(0);
  });

  it('catalog has required Prolog8 fields', () => {
    const { catalog } = auditEntriesToCatalog([makeEntry()]);

    expect(typeof catalog.catalog_id).toBe('number');
    expect(catalog.catalog_id).toBeGreaterThan(0);
    expect(typeof catalog.predicates).toBe('object');
    expect(typeof catalog.term_labels).toBe('object');
    expect(typeof catalog.predicate_by_label).toBe('object');
    expect(typeof catalog.term_by_label).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 2 — Ground facts (body_len: 0, var_count: 0)
// ─────────────────────────────────────────────────────────────────────────────

describe('auditEntriesToCatalog: all facts are ground unit clauses', () => {
  it('every fact has body_len: 0 (no rule body)', () => {
    const { facts } = auditEntriesToCatalog([makeEntry(), makeEntry({ correction_success: false })]);

    for (const fact of facts) {
      expect(fact.body_len).toBe(0);
    }
  });

  it('every fact has var_count: 0 (all ground arguments)', () => {
    const { facts } = auditEntriesToCatalog([makeEntry()]);

    for (const fact of facts) {
      expect(fact.var_count).toBe(0);
    }
  });

  it('every fact has body_mask: 0', () => {
    const { facts } = auditEntriesToCatalog([makeEntry()]);

    for (const fact of facts) {
      expect(fact.body_mask).toBe(0);
    }
  });

  it('every fact has exactly 4 non-sentinel head arguments', () => {
    const { facts } = auditEntriesToCatalog([makeEntry()]);

    for (const fact of facts) {
      expect(fact.head.arity).toBe(4);
      // args array is always padded to 8
      expect(fact.head.args).toHaveLength(8);

      // First 4 positions must be bound ground constants (non-sentinel)
      for (let i = 0; i < 4; i++) {
        expect(fact.head.args[i]).not.toBe(TERM_SENTINEL);
        expect(fact.head.args[i]).toBeGreaterThan(0);
      }

      // Remaining 4 positions must be sentinel (padding)
      for (let i = 4; i < 8; i++) {
        expect(fact.head.args[i]).toBe(TERM_SENTINEL);
      }
    }
  });

  it('every fact head references AUDIT_PRED_ID', () => {
    const entries = [makeEntry(), makeEntry({ agent_name: 'config-drift-guardian' })];
    const { facts } = auditEntriesToCatalog(entries);

    for (const fact of facts) {
      expect(fact.head.pred_id).toBe(AUDIT_PRED_ID);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 3 — Shared intern table
// ─────────────────────────────────────────────────────────────────────────────

describe('auditEntriesToCatalog: intern table is shared across all facts', () => {
  it('same term string → same TermId across multiple entries', () => {
    const sharedArtifact = 'mcpp-run-shared';
    const entries: AuditEntry[] = [
      makeEntry({ artifact_id: sharedArtifact }),
      makeEntry({ agent_name: 'theater-detector', correction_type: 'evidence_repair', artifact_id: sharedArtifact }),
    ];

    const { facts, internTable } = auditEntriesToCatalog(entries);

    // Both facts reference the same artifact_id TermId (position 2 = artifact_id)
    const sharedTermId = internTable.termByLabel.get(sharedArtifact)!;
    expect(sharedTermId).toBeGreaterThan(0);

    // fact[0] and fact[1] must carry the same TermId for the shared artifact
    expect(facts[0].head.args[2]).toBe(sharedTermId);
    expect(facts[1].head.args[2]).toBe(sharedTermId);
  });

  it('catalog.term_by_label reflects the shared intern table', () => {
    const { catalog, internTable } = auditEntriesToCatalog([makeEntry()]);

    for (const [label, id] of internTable.termByLabel) {
      expect(catalog.term_by_label[label]).toBe(id);
    }
  });

  it('catalog.term_labels reflects the shared intern table (inverse)', () => {
    const { catalog, internTable } = auditEntriesToCatalog([makeEntry()]);

    for (const [id, label] of internTable.labelByTerm) {
      expect(catalog.term_labels[String(id)]).toBe(label);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 4 — Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('auditEntriesToCatalog: edge cases', () => {
  it('empty entries → empty facts array, catalog has predicate but no terms', () => {
    const { catalog, facts, internTable } = auditEntriesToCatalog([]);

    // No crash
    expect(Array.isArray(facts)).toBe(true);
    expect(facts).toHaveLength(0);

    // Predicate still registered
    expect(catalog.predicate_by_label[AUDIT_PRED_LABEL]).toBe(AUDIT_PRED_ID);

    // No terms interned
    expect(internTable.termByLabel.size).toBe(0);
    expect(Object.keys(catalog.term_by_label)).toHaveLength(0);
  });

  it('null artifact_id → interned as "unknown" (no crash)', () => {
    const entry = makeEntry({ artifact_id: null });
    const { catalog, facts } = auditEntriesToCatalog([entry]);

    expect(catalog.term_by_label['unknown']).toBeGreaterThan(0);
    // The artifact_id position (args[2]) must reference the 'unknown' TermId
    const unknownId = catalog.term_by_label['unknown'];
    expect(facts[0].head.args[2]).toBe(unknownId);
  });

  it('correction_success=false → interned as "false"', () => {
    const entry = makeEntry({ correction_success: false });
    const { catalog, facts } = auditEntriesToCatalog([entry]);

    const falseId = catalog.term_by_label['false'];
    expect(falseId).toBeGreaterThan(0);
    expect(facts[0].head.args[3]).toBe(falseId);
  });

  it('correction_success=true → interned as "true"', () => {
    const entry = makeEntry({ correction_success: true });
    const { catalog, facts } = auditEntriesToCatalog([entry]);

    const trueId = catalog.term_by_label['true'];
    expect(trueId).toBeGreaterThan(0);
    expect(facts[0].head.args[3]).toBe(trueId);
  });

  it('rule_ids are unique across all facts (no two facts share a rule_id)', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ agent_name: `agent-${i}` as AuditEntry['agent_name'], artifact_id: `artifact-${i}` })
    );
    const { facts } = auditEntriesToCatalog(entries);

    const ruleIds = facts.map((f) => f.rule_id[0]);
    const uniqueRuleIds = new Set(ruleIds);
    expect(uniqueRuleIds.size).toBe(facts.length);
  });

  it('catalogId parameter is reflected in catalog.catalog_id', () => {
    const { catalog } = auditEntriesToCatalog([makeEntry()], 42);

    expect(catalog.catalog_id).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group 5 — Round-trip: catalog JSON is parseable
// ─────────────────────────────────────────────────────────────────────────────

describe('auditEntriesToCatalog: round-trip JSON serialization', () => {
  it('catalog serializes and parses back to the same shape', () => {
    const { catalog } = auditEntriesToCatalog([makeEntry()]);

    const serialized = JSON.stringify(catalog);
    expect(() => JSON.parse(serialized)).not.toThrow();

    const parsed = JSON.parse(serialized) as typeof catalog;
    expect(parsed.catalog_id).toBe(catalog.catalog_id);
    expect(parsed.predicate_by_label[AUDIT_PRED_LABEL]).toBe(AUDIT_PRED_ID);
  });

  it('facts array serializes and parses back with same rule_ids', () => {
    const entries = [makeEntry(), makeEntry({ agent_name: 'theater-detector', correction_type: 'evidence_repair' })];
    const { facts } = auditEntriesToCatalog(entries);

    const serialized = JSON.stringify(facts);
    const parsed = JSON.parse(serialized) as typeof facts;

    expect(parsed).toHaveLength(facts.length);
    for (let i = 0; i < facts.length; i++) {
      expect(parsed[i].rule_id[0]).toBe(facts[i].rule_id[0]);
      expect(parsed[i].body_len).toBe(0);
      expect(parsed[i].var_count).toBe(0);
    }
  });
});
