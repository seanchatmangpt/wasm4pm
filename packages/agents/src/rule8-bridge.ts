/**
 * rule8-bridge.ts — Rule8 / Prolog8 bridge for AuditEntry records.
 *
 * Eliminates the manual boilerplate callers had to write when compiling
 * `AuditEntry[]` into a `Prolog8Catalog` + `Rule8Json[]` for the Prolog8
 * proof engine. Instead of calling `buildFact8()` + `internTerms()` by
 * hand, callers can use `auditEntriesToCatalog()` directly.
 *
 * ## Predicate schema
 *
 *   audit_entry/4(agent_name, correction_type, artifact_id, success_flag)
 *
 * where:
 *   - `agent_name`      — `AuditEntry.agent_name`
 *   - `correction_type` — `AuditEntry.correction_type`
 *   - `artifact_id`     — `AuditEntry.artifact_id ?? 'unknown'`
 *   - `success_flag`    — `'true'` | `'false'` (stringified boolean)
 *
 * ## Usage
 *
 * ```ts
 * import { auditEntriesToCatalog } from '@wasm4pm/agents';
 *
 * const { catalog, facts, internTable } = auditEntriesToCatalog(entries);
 * // Pass catalog + facts to prolog8_query via wasm4pm
 * ```
 *
 * ## Prolog8 query example
 *
 * To ask "did receipt-chain-attacker repair mcpp-run-001 successfully?":
 *
 * ```ts
 * import { buildQueryAtom } from '@wasm4pm/contracts/prolog8-compiler';
 *
 * const agentId    = catalog.term_by_label['receipt-chain-attacker'];
 * const artifactId = catalog.term_by_label['mcpp-run-001'];
 * const successId  = catalog.term_by_label['true'];
 * const predId     = catalog.predicate_by_label['audit_entry'];
 *
 * const query = buildQueryAtom(
 *   predId,
 *   4,
 *   [agentId, 0, artifactId, successId],   // 0 = free slot (correction_type)
 *   0b1101,                                 // positions 0,2,3 bound; position 1 free
 *   0b0010,                                 // output slot: position 1
 * );
 * ```
 */

import {
  buildFact8,
  buildCatalog,
  internTerms,
  type Rule8Json,
  type Prolog8Catalog,
  type TermInternTable,
} from '@wasm4pm/contracts/prolog8-compiler';

import type { AuditEntry } from './types.js';

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Output of `auditEntriesToCatalog()`.
 *
 * - `catalog`    — Ready to pass to `prolog8_query` (via `wasm4pm`).
 * - `facts`      — Unit-clause Rule8Json array (one per AuditEntry, body_len=0).
 * - `internTable` — The shared TermInternTable for further term lookups.
 */
export interface AuditRule8Bundle {
  catalog: Prolog8Catalog;
  facts: Rule8Json[];
  internTable: TermInternTable;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Predicate ID for `audit_entry/4` within any catalog produced by this bridge.
 *
 * This is stable: callers can hard-code `AUDIT_PRED_ID` when building query atoms
 * without re-reading `catalog.predicate_by_label`.
 */
export const AUDIT_PRED_ID = 1 as const;

/** Label for the audit predicate (arity 4). */
export const AUDIT_PRED_LABEL = 'audit_entry' as const;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compile an `AuditEntry[]` into a Prolog8-admissible Rule8 bundle.
 *
 * Each entry produces one ground fact:
 *
 *   audit_entry(agent_name, correction_type, artifact_id, success_flag)
 *
 * The intern table is shared across all facts — the same term string always
 * maps to the same TermId within the returned catalog.
 *
 * Empty input produces an empty catalog (no crash, no sentinel terms).
 *
 * @param entries   AuditEntry records to compile. May be empty.
 * @param catalogId Catalog identifier (arbitrary positive integer). Default: 1.
 *
 * @returns An `AuditRule8Bundle` containing the catalog, facts, and intern table.
 *
 * @example
 * ```ts
 * const { catalog, facts } = auditEntriesToCatalog(auditStore.query({ limit: 100 }));
 * // catalog and facts are ready for prolog8_query via wasm4pm
 * ```
 */
export function auditEntriesToCatalog(
  entries: AuditEntry[],
  catalogId = 1,
): AuditRule8Bundle {
  // Collect all unique string values for deterministic interning.
  // Order: agent_name first so the most distinctive term gets the lowest TermId.
  const rawTerms: string[] = [];
  for (const entry of entries) {
    rawTerms.push(entry.agent_name);
    rawTerms.push(entry.correction_type);
    rawTerms.push(entry.artifact_id ?? 'unknown');
    rawTerms.push(entry.correction_success ? 'true' : 'false');
  }

  // Deduplicate while preserving first-seen order (internTerms is order-stable).
  const seen = new Set<string>();
  const uniqueTerms: string[] = [];
  for (const t of rawTerms) {
    if (!seen.has(t)) {
      seen.add(t);
      uniqueTerms.push(t);
    }
  }

  const internTable = internTerms(uniqueTerms);

  // Build one ground fact per entry.
  const facts: Rule8Json[] = entries.map((entry, idx) => {
    const agentId     = internTable.termByLabel.get(entry.agent_name)!;
    const corrType    = internTable.termByLabel.get(entry.correction_type)!;
    const artifactId  = internTable.termByLabel.get(entry.artifact_id ?? 'unknown')!;
    const successFlag = internTable.termByLabel.get(entry.correction_success ? 'true' : 'false')!;

    return buildFact8(
      AUDIT_PRED_ID,
      4,
      [agentId, corrType, artifactId, successFlag],
      idx + 1,           // rule_id is 1-based; unique within this catalog
    );
  });

  // Build the catalog.  If entries is empty, the catalog has the predicate
  // descriptor but zero term mappings — still valid for admission.
  const catalog = buildCatalog(
    catalogId,
    [{ predId: AUDIT_PRED_ID, label: AUDIT_PRED_LABEL, arity: 4, proofPolicy: 'OnRequest' }],
    internTable,
  );

  return { catalog, facts, internTable };
}
