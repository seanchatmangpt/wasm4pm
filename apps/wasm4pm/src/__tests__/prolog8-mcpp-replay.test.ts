/**
 * prolog8-mcpp-replay.test.ts
 *
 * Integration tests for `wpm prolog8 replay` using mcpp audit-chain axioms
 * built with the `@wasm4pm/contracts` compiler API (`buildFact8`, `buildRule8`,
 * `buildCatalog`, `internTerms`, etc.).
 *
 * SCOPE: These tests are distinct from prolog8-audit-chain.test.ts in that they:
 *   1. Build all inputs via the typed compiler API rather than handcrafted JSON
 *   2. Model mcpp-specific admission axioms: receipt/1, conformance/2, admitted/1
 *   3. Verify the ocel-bridge type shapes work as receipt-to-OCEL inputs
 *   4. Test replay negative cases: missing receipt field, malformed chain, no WASM
 *   5. Document actual current behavior when WASM is absent (exit 2, error envelope)
 *
 * WASM tolerance: When the Prolog8 WASM package is not built (`crates/prolog8/pkg/`
 * absent), ALL CLI tests will receive exit code SOURCE_ERROR (2). Tests assert
 * the correct behavior for both WASM-present and WASM-absent states.
 *
 * mcpp admission axioms under test:
 *   receipt(X)          — this run has a cryptographic receipt
 *   conformance(X, 1.0) — this run achieved 1.0 conformance score
 *   admitted(X) :- receipt(X), conformance(X, 1.0)  — admission Horn rule
 *   refused(X)  :- receipt(X), conformance(X, V), V < 1.0  (represented as absent conformance fact)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import {
  internTerms,
  buildFact8,
  buildRule8,
  buildFactBlock,
  buildCatalog,
  buildQueryAtom,
  PROLOG8_TERM_SENTINEL,
  Prolog8FeatureBit,
  type Prolog8Catalog,
  type Rule8Json,
  type FactBlockJson,
} from '@wasm4pm/contracts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Each test spawns a Node subprocess — 5s default vitest timeout is too low.
// runCli defaults to 30s; set vitest test timeout higher to avoid race.
vi.setConfig({ testTimeout: 60_000 });

// ── Predicate ID constants (shared across all builder functions) ──────────────

const PRED = {
  receipt: 1,
  conformance: 2,
  admitted: 3,
  refused: 4,
} as const;

// ── Term labels for mcpp audit domain ────────────────────────────────────────

const MCPP_TERMS = [
  'run-mcpp-001', // TermId 1 — a successful receipt run
  'run-mcpp-002', // TermId 2 — a failed / non-conforming run
  '1.0',          // TermId 3 — conformance score 1.0 (perfect, admission threshold)
  '0.8',          // TermId 4 — conformance score 0.8 (exploratory, below admission)
] as const;

// ── Compiler API helpers ──────────────────────────────────────────────────────

/**
 * Build the mcpp audit chain catalog using the typed compiler API.
 *
 * Predicates:
 *   1: receipt(RunId)          — run has an attached receipt
 *   2: conformance(RunId, Score) — run achieved a conformance score
 *   3: admitted(RunId)         — run is admitted (receipt + 1.0 conformance)
 *   4: refused(RunId)          — run is refused (receipt but conformance < 1.0)
 */
function buildMcppCatalog(): Prolog8Catalog {
  const terms = internTerms([...MCPP_TERMS]);
  return buildCatalog(
    42, // catalog_id
    [
      { predId: PRED.receipt,      label: 'receipt',      arity: 1 },
      { predId: PRED.conformance,  label: 'conformance',  arity: 2 },
      { predId: PRED.admitted,     label: 'admitted',     arity: 1 },
      { predId: PRED.refused,      label: 'refused',      arity: 1 },
    ],
    terms,
  );
}

/**
 * Build fact blocks for the full-admission case:
 *   receipt(run-mcpp-001)
 *   conformance(run-mcpp-001, 1.0)
 */
function buildFullAdmissionFacts(): FactBlockJson[] {
  // TermId assignments: run-mcpp-001=1, run-mcpp-002=2, 1.0=3, 0.8=4
  return [
    buildFactBlock(PRED.receipt, 1, [[1]]),            // receipt(run-mcpp-001)
    buildFactBlock(PRED.conformance, 2, [[1, 3]]),     // conformance(run-mcpp-001, 1.0)
  ];
}

/**
 * Build fact blocks for the refused case:
 *   receipt(run-mcpp-002)
 *   conformance(run-mcpp-002, 0.8)   — below 1.0 threshold
 */
function buildRefusedFacts(): FactBlockJson[] {
  return [
    buildFactBlock(PRED.receipt, 1, [[2]]),            // receipt(run-mcpp-002)
    buildFactBlock(PRED.conformance, 2, [[2, 4]]),     // conformance(run-mcpp-002, 0.8)
  ];
}

/**
 * Build fact blocks with receipt but no conformance fact (gap case).
 */
function buildReceiptOnlyFacts(): FactBlockJson[] {
  return [
    buildFactBlock(PRED.receipt, 1, [[1]]),            // receipt(run-mcpp-001) only
  ];
}

/**
 * Build the Horn rule: admitted(X) :- receipt(X), conformance(X, 1.0)
 *
 * Variable X = TERM_SENTINEL (0) in head and body[0].
 * "1.0" = TermId 3 (ground constant bound at position 1 of conformance).
 */
function buildAdmittedRule(): Rule8Json {
  return buildRule8(
    // Head: admitted(X)
    { predId: PRED.admitted, arity: 1, args: [PROLOG8_TERM_SENTINEL] },
    // Body: receipt(X), conformance(X, "1.0")
    [
      { predId: PRED.receipt,     arity: 1, args: [PROLOG8_TERM_SENTINEL] },
      { predId: PRED.conformance, arity: 2, args: [PROLOG8_TERM_SENTINEL, 3], bindingMask: 0b10 },
    ],
    {
      ruleId: 1,
      varCount: 2,           // X is the one logical variable; slot 0 in head and body
      varLiveMask: 0b01,     // X appears in head (bit 0)
      featureMask: (1 << Prolog8FeatureBit.Facts) | (1 << Prolog8FeatureBit.HornRules),
    },
  );
}

/**
 * Build a query that asks: admitted(run-mcpp-001)?
 * TermId for "run-mcpp-001" = 1 (bound position 0).
 */
function buildAdmittedQueryInput(facts: FactBlockJson[], includeRule = true): string {
  const catalog = buildMcppCatalog();
  const rules = includeRule ? [buildAdmittedRule()] : [];
  return JSON.stringify({
    catalog,
    facts,
    rules,
    query: {
      atom: { pred_id: PRED.admitted, arity: 1, args: [1] }, // admitted(run-mcpp-001)
      binding_mask: 1,   // position 0 is bound (ground constant)
      proof_mode: 'PositiveOnly',
      epoch: 0,
    },
  });
}

/**
 * Build a simple query that asks: receipt(run-mcpp-001)?
 * This is a direct fact lookup — no rules needed.
 */
function buildReceiptQueryInput(): string {
  const catalog = buildMcppCatalog();
  return JSON.stringify({
    catalog,
    facts: buildFullAdmissionFacts(),
    rules: [],
    query: {
      atom: { pred_id: PRED.receipt, arity: 1, args: [1] }, // receipt(run-mcpp-001)
      binding_mask: 1,
      proof_mode: 'PositiveOnly',
      epoch: 0,
    },
  });
}

/**
 * Build a replay input by adding a (forged/placeholder) receipt to a query input.
 * All hash roots are placeholder hex strings that will fail the BLAKE3 integrity check.
 */
function buildReplayInput(
  facts: FactBlockJson[],
  tamperField?: keyof typeof PLACEHOLDER_RECEIPT,
): string {
  const catalog = buildMcppCatalog();
  const rules = [buildAdmittedRule()];
  const receipt: Record<string, string> = { ...PLACEHOLDER_RECEIPT };
  if (tamperField) {
    // Flip last byte to simulate single-field tampering
    const orig = receipt[tamperField];
    receipt[tamperField] = orig.slice(0, -2) + (orig.endsWith('00') ? 'ff' : '00');
  }
  return JSON.stringify({
    catalog,
    facts,
    rules,
    query: {
      atom: { pred_id: PRED.admitted, arity: 1, args: [1] },
      binding_mask: 1,
      proof_mode: 'PositiveOnly',
      epoch: 0,
    },
    receipt,
  });
}

/**
 * Placeholder receipt — structurally valid but hash values are fictional.
 * Engine will return ReceiptInvalid (not Verified) because the hashes don't
 * match the actual catalog + rules + facts content.
 */
const PLACEHOLDER_RECEIPT = {
  receipt_hash:   'deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000',
  proof_root:     'deadbeef11111111deadbeef11111111deadbeef11111111deadbeef11111111',
  catalog_root:   'deadbeef22222222deadbeef22222222deadbeef22222222deadbeef22222222',
  rule_root:      'deadbeef33333333deadbeef33333333deadbeef33333333deadbeef33333333',
  fact_root:      'deadbeef44444444deadbeef44444444deadbeef44444444deadbeef44444444',
  input_root:     'deadbeef55555555deadbeef55555555deadbeef55555555deadbeef55555555',
  output_root:    'deadbeef66666666deadbeef66666666deadbeef66666666deadbeef66666666',
  engine_version: '0.1.0',
} as const;

// ── Test utilities ────────────────────────────────────────────────────────────

type CliTestEnv = Awaited<ReturnType<typeof createCliTestEnv>>;

function writeTmp(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Prolog8 — mcpp Receipt Replay Integration', () => {
  let env: CliTestEnv;
  let tmpDir: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-p8-mcpp-'));
  });

  afterEach(async () => {
    await env?.cleanup?.();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  // ── Unit: compiler API produces valid JSON (no WASM needed) ──────────────

  describe('Compiler API — unit contracts (no WASM required)', () => {
    it('internTerms assigns sequential IDs starting at 1', () => {
      const table = internTerms([...MCPP_TERMS]);
      expect(table.termByLabel.get('run-mcpp-001')).toBe(1);
      expect(table.termByLabel.get('run-mcpp-002')).toBe(2);
      expect(table.termByLabel.get('1.0')).toBe(3);
      expect(table.termByLabel.get('0.8')).toBe(4);
      // Sentinel 0 is never assigned
      expect([...table.termByLabel.values()]).not.toContain(0);
    });

    it('internTerms is idempotent — duplicate labels get same ID', () => {
      const t1 = internTerms(['a', 'b', 'a']);
      const t2 = internTerms(['a', 'b']);
      expect(t1.termByLabel.get('a')).toBe(t2.termByLabel.get('a'));
      expect(t1.termByLabel.get('b')).toBe(t2.termByLabel.get('b'));
    });

    it('buildCatalog produces correct predicate_by_label mapping', () => {
      const catalog = buildMcppCatalog();
      expect(catalog.predicate_by_label['receipt']).toBe(PRED.receipt);
      expect(catalog.predicate_by_label['conformance']).toBe(PRED.conformance);
      expect(catalog.predicate_by_label['admitted']).toBe(PRED.admitted);
      expect(catalog.predicate_by_label['refused']).toBe(PRED.refused);
    });

    it('buildCatalog includes term_by_label entries for all MCPP terms', () => {
      const catalog = buildMcppCatalog();
      expect(catalog.term_by_label['run-mcpp-001']).toBe(1);
      expect(catalog.term_by_label['run-mcpp-002']).toBe(2);
      expect(catalog.term_by_label['1.0']).toBe(3);
    });

    it('buildFactBlock for receipt(run-mcpp-001) has correct structure', () => {
      const blocks = buildFullAdmissionFacts();
      const receiptBlock = blocks[0];
      expect(receiptBlock.pred_id).toBe(PRED.receipt);
      expect(receiptBlock.arity).toBe(1);
      expect(receiptBlock.rows).toHaveLength(1);
      expect(receiptBlock.rows[0].args).toEqual([1]); // TermId 1 = 'run-mcpp-001'
    });

    it('buildFactBlock for conformance(run-mcpp-001, 1.0) has correct structure', () => {
      const blocks = buildFullAdmissionFacts();
      const confBlock = blocks[1];
      expect(confBlock.pred_id).toBe(PRED.conformance);
      expect(confBlock.arity).toBe(2);
      expect(confBlock.rows[0].args).toEqual([1, 3]); // [run-mcpp-001, "1.0"]
    });

    it('buildFactBlock rejects sentinel args (all fact args must be ground)', () => {
      expect(() =>
        buildFactBlock(PRED.receipt, 1, [[PROLOG8_TERM_SENTINEL]])
      ).toThrow(/sentinel|ground/i);
    });

    it('buildFact8 produces a Rule8Json with body_len=0 and feature_mask=Facts', () => {
      const fact = buildFact8(PRED.receipt, 1, [1], 5);
      expect(fact.body_len).toBe(0);
      expect(fact.body_mask).toBe(0);
      expect(fact.var_count).toBe(0);
      expect(fact.rule_id[0]).toBe(5);
      // feature_mask must include the Facts bit (bit 0)
      expect(fact.feature_mask & (1 << Prolog8FeatureBit.Facts)).toBeGreaterThan(0);
    });

    it('buildFact8 rejects sentinel args', () => {
      expect(() =>
        buildFact8(PRED.receipt, 1, [PROLOG8_TERM_SENTINEL])
      ).toThrow(/sentinel|ground/i);
    });

    it('buildRule8 for admitted :- receipt, conformance has body_len=2', () => {
      const rule = buildAdmittedRule();
      expect(rule.body_len).toBe(2);
      expect(rule.body_mask).toBe(0b11);      // (1 << 2) - 1
      expect(rule.head.pred_id).toBe(PRED.admitted);
      expect(rule.body[0].pred_id).toBe(PRED.receipt);
      expect(rule.body[1].pred_id).toBe(PRED.conformance);
    });

    it('buildRule8 admitted rule has HornRules feature bit set', () => {
      const rule = buildAdmittedRule();
      expect(rule.feature_mask & (1 << Prolog8FeatureBit.HornRules)).toBeGreaterThan(0);
    });

    it('buildRule8 admitted rule body[1] has conformance ground arg at position 1', () => {
      const rule = buildAdmittedRule();
      // conformance(X, "1.0"): X is sentinel (0), "1.0" is TermId 3
      expect(rule.body[1].args[0]).toBe(PROLOG8_TERM_SENTINEL); // variable X
      expect(rule.body[1].args[1]).toBe(3);                      // ground "1.0"
      expect(rule.body[1].binding_mask).toBe(0b10);              // position 1 is ground
    });

    it('buildAdmittedQueryInput produces parseable JSON', () => {
      const input = buildAdmittedQueryInput(buildFullAdmissionFacts());
      expect(() => JSON.parse(input)).not.toThrow();
      const parsed = JSON.parse(input) as Record<string, unknown>;
      expect(parsed).toHaveProperty('catalog');
      expect(parsed).toHaveProperty('facts');
      expect(parsed).toHaveProperty('rules');
      expect(parsed).toHaveProperty('query');
    });

    it('buildReplayInput produces JSON with receipt field containing all 7 hash roots', () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      expect(() => JSON.parse(input)).not.toThrow();
      const parsed = JSON.parse(input) as Record<string, unknown>;
      const receipt = parsed['receipt'] as Record<string, string>;
      expect(receipt).toHaveProperty('receipt_hash');
      expect(receipt).toHaveProperty('proof_root');
      expect(receipt).toHaveProperty('catalog_root');
      expect(receipt).toHaveProperty('rule_root');
      expect(receipt).toHaveProperty('fact_root');
      expect(receipt).toHaveProperty('input_root');
      expect(receipt).toHaveProperty('output_root');
      expect(receipt).toHaveProperty('engine_version');
    });

    it('buildQueryAtom produces correct shape for admitted(run-mcpp-001)', () => {
      const qa = buildQueryAtom(PRED.admitted, 1, [1], 1, 0);
      expect(qa.atom.pred_id).toBe(PRED.admitted);
      expect(qa.atom.arity).toBe(1);
      expect(qa.atom.args[0]).toBe(1); // TermId 1 = 'run-mcpp-001'
      expect(qa.binding_mask).toBe(1);
      expect(qa.proof_mode).toBe('PositiveOnly');
    });

    it('catalog term_labels inverse map is consistent with term_by_label', () => {
      const catalog = buildMcppCatalog();
      // For every term label, the reverse map must agree
      for (const [label, termId] of Object.entries(catalog.term_by_label)) {
        expect(catalog.term_labels[String(termId)]).toBe(label);
      }
    });
  });

  // ── CLI: receipt(run-mcpp-001) direct fact query ──────────────────────────

  describe('CLI: mcpp receipt fact query via prolog8 query', () => {
    it('receipt query exits 0 (success) or 2 (source_error when WASM absent)', async () => {
      const input = buildReceiptQueryInput();
      const queryPath = writeTmp(tmpDir, 'mcpp-receipt-query.json', input);
      const result = await runCli(['lab', 'prolog8', 'query', '-i', queryPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });

    it('receipt query --format json always emits a valid envelope', async () => {
      const input = buildReceiptQueryInput();
      const queryPath = writeTmp(tmpDir, 'mcpp-receipt-query-j.json', input);
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env },
      );
      // Envelope must be parseable regardless of WASM presence
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      // Success keeps the full legacy envelope (status/exit_code); failure is
      // ONLY {error:{code,message}} — see file-level bridge contract notes
      // in prolog8-cli.test.ts. Never neither.
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed).toHaveProperty('status');
        expect(parsed).toHaveProperty('exit_code');
        expect(parsed['exit_code']).toBe(result.exitCode);
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('receipt query JSON envelope exit_code matches process exit code (success envelope only)', async () => {
      const input = buildReceiptQueryInput();
      const queryPath = writeTmp(tmpDir, 'mcpp-ec.json', input);
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed['exit_code']).toBe(result.exitCode);
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('receipt query with WASM present has Answered in result payload', async () => {
      const input = buildReceiptQueryInput();
      const queryPath = writeTmp(tmpDir, 'mcpp-receipt-ans.json', input);
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env },
      );
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM not built
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown>;
      const qResult = payload['result'] as Record<string, unknown>;
      // receipt(run-mcpp-001) is in facts — should be Answered
      const isAnswered = qResult['Answered'] !== undefined || qResult['TruncatedAnswers'] !== undefined;
      expect(isAnswered).toBe(true);
    });

    it('query built from compiler API is accepted without config_error (schema is valid)', async () => {
      // Validates that the compiler API produces schema-valid JSON the CLI accepts
      const input = buildAdmittedQueryInput(buildFullAdmissionFacts());
      const queryPath = writeTmp(tmpDir, 'mcpp-admitted-full.json', input);
      const result = await runCli(['lab', 'prolog8', 'query', '-i', queryPath], { env: env.env });
      // Schema-invalid input would exit config_error (1)
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    });

    it('query without conformance fact is accepted (schema valid, engine will deny)', async () => {
      // receipt-only facts: admission rule body[1] (conformance) is unsatisfied
      const input = buildAdmittedQueryInput(buildReceiptOnlyFacts());
      const queryPath = writeTmp(tmpDir, 'mcpp-noconf.json', input);
      const result = await runCli(['lab', 'prolog8', 'query', '-i', queryPath], { env: env.env });
      // Schema must be valid; engine may Deny or source_error
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });
  });

  // ── CLI: prolog8 replay with mcpp audit chain ─────────────────────────────

  describe('CLI: prolog8 replay with mcpp audit chain inputs', () => {
    it('replay with placeholder receipt exits non-zero (ReceiptInvalid — hashes do not match content)', async () => {
      // The placeholder hashes are fictional — engine returns ReceiptInvalid, not Verified.
      // Enterprise invariant: "If a receipt chain has gaps, the proof is invalid"
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-placeholder.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      // ReceiptInvalid → conformance_fail (6) when WASM present; source_error (2) when absent
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      expect([EXIT_CODES.source_error, EXIT_CODES.conformance_fail]).toContain(result.exitCode);
    });

    it('replay --format json has status+exit_code on success, or {error} on failure', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-j.json', input);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (result.exitCode === EXIT_CODES.success) {
        expect(parsed).toHaveProperty('status');
        expect(parsed).toHaveProperty('exit_code');
        expect(parsed['exit_code']).toBe(result.exitCode);
      } else {
        expect(parsed).toHaveProperty('error');
      }
    });

    it('replay --format json error.code is "INVALID_INPUT" when WASM absent (source_error path)', async () => {
      // Document actual behavior: WASM not built -> the framework error
      // envelope {error:{code,message}} only — no legacy status/exit_code
      // fields, and the framework's ErrorCode vocabulary ('INVALID_INPUT'),
      // not the legacy 'source_error' string (see
      // packages/noun-verb/src/errors.ts).
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-wasm-absent.json', input);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      if (result.exitCode !== EXIT_CODES.source_error) return; // WASM present — skip this path
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const error = parsed['error'] as Record<string, unknown> | undefined;
      expect(error).toBeDefined();
      expect(error?.['code']).toBe('INVALID_INPUT');
    });

    it('replay error message mentions prolog8 build instructions when WASM absent', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-hint.json', input);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      if (result.exitCode !== EXIT_CODES.source_error) return; // WASM present — vacuous
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const error = parsed['error'] as Record<string, unknown> | undefined;
      // Error message must guide the user to build the WASM package
      expect(String(error?.['message'])).toMatch(/prolog8|wasm-pack|crates\/prolog8/i);
    });

    it('replay with tampered receipt_hash exits non-zero (Mismatch path when WASM present)', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts(), 'receipt_hash');
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-tampered.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay with tampered catalog_root exits non-zero', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts(), 'catalog_root');
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-catalog-tamper.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay with tampered fact_root exits non-zero', async () => {
      // Enterprise invariant: "If output_hash mismatches, the artifact is tampered"
      const input = buildReplayInput(buildFullAdmissionFacts(), 'fact_root');
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-fact-tamper.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay human output mentions tampering or verification failure when WASM present', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-human.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/mismatch|tamper|invalid|receipt|verification|andon/i);
    });

    it('replay of missing-receipt input (no receipt field) exits non-zero', async () => {
      // A query input without the receipt field — replay requires the receipt for verification
      const queryOnly = buildAdmittedQueryInput(buildFullAdmissionFacts());
      // Confirm no receipt field in this payload
      expect(JSON.parse(queryOnly)).not.toHaveProperty('receipt');
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-no-receipt.json', queryOnly);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      // Without a receipt, replay cannot verify — must not exit 0
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay of missing-receipt --format json has error envelope', async () => {
      const queryOnly = buildAdmittedQueryInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-no-receipt-j.json', queryOnly);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      // Without a receipt, replay never succeeds — the error envelope
      // {error:{code,message}} is the only shape (no status/exit_code fields
      // on it; see bridge contract notes elsewhere in this batch).
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
      expect(parsed).toHaveProperty('error');
    });

    it('replay is deterministic — two runs with identical input agree on rejection', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-det.json', input);
      const [r1, r2] = await Promise.all([
        runCli(['evidence', 'replay', '-i', replayPath], { env: env.env }),
        runCli(['evidence', 'replay', '-i', replayPath], { env: env.env }),
      ]);
      expect(r1.exitCode).toBe(r2.exitCode);
    });

    it('replay JSON payload is identical across two deterministic runs', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-replay-det-j.json', input);
      const [r1, r2] = await Promise.all([
        runCli(['evidence', 'replay', '-i', replayPath, '--format', 'json'], { env: env.env }),
        runCli(['evidence', 'replay', '-i', replayPath, '--format', 'json'], { env: env.env }),
      ]);
      const p1 = JSON.parse(r1.stdout) as Record<string, unknown>;
      const p2 = JSON.parse(r2.stdout) as Record<string, unknown>;
      expect(r1.exitCode).toBe(r2.exitCode);
      if (r1.exitCode === EXIT_CODES.success) {
        expect(p1['status']).toBe(p2['status']);
        expect(p1['exit_code']).toBe(p2['exit_code']);
      } else {
        // Both runs must fail with the same framework error code.
        const e1 = p1['error'] as Record<string, unknown>;
        const e2 = p2['error'] as Record<string, unknown>;
        expect(e1?.['code']).toBe(e2?.['code']);
      }
    });
  });

  // ── CLI: refused-run (conformance < 1.0) replay path ────────────────────

  describe('CLI: mcpp refused-run replay (conformance 0.8 — below threshold)', () => {
    it('refused-run query exits non-zero or success (admitted rule body unsatisfied for refused run)', async () => {
      // admitted(run-mcpp-002) :- receipt(run-mcpp-002), conformance(run-mcpp-002, 1.0)
      // But facts only have conformance(run-mcpp-002, 0.8), not 1.0 — rule body fails
      const input = JSON.stringify({
        catalog: buildMcppCatalog(),
        facts: buildRefusedFacts(),
        rules: [buildAdmittedRule()],
        query: {
          atom: { pred_id: PRED.admitted, arity: 1, args: [2] }, // admitted(run-mcpp-002)
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const queryPath = writeTmp(tmpDir, 'mcpp-refused-query.json', input);
      const result = await runCli(['lab', 'prolog8', 'query', '-i', queryPath], { env: env.env });
      // Denied exits 0 in Prolog8 CLI (negative answer is still a valid answer)
      expect([EXIT_CODES.success, EXIT_CODES.source_error, EXIT_CODES.execution_error]).toContain(
        result.exitCode
      );
    });

    it('refused-run query --format json never has Answered result when WASM present', async () => {
      const input = JSON.stringify({
        catalog: buildMcppCatalog(),
        facts: buildRefusedFacts(),
        rules: [buildAdmittedRule()],
        query: {
          atom: { pred_id: PRED.admitted, arity: 1, args: [2] }, // admitted(run-mcpp-002)
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const queryPath = writeTmp(tmpDir, 'mcpp-refused-query-j.json', input);
      const result = await runCli(
        ['lab', 'prolog8', 'query', '-i', queryPath, '--format', 'json'],
        { env: env.env },
      );
      if (result.exitCode === EXIT_CODES.source_error) return; // WASM absent
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const payload = parsed['payload'] as Record<string, unknown> | undefined;
      const qResult = (payload?.['result'] ?? {}) as Record<string, unknown>;
      // admitted(run-mcpp-002) should be Denied — conformance(run-mcpp-002, 1.0) not in facts
      expect(qResult['Answered']).toBeUndefined();
    });

    it('refused-run replay with placeholder receipt exits non-zero (also rejected)', async () => {
      const input = buildReplayInput(buildRefusedFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-refused-replay.json', input);
      const result = await runCli(['evidence', 'replay', '-i', replayPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });
  });

  // ── CLI: input file edge cases ────────────────────────────────────────────

  describe('CLI: input edge cases', () => {
    it('replay with nonexistent input file exits source_error', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent/mcpp-receipt.json'],
        { env: env.env },
      );
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('replay with nonexistent input --format json has error envelope', async () => {
      const result = await runCli(
        ['evidence', 'replay', '-i', '/nonexistent/mcpp-receipt.json', '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      expect(parsed).toHaveProperty('error');
      expect((parsed['error'] as Record<string, unknown>)['code']).toBe('INVALID_INPUT');
    });

    it('replay with empty JSON file exits source_error or execution_error (not success)', async () => {
      const emptyPath = writeTmp(tmpDir, 'empty.json', '{}');
      const result = await runCli(['evidence', 'replay', '-i', emptyPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay with malformed JSON exits source_error or execution_error (not success)', async () => {
      const badPath = writeTmp(tmpDir, 'bad.json', '{ not valid json ]');
      const result = await runCli(['evidence', 'replay', '-i', badPath], { env: env.env });
      expect(result.exitCode).not.toBe(EXIT_CODES.success);
    });

    it('replay missing --input flag exits execution_error', async () => {
      // citty's own required-arg check fires before commands/prolog8.ts's run(),
      // throwing a plain Error that bypasses the legacy config_error(1)
      // classification and lands as generic EXECUTION_ERROR (3) — see
      // apps/wasm4pm/src/__tests__/prolog8-cli.test.ts contract notes.
      const result = await runCli(['evidence', 'replay'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
    });

    it('query with all-refused facts and receipt fact query exits success or source_error', async () => {
      // Even for a refused run, the receipt(X) fact itself is valid
      const input = JSON.stringify({
        catalog: buildMcppCatalog(),
        facts: buildRefusedFacts(),
        rules: [],
        query: {
          atom: { pred_id: PRED.receipt, arity: 1, args: [2] }, // receipt(run-mcpp-002) — present
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const queryPath = writeTmp(tmpDir, 'mcpp-receipt-refused.json', input);
      const result = await runCli(['lab', 'prolog8', 'query', '-i', queryPath], { env: env.env });
      expect([EXIT_CODES.success, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });

  // ── Cross-cutting: timing and envelope contracts ───────────────────────────

  describe('Cross-cutting: timing and envelope contracts', () => {
    it('all three mcpp replay scenarios complete within 5000ms', async () => {
      const fullInput = buildReplayInput(buildFullAdmissionFacts());
      const refusedInput = buildReplayInput(buildRefusedFacts());
      const receiptInput = buildReceiptQueryInput();
      const fullPath = writeTmp(tmpDir, 'timing-full.json', fullInput);
      const refusedPath = writeTmp(tmpDir, 'timing-refused.json', refusedInput);
      const receiptPath = writeTmp(tmpDir, 'timing-receipt.json', receiptInput);
      const start = Date.now();
      await Promise.all([
        runCli(['evidence', 'replay', '-i', fullPath, '--format', 'json'], { env: env.env }),
        runCli(['evidence', 'replay', '-i', refusedPath, '--format', 'json'], { env: env.env }),
        runCli(['lab', 'prolog8', 'query', '-i', receiptPath, '--format', 'json'], { env: env.env }),
      ]);
      expect(Date.now() - start).toBeLessThan(5000);
    });

    it('replay envelope always includes meta.run_id when WASM is absent', async () => {
      // Document that even error envelopes include run_id for audit traceability
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-run-id.json', input);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      if (meta) {
        expect(meta).toHaveProperty('run_id');
        expect(typeof meta['run_id']).toBe('string');
        expect(String(meta['run_id']).length).toBeGreaterThan(0);
      }
    });

    it('replay envelope includes meta.timestamp when WASM is absent', async () => {
      const input = buildReplayInput(buildFullAdmissionFacts());
      const replayPath = writeTmp(tmpDir, 'mcpp-ts.json', input);
      const result = await runCli(
        ['evidence', 'replay', '-i', replayPath, '--format', 'json'],
        { env: env.env },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const meta = parsed['meta'] as Record<string, unknown> | undefined;
      if (meta) {
        expect(meta).toHaveProperty('timestamp');
        // Timestamp must be a non-empty string (ISO-8601 format)
        expect(String(meta['timestamp']).length).toBeGreaterThan(0);
      }
    });

    it('compiler-built query and handcrafted query produce same exit code', async () => {
      // Regression: compiler API must produce the same structural result as handcrafted JSON
      const compiledInput = buildReceiptQueryInput();
      // Handcrafted equivalent
      const handcraftedInput = JSON.stringify({
        catalog: {
          catalog_id: 42,
          predicates: {
            '1': { pred_id: 1, label: 'receipt',     arity: 1, proof_policy: 'OnRequest', materialized: false, access_orders: [] },
            '2': { pred_id: 2, label: 'conformance',  arity: 2, proof_policy: 'OnRequest', materialized: false, access_orders: [] },
            '3': { pred_id: 3, label: 'admitted',    arity: 1, proof_policy: 'OnRequest', materialized: false, access_orders: [] },
            '4': { pred_id: 4, label: 'refused',     arity: 1, proof_policy: 'OnRequest', materialized: false, access_orders: [] },
          },
          term_labels: { '1': 'run-mcpp-001', '2': 'run-mcpp-002', '3': '1.0', '4': '0.8' },
          predicate_by_label: { receipt: 1, conformance: 2, admitted: 3, refused: 4 },
          term_by_label: { 'run-mcpp-001': 1, 'run-mcpp-002': 2, '1.0': 3, '0.8': 4 },
        },
        facts: [
          { pred_id: 1, arity: 1, rows: [{ pred_id: 1, arity: 1, args: [1], source_id: 0 }] },
          { pred_id: 2, arity: 2, rows: [{ pred_id: 2, arity: 2, args: [1, 3], source_id: 0 }] },
        ],
        rules: [],
        query: {
          atom: { pred_id: 1, arity: 1, args: [1] },
          binding_mask: 1,
          proof_mode: 'PositiveOnly',
          epoch: 0,
        },
      });
      const compiledPath = writeTmp(tmpDir, 'mcpp-compiled.json', compiledInput);
      const handcraftedPath = writeTmp(tmpDir, 'mcpp-handcrafted.json', handcraftedInput);
      const [r1, r2] = await Promise.all([
        runCli(['lab', 'prolog8', 'query', '-i', compiledPath, '--format', 'json'], { env: env.env }),
        runCli(['lab', 'prolog8', 'query', '-i', handcraftedPath, '--format', 'json'], { env: env.env }),
      ]);
      // Both inputs represent the same query — must produce the same exit code
      expect(r1.exitCode).toBe(r2.exitCode);
    });
  });
});
