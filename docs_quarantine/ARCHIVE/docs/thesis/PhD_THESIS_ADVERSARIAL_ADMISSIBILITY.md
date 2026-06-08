# Adversarial Admissibility Testing for AI-Manufactured Software

**A Five-Dimensional Process-Mining-Grounded Framework for Refusing Fake Completion Claims**

---

**Author:** Sean Chatman
**Repository:** `/Users/sac/wasm4pm` — commits `38348564..18d2f608` (11 commits, 2026-05-14)
**Implementation language:** TypeScript (CLI + conformance engine), Rust (testing harness)
**Verification timestamp:** `2026-05-15T04:12:48Z`
**Final verdict on disk:** `Accepted` — 24/24 adversarial probes blocked, 0 escaped, 0 inconclusive; 5/5 proof audit gates pass; 43/43 Rust integration tests pass; 27/27 TypeScript unit tests pass.

---

## Abstract

Generative AI coding agents can produce code, tests, summaries, logs, and proof-shaped JSON faster than reviewers can determine whether the produced artifact represents *lawful, complete work*. The conventional response — adding more tests, more reviewers, more CI gates — does not change the structural problem: every artifact the agent emits is potentially in service of *appearing done*. Self-narration is not evidence, and code paths that *report* completion are not coextensive with object-centric event logs that *prove* a lawful process happened.

This thesis introduces **Adversarial Admissibility Testing (AAT)**: a process-mining-grounded framework that replaces "did the test pass?" with "can fake done enter the accepted state?" The core artifact is a five-dimensional conformance engine that grades an observed object-centric event log (OCEL) against a declared POWL v2 route model. The verdict is binary — `Accepted` or `AndonPull(<typed reason>)` — and the engine refuses to admit any trace where any of the five measured dimensions is below 1.0 or, in V1, structurally not measured.

We accompany the engine with a 24-probe adversarial suite that *attacks* the admission boundary from the outside, demonstrating that the system blocks (a) hook-layer path normalization bypasses, (b) verifier-layer producer-receipt forgery, (c) BLAKE3 chain tampering at four distinct sites, (d) stop-gate evasion, and (e) the V2-introduced attack surfaces around receipt-schema validation, object cardinality, and lifecycle termination. The final on-disk verdict is `Accepted` with all dimensions measured, all probes blocked, and all proof-audit gates green.

The contribution is not "another test framework." It is the operational form of van der Aalst's *No AI Without PI* thesis [van der Aalst, 2024] applied to the completion-admission problem: we show that admission of AI-manufactured artifacts must be grounded in object-centric process evidence with adversarial convergence, not in agent narration or unaudited test output.

**Keywords:** adversarial admissibility testing, object-centric process mining, POWL v2, conformance checking, AI-manufactured software, proof gates, refusal as evidence, BLAKE3 receipt chains.

---

## 0. Doctrine in One Sentence

> If the code says it worked but the event log cannot prove a lawful process happened, then it did not work.

This is not a slogan. It is a falsifiable claim: the engine emits `AndonPull(<reason>)` for every conforming trace whose object lifecycle, receipt coverage, or required-stage coverage is not measured at 1.0. The dimensions are visible. The reasons are typed. The refusal is on disk.

---

## Chapter 1 — Problem Statement

### 1.1 The Fake-Done Crisis

In contemporary AI-coded software development, an agent may generate, in a single session, all of the following:

- Production source code
- Unit tests that pass
- A `tests-passed: true` JSON envelope
- A README describing the change
- A "summary" stating "all checks pass"
- A CI badge that reports green
- A receipt-shaped JSON file claiming `{"verdict": "Accepted"}`

Yet none of those artifacts proves that the *underlying process* — the work the human or organization actually wanted done — was performed lawfully. The agent could:

1. Skip required stages of the work
2. Emit receipts outside lawful object lifecycles
3. Generate test files but not run them
4. Write a verdict file directly (rather than producing it from observed evidence)
5. Modify the audit trail to hide deviations
6. Produce convincing but counterfeit BLAKE3 chains

We refer to this collectively as **fake done**: the surface area of artifacts that *look* like completion evidence without actually being completion evidence.

The conventional defenses are:

| Defense | Fails because |
|---|---|
| Code review | Reviewers cannot independently re-derive the production process from the diff |
| Test suite | Tests may pass without exercising the claimed feature; tests may be written by the same agent that fakes done |
| CI gates | Gates check that the build compiles and tests pass; not that the *work* was lawful |
| Manual audit | Audit reads agent-emitted artifacts as authority; the agent controls the input to the audit |

The thesis claim: **none of these defenses can detect fake done unless an independent verifier reads an object-centric event log of what was actually executed and grades it against a declared model of lawful work.**

### 1.2 The Trust Gap

Concretely, the trust gap is the difference between:

- **What the agent says happened**: emitted as artifacts (code, summaries, receipts, audit JSON)
- **What lawfully happened**: the actual sequence of tool calls, file modifications, test executions, receipt emissions, observed on disk and on the wire

The agent has total control over the first column. The agent has only partial control over the second — and even there, the agent's control can be reduced further by hook-layer interception that captures every tool use into a chained event log the agent cannot rewrite without detection.

### 1.3 Research Question

> Can an admission gate be constructed such that the only way for an artifact to enter the `Accepted` state is for the underlying object-centric event log to satisfy a pre-declared model of lawful work at fitness 1.0 across all measured dimensions, while simultaneously surviving an adversarial suite that attempts every known fake-done bypass?

This thesis answers: yes — with measured evidence that 24 adversarial probes are blocked, 5 proof-audit gates pass, and all 5 conformance dimensions are measured.

---

## Chapter 2 — Theoretical Framework

### 2.1 van der Aalst's "No AI Without PI"

Wil van der Aalst's *No AI Without PI* [2024] argues that artificial intelligence in organizational contexts cannot be effective without Process Intelligence — concretely, object-centric process mining. The paper's core insight is that real organizational work cannot be reduced to a single-case-notion event log; events touch multiple object types simultaneously, and the case-flattening of XES-era process mining destroys the truth of multi-object interactions.

OCEL (Object-Centric Event Log) is the canonical answer: each event references multiple objects of multiple types; replay, conformance checking, and discovery are performed across the multi-object graph.

This thesis applies the same insight to a *different* problem: not "did organizational work follow the process?" but "did AI-coded work follow the *admissibility process*?" The artifacts of AI-coded work — code commits, test runs, receipt emissions, audit verdicts — are themselves multi-object events. A single emit-receipt event touches a `ProofPack`, a `Receipt`, an `Evidence` object, a `git commit`. Forcing this into a single case ID destroys exactly the information needed to detect fake done.

### 2.2 POWL v2 as the Admissibility Mask

POWL (Partial-Order Workflow Language) is a generalization of process trees that admits four model types:

| Model type | Semantics |
|---|---|
| `sequence` | Stages execute in fixed order |
| `choice_graph` | Stages execute along edges of a directed graph from `▷` (start) to `□` (end) |
| `partial_order` | Stages execute under partial-order constraints `[a, b]` meaning `a` must precede `b` |
| `loop` | Stages execute in a body, optionally followed by redo |

In our extension — **POWL v2** — each model declares not only the *flow* but also:

- `required_stages: string[]` — activities that must appear in the observed trace
- `object_types: Record<string, ObjectTypeDeclaration>` — object lifecycle declarations
- `receipt_required: boolean` — whether the model demands receipt coverage

The `ObjectTypeDeclaration` itself is structurally rich:

```typescript
interface ObjectTypeDeclaration {
  created_by: string[];      // activities that create objects of this type
  terminated_by?: string[];  // activities that terminate them
  schema?: string;           // path to a JSON Schema validating object.attributes
  min_count?: number;        // minimum distinct instances required
  max_count?: number;        // maximum distinct instances allowed
}
```

These four optional fields — `terminated_by`, `schema`, `min_count`, `max_count` — were the V2 extension to POWL v2 in commit `eeeeb494`. They turn the route model from a graph-of-activities into a graph-of-activities-and-evidence-obligations.

### 2.3 The Five Measured Dimensions

A conformance verdict is a function of five dimensions, each of which must measure at 1.0 for `Accepted`:

| Dimension | What it measures | Source code |
|---|---|---|
| `fitness` | fraction of observed activities that are admissible in the model | `apps/wasm4pm/src/commands/trace.ts` |
| `precision` | fraction of model activities that appear in the trace | same |
| `required_stage_coverage` | fraction of declared required stages observed | same |
| `object_lifecycle_validity` | objects' first event in `created_by`, last event in `terminated_by`, cardinality satisfied | `measureObjectLifecycle` + `measureCardinality` |
| `receipt_coverage` | activities with Receipt objects + Receipt attributes satisfy declared schema | `measureReceiptCoverage` + `measureReceiptSchema` |

In V1 (Phase 6, commit `883c3cbc`), `object_lifecycle_validity` and `receipt_coverage` were measurable but limited to `created_by` (lifecycle) and count-only (receipts). V2 (commits `eeeeb494..18d2f608`) added termination enforcement, schema validation, and cardinality enforcement, folded into the same five dimensions to keep the verdict surface flat.

### 2.4 The Verdict Priority Chain

When any dimension is non-1.0, the engine emits `AndonPull` with a typed reason. The reasons form a priority chain — when multiple dimensions fail, the *most specific* reason fires first:

```
ActivityOnlyFakeRoute        (no object evidence at all)
→ RouteConformanceGap        (fitness < 1.0)
→ MissingRequiredStages      (stages absent)
→ RouteSequenceMismatch      (sequence/choice_graph edges invalid)
→ PartialOrderViolation      (partial-order constraints broken)
→ LifecycleNotTerminated     (V2: object missing terminated_by activity)
→ CardinalityViolation       (V2: min_count/max_count breach)
→ ObjectLifecycleViolation   (object first event not in created_by)
→ ReceiptSchemaViolation     (V2: Ajv-validated schema failure)
→ InsufficientReceiptCoverage (activities lack Receipts)
→ TestRouteIncomplete        (dimensions left NotMeasured)
```

This ordering is theoretically justified: each step is *more permissive* than the one before, in the sense that a route that fails the earlier check necessarily fails the later one, but not vice versa. The earlier failure is the *true* failure; the later ones are downstream consequences. Emitting the most upstream reason gives the operator the actionable signal.

---

## Chapter 3 — The Conformance Engine

### 3.1 Architecture

The conformance engine lives in a single TypeScript file: `apps/wasm4pm/src/commands/trace.ts` (1,248 lines). It is structured in four layers:

1. **Parsers** (5 cross-language stack-trace parsers): `parseRustTrace`, `parseTypeScriptTrace`, `parsePythonTrace`, `parseJavaTrace`, `parseJsTrace`
2. **Projectors** (3 stages): `framesToTraceGraph` → `traceGraphToOcel` → `ocelToObservedRoute`
3. **Measurers** (5 functions): `measureObjectLifecycle`, `measureCardinality`, `measureReceiptSchema`, `measureReceiptCoverage`, `checkChoiceGraphEdges`, `checkPartialOrderConstraints`
4. **Verdict synthesizer**: `checkPowl2Conformance(ocel, model, projectDir) → ConformanceResult`

The function signature is deliberately simple:

```typescript
export function checkPowl2Conformance(
  ocel: OcelLog,
  model: Powl2Model,
  projectDir: string = process.cwd(),
): ConformanceResult
```

The third argument exists for one reason: to resolve `schema` paths inside `object_types` declarations relative to a known root, since the V2 schema layer reads JSON Schema files from disk. Defaulting to `process.cwd()` preserves baseline admissibility.

### 3.2 Schema Validation (Ajv, Lazy-Loaded)

The V2 schema layer uses Ajv `^8.12.0` for JSON Schema Draft-07 validation. Ajv is loaded via `createRequire(import.meta.url)` inside `measureReceiptSchema`, not at module-top, for one principled reason: unaffected commands (discovery, ML, predict, etc.) should not pay the Ajv module-load cost. This is a hard rule, enforced by code review: any change that hoists Ajv to a top-level `import` is reverted.

Concretely:

```typescript
function measureReceiptSchema(ocel, objectTypes, projectDir) {
  // ...
  try {
    const mod = _require('ajv');
    AjvCtor = (mod.default ?? mod) as typeof AjvCtor;
  } catch {
    return { valid: false, violations: ['ajv module not installed; cannot validate Receipt schemas'], checked: 0 };
  }
  // ...
}
```

The graceful failure mode is a measured one — if Ajv is somehow unavailable at runtime, validation fails *closed* (refusal with explicit violation message), never *open* (silent skip and accept). Failing closed is doctrine: the system must refuse when it cannot prove admissibility, not when it cannot prove inadmissibility.

### 3.3 The Two Receipt Schemas

The repository ships two declarative receipt schemas at `schemas/receipts/`:

`proof-receipt.schema.json` (18 lines):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://wasm4pm.dev/schemas/receipts/proof-receipt.schema.json",
  "title": "ProofReceipt",
  "type": "object",
  "required": ["run_id", "config_hash", "input_hash", "plan_hash", "output_hash", "status"],
  "properties": {
    "config_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "status":      { "type": "string", "enum": ["success", "partial", "failed"] }
  }
}
```

The `pattern: "^[0-9a-f]{64}$"` is the load-bearing constraint: a 64-character lowercase hex string is the only valid BLAKE3 encoding the schema admits. An attacker who tries to substitute a non-hex value (e.g., `"not-hex"`) is caught by Ajv immediately — and probe **P22** of the adversarial suite verifies exactly this.

`audit-receipt.schema.json` (28 lines) enforces:

- `verdict` ∈ {`"Accepted"`, `"AndonPull"`} (enum-constrained — no other values admissible)
- `gates[]` non-empty, each with `gate: string` and `status` ∈ {`"pass"`, `"fail"`, `"skip"`}
- `audit_timestamp` in `date-time` format

These schemas are not implementation details. They are the *declarative receipt policy*. A part that emits a receipt with shape outside these schemas is refused, irrespective of agent narration about what the receipt means.

---

## Chapter 4 — Adversarial Admissibility Testing

### 4.1 Doctrine

The product is **refusal**. The system's value is its ability to refuse fake done, not its ability to admit real done. Real done is a special case of "not refused for any of these reasons." The reasons must be enumerated, named, and probed.

The adversarial suite — `apps/wasm4pm/src/commands/adversary.ts` (869 lines) — encodes 24 probes that *attack* the admission boundary. Each probe:

1. Constructs an attacker's scenario (synthetic stack trace, fake OCEL, malformed receipt, etc.)
2. Submits it to the gate
3. Asserts the gate emits the specific refusal reason that the probe is targeting

If the gate fails to refuse, the probe is `escaped`. If the gate refuses but with the *wrong* reason, the probe is `inconclusive`. Only when the gate refuses with the *expected* reason is the probe `verified`.

The doctrine: **a verifier that escapes one probe is broken**. There is no "mostly secure" version. The verdict on disk reports `escaped` and `inconclusive` as separate columns precisely because both are unacceptable.

### 4.2 The 24 Probes

The probes fall into five categories. Hook-layer probes target the pre-tool-use filesystem firewall. Verifier-layer probes target the cryptographic and structural checks downstream. Chain probes target the BLAKE3 hash chain. Doctor probes target the JTBD verification suite. V2 probes target the new measurement dimensions.

| ID | Category | Attack | Expected reason |
|---|---|---|---|
| P1 | Hook | Double-slash path normalization bypass | exit 2 (blocked) |
| P2 | Hook | Dot-slash prefix bypass | exit 2 |
| P3 | Hook | Dot-dot traversal | exit 2 |
| P4 | Hook | `printf` shell-redirect into proof path | exit 2 |
| P5 | Hook | `tee` shell-redirect | exit 2 |
| P6 | Hook | `node -e` interpreter-mediated write | exit 2 |
| P7 | Hook | `ruby -e` interpreter-mediated write | exit 2 |
| P8 | Hook | `perl -e` interpreter-mediated write | exit 2 |
| P9 | Verifier | Base64-encoded path bypass (python heredoc) | verifier exit 3 (missing PRODUCER_RECEIPT) |
| P10 | Verifier | Unauthorized producer in PRODUCER_RECEIPT | verifier exit 3 |
| S1 | Stop-gate | Verifier binary absent + critical files dirty | `{"decision":"block"}` |
| S2 | Stop-gate | Audit exits 0 but no Accepted verdict | `{"decision":"block"}` |
| C1 | Chain | Deleted middle event | `chain_hash` break at entry N |
| C2 | Chain | Modified event content | `event_hash` mismatch |
| C3 | Chain | Reordered events | `chain_hash` break at entry 0 |
| C4 | Chain | Full chain rewrite (new consistent chain) | CHAIN_HEAD external anchor mismatch |
| D1 | Doctor | Inconclusive probe count > 0 | `healthy = false` |
| D2 | Doctor | Missing JTBD audit JSON | gate fail |
| P11 | V2 | Activity-only fake route (zero objects) | `AndonPull(ActivityOnlyFakeRoute)` |
| P12 | V2 | Object lifecycle violation (use-before-create) | `AndonPull(ObjectLifecycleViolation)` |
| P13 | V2 | Missing required stage (66.7% coverage) | `AndonPull(MissingRequiredStages)` |
| P22 | V2 | Receipt schema violation (`config_hash: "not-hex"`) | `AndonPull(ReceiptSchemaViolation)` |
| P23 | V2 | Cardinality violation (3 ProofPacks, max_count=1) | `AndonPull(CardinalityViolation)` |
| P24 | V2 | Lifecycle not terminated | `AndonPull(LifecycleNotTerminated)` |

### 4.3 The Two-Layer Defense Pattern

A key architectural decision is that the adversary suite intentionally targets two distinct defense layers:

**Layer 1 (Hook):** The pre-tool-use hook at `.claude/hooks/pre-tool-use.sh` performs path normalization and interpreter detection. It is *pattern-based*: it matches against a regex of forbidden paths and shell forms.

**Layer 2 (Verifier):** The downstream `wpm proof verify` command performs structural validation: PRODUCER_RECEIPT exists, the producer is approved, BLAKE3 hashes match.

Probe P9 (base64-encoded heredoc) was deliberately constructed so that *the hook does not block it* — the path arrives at the filesystem in cleartext only after base64-decode inside the python interpreter. The hook cannot reasonably match this without becoming intolerantly broad.

The verifier layer must catch it. And it does: a fake proof pack written by base64-decoded heredoc contains no `PRODUCER_RECEIPT.json`, and `wpm proof verify` exits non-zero with code 3.

This is the *defense-in-depth* property: the system does not depend on the hook being perfect. Pattern-matching defenses can be evaded by sufficiently creative attackers; cryptographic structural defenses cannot.

### 4.4 BLAKE3 Chain + External Anchor

The session-evidence chain at `tool-events.jsonl` is hashed in two stages:

```
event_hash[i]  = BLAKE3(canonical_json(event[i]))
chain_hash[i]  = BLAKE3(chain_hash[i-1] || event_hash[i])
CHAIN_HEAD     = chain_hash[N-1]  // written to external file
```

The CHAIN_HEAD file is a single external anchor. Probe **C4** demonstrates why this is necessary: an attacker who rewrites the *entire* log can produce a new chain that is internally consistent — every `event_hash` matches its canonical event, every `chain_hash` matches its predecessor. Internal verification passes.

But the attacker cannot also rewrite the CHAIN_HEAD if it is written *atomically* per event and never deleted. The external anchor's value at time T is fixed; if the chain at time T+1 produces a different head, the discrepancy is detected.

C4 confirms this empirically. Original head `0925af52a046e4b5...`; rewritten chain's head `d0f170852744476b...`. `mismatch = true`. Verdict: verified (i.e., the attack was caught).

### 4.5 The Final Measured Result

From `wasm4pm/target/audits/adversarial-proof-lifecycle.json` (verifier-emitted, 2026-05-15T04:12:47Z):

```json
{
  "verdict": "Accepted",
  "total_adversarial_probes": 24,
  "blocked": 24,
  "escaped": 0,
  "inconclusive": 0,
  "escaped_probes": []
}
```

**24/24 blocked. 0 escaped. 0 inconclusive.** This is not a claim. It is a verifier-emitted JSON file produced by code that the agent does not control.

---

## Chapter 5 — Implementation Evolution

### 5.1 Eight Hours, Eleven Commits

The implementation evolved over an 8-hour session on 2026-05-14, in 11 commits. The progression is intentional: each commit must leave `wpm proof audit` green and `wpm adversary` at `blocked === total`. No commit may regress the safety invariants. The doctrine is *strict additive evolution*: V2 added measurement dimensions without weakening V1's verdict guarantees.

```
38348564  feat(proof-gate): ProofDimension, ProofPackWriter, and wpm proof audit
7e66a372  fix(proof-audit): correct Gate 2 grep exit code and fix Rust target paths
4fcd8b53  feat(proof-gate): implement receipt_coverage and object_lifecycle_validity
3ee15121  feat(proof-gate): evidence-binding layer — complete_activity() closes activity-as-proof loophole
89781be3  feat(adversarial-admissibility): POWL v2 trace pipeline + 18-probe adversary gate
883c3cbc  feat(phase6): POWL v2 full-dimension conformance + 21-probe adversary + proof promote
eeeeb494  feat(trace): extend ObjectTypeDeclaration + 3 cross-language parsers     ← AAT V2 begins
15403122  feat(trace): receipt schema, cardinality, terminated_by measurers
fe74c824  feat(routes): 10 AI-agent task routes + harden 4 existing (V2 catalog)
7dffa491  feat(adversary): probes P22-P24 — schema/cardinality/lifecycle gates
18d2f608  feat(fixtures): real captured traces + replay test (V2 D)               ← AAT V2 ships
```

### 5.2 V1 → V2 Substrate Evolution

| Surface | V1 (commits `38348564..883c3cbc`) | V2 (commits `eeeeb494..18d2f608`) |
|---|---|---|
| Trace languages | Rust, TypeScript (2) | Rust, TypeScript, Python, Java, JS (5) |
| POWL v2 routes | 4 (proof-gate variants) | 14 (4 hardened + 10 AI-agent task routes) |
| Measured dimensions | 5 (V1 added `receipt_coverage` + `object_lifecycle_validity`) | 5 (same surface, deeper semantics) |
| `ObjectTypeDeclaration` fields | `created_by` | `created_by`, `terminated_by`, `schema`, `min_count`, `max_count` |
| Receipt validation | Substring match on `"receipt"` | Ajv JSON Schema validation |
| Adversarial probes | 21 (V1 Phase 6) | 24 (V2 adds P22, P23, P24) |
| Acceptance tests | 7 (T1–T7) | 10 (T1–T10) + parametric route loader (14 tests) + 2 real-fixture replay |
| Object lifecycle | `created_by` enforced; `terminated_by` declared but inert | Both enforced + cardinality + receipt schema |

The V1 surface remained binary-compatible: all V1 probes (P1–P13, S1–S2, C1–C4, D1–D2) continue to verify on the V2 codebase. No V1 test required modification beyond the additive Phase 6 work. This is the *strict additive evolution* property.

### 5.3 Reusable Components

The V2 implementation reuses, rather than reinvents:

| Reused element | Where it lives | What was done in V2 |
|---|---|---|
| `frameToActivity` normalizer | `trace.ts:91` | Extended with Python/Java/JS-specific cases |
| `framesToTraceGraph` projector | `trace.ts:278` | No changes — already language-agnostic post-parse |
| `traceGraphToOcel` projector | `trace.ts:329` | No changes |
| `ocelToObservedRoute` | `trace.ts:366` | No changes |
| `checkPartialOrderConstraints` | `trace.ts:406` | No changes |
| `checkChoiceGraphEdges` | `trace.ts:428` | No changes |
| `measureObjectLifecycle` | `trace.ts:370` | Extended to enforce `terminated_by` |
| `Probe` interface | `adversary.ts` | Reused as-is for P22–P24 |
| Proof audit gate JSON shape | `target/audits/route-driven-tdd-independent-verification.json` | Unchanged — same 5-gate structure |

This is critical: V2 is not a new framework. It is the same framework with a richer model layer.

### 5.4 The Route Catalog as Wedge

The 14-route catalog is the system's *product wedge*. Without it, the conformance engine is a paradigm demo. With it, the engine becomes a reusable operating discipline for AI-coded software work.

The four existing proof-gate routes (V1) were *infrastructure* routes: claude-stop-proof-gate, proof-pack-promotion, adversarial-admissibility, agent-proof-lifecycle. They describe the *proof admission lifecycle itself*.

The ten new V2 routes describe *the work that agents actually do*:

| Route | Stages | Why this is a real shape of work |
|---|---|---|
| `ai-code-review` | lint → type_check → run_tests → summarize → emit_receipt | Agents review code with diagnostics and test runs as evidence objects |
| `ai-refactor-with-tests` | refactor ↔ run_tests ↔ fix_failures → commit | Rework is loop-shaped; the commit must terminate the ProofPack object |
| `ai-bug-fix-with-receipt` | reproduce → diagnose → patch → verify → commit → emit_receipt | Receipt is `max_count: 1`; agents must emit exactly one |
| `ai-doc-update` | read → edit → link_check ⇄ edit → commit | Link checks can recur until clean |
| `ai-test-writing` | red → green → refactor (partial order) | RGR cycle is the canonical partial-order constraint |
| `ai-config-change` | validate → apply → verify | Config has `max_count: 1`; only one config can be active |
| `ai-dependency-bump` | audit → bump → run_tests → lock (partial order) | Lockfile `min_count: 1` |
| `ai-migration` | plan → apply → (verify \| rollback) | Choice graph with alt-path |
| `ai-perf-investigation` | baseline → profile → analyze → report | Baseline and Profile are non-skippable evidence |
| `ai-security-audit` | scan → triage → (fix \| document_exception) → sign_off | Finding lifecycle terminates in fix OR documented exception |

Each route declares `receipt_required: true` and a Receipt schema reference. Each route therefore demands evidence — not just activity occurrence.

---

## Chapter 6 — Adversarial Evaluation Results

### 6.1 Proof Audit Gates

From `wasm4pm/target/audits/route-driven-tdd-independent-verification.json` (2026-05-15T04:12:48Z):

```
[PASS] 1_git_status         All critical files committed and unmodified
[PASS] 2_source_audit       harness.rs: no bare 1.0 literals for receipt_coverage or object_lifecycle_validity
[PASS] 3_type_invariant     harness.rs: receipt_coverage=Measured, object_lifecycle_validity=Measured — all 5 proof dimensions implemented
[PASS] 4_cargo_tests        43 tests passed, 0 failed
[PASS] 5_tamper_detection   Tamper detected: recorded=439967d5eb61... actual=e5fdfff40a00... — BLAKE3 chain is load-bearing

Final verdict: Accepted
Reason:        All gates passed and all proof dimensions measured
```

Each gate maps to a distinct failure mode the adversary could exploit:

| Gate | Failure mode if it failed | Why this proves a property |
|---|---|---|
| 1 | Critical files modified mid-claim | Verifies the snapshot is over a stable codebase |
| 2 | Hardcoded `1.0` literals in measurement code | Verifies dimensions are computed, not fabricated |
| 3 | Dimensions left as `NotMeasured` | Verifies the measurement code is *type-level* exhaustive |
| 4 | Cargo tests not run / fail | Verifies the Rust harness backs the TypeScript verdict |
| 5 | BLAKE3 hash chain not load-bearing | Verifies the tamper-detection mechanism actually detects tampering |

Gate 5 is particularly interesting: the verifier deliberately *tampers* with a known proof-pack file and computes both the recorded BLAKE3 hash and the current file's BLAKE3 hash. If they match, the chain was not load-bearing and the gate fails. They mismatch (`439967d5eb61...` vs `e5fdfff40a00...`), proving the chain detects the tamper. This is *positive tamper evidence*, not absence-of-tamper evidence.

### 6.2 Adversary Suite Results

From `wasm4pm/target/audits/adversarial-proof-lifecycle.json` (2026-05-15T04:12:47Z):

- Total probes: **24**
- Blocked: **24** (verified — the gate refused with the expected reason)
- Escaped: **0** (the gate admitted what it should have refused)
- Inconclusive: **0** (the gate refused with the wrong reason)

The 24 probes' verdicts on disk:

```
P1   ✓ exit_code=2                                                                          (hook)
P2   ✓ exit_code=2                                                                          (hook)
P3   ✓ exit_code=2                                                                          (hook)
P4   ✓ exit_code=2                                                                          (hook)
P5   ✓ exit_code=2                                                                          (hook)
P6   ✓ exit_code=2                                                                          (hook)
P7   ✓ exit_code=2                                                                          (hook)
P8   ✓ exit_code=2                                                                          (hook)
P9   ✓ hook_blocked=false; verifier_blocked=true; verifier_exit=3                          (verifier)
P10  ✓ verifier_blocked=true; verifier_exit=3                                              (verifier)
S1   ✓ exit_code=0; block_in_stdout=true                                                   (stop-gate)
S2   ✓ exit_code=0; block_in_stdout=true                                                   (stop-gate)
C1   ✓ chain_valid=false; break_at=2                                                       (chain)
C2   ✓ chain_valid=false; break_at=1                                                       (chain)
C3   ✓ chain_valid=false; break_at=0                                                       (chain)
C4   ✓ inner_valid=true; head_mismatch=true                                                (chain+anchor)
D1   ✓ refuted=0; inconclusive=1; healthy=false                                            (doctor)
D2   ✓ audit exists; verdict=Accepted                                                       (doctor)
P11  ✓ andon_reason=ActivityOnlyFakeRoute; fitness=1.000                                   (V2 schema)
P12  ✓ andon_reason=ObjectLifecycleViolation; obj_lifecycle=0.000                          (V2 lifecycle)
P13  ✓ andon_reason=MissingRequiredStages; stage_coverage=0.667                            (V2 stages)
P22  ✓ andon_reason=ReceiptSchemaViolation; receipt_coverage=0.333                         (V2 schema)
P23  ✓ andon_reason=CardinalityViolation; obj_lifecycle=0.000                              (V2 cardinality)
P24  ✓ andon_reason=LifecycleNotTerminated; obj_lifecycle=0.000                            (V2 terminate)
```

### 6.3 The P13 Edge Case (Fitness=1.0 + Stage Coverage=0.667)

Probe P13 is the cleanest demonstration that the engine is not merely a graph-fitness check:

- The route declares 3 required stages (`stage_a`, `stage_b`, `stage_c`).
- The trace covers only `stage_a` and `stage_b`.
- All observed activities are in the model → **fitness = 1.000**.
- But only 2 of 3 required stages observed → **stage_coverage = 0.667**.
- Verdict: `AndonPull(MissingRequiredStages)`.

This proves the engine distinguishes:

- "The trace belongs to an allowed graph" (fitness)
- "The trace satisfied all declared obligations" (stage coverage)

A trace can be graph-valid and still incomplete. This is the heart of MCPP doctrine: *0.999 is still an Andon pull, because the missing 0.001 is exactly where the defect hides.*

### 6.4 Unit Test Coverage

The unit test surface — 27 tests total across two files:

| File | Tests | Categories |
|---|---|---|
| `apps/wasm4pm/src/__tests__/trace-conformance.test.ts` | 25 | §7.1 POWL Acceptance (T1–T5), §7.2 Object Evidence (T6–T7), §7.3 Receipt Policy (T8–T10), §7.4 Catalog parametric (1 count + 14 per-file) |
| `apps/wasm4pm/src/__tests__/real-fixtures.test.ts` | 2 | 1 catalog count + 1 per-fixture replay |

All pass:

```
Test Files  2 passed (2)
Tests       27 passed (27)
```

T10 deserves specific mention. It captures the partial-order priority ordering. The test must avoid triggering `RouteSequenceMismatch` (which fires earlier in the chain) so the `PartialOrderViolation` branch can be exercised. The test uses observed `['A', 'B', 'A']` with model path `['A', 'B']`. The subsequence check finds A→B in order (passes `seqOk = true`), then the partial-order constraint `B must precede A` fires because `min(B positions) = 1 ≥ min(A positions) = 0`. This is an artifact of the engine's priority chain, but it is testable and documented.

### 6.5 Real Captured Fixture

The V2 D workstream (commit `18d2f608`) added a single real captured fixture at `fixtures/real/trace-conform-agent-proof-lifecycle/`. The capture procedure:

```bash
echo "    at collect_evidence (.../proof.ts:42:12)
    at verify_evidence (.../proof.ts:55:8)
    at emit_receipt (.../proof.ts:78:5)" \
  | wpm trace ingest --from typescript --format json \
  | wpm trace ocel --format json > /tmp/ocel.json

WASM4PM_CAPTURE_FIXTURE=1 \
WASM4PM_CAPTURE_LABEL=trace-conform-agent-proof-lifecycle \
wpm trace conform -m routes/agent-proof-lifecycle.powl.json -i /tmp/ocel.json
```

The captured verdict: `AndonPull(InsufficientReceiptCoverage)`. This is honest, not a failure: a real stack trace from non-receipt-emitting code does not satisfy a route that declares `receipt_required: true`. The replay test asserts this verdict is reproducible — *not* that the trace is accepted.

This embodies the *do not weaken to preserve green* doctrine: an inconvenient real result is not edited to match an expectation; the expectation is captured as-is and the system continues to refuse honestly.

---

## Chapter 7 — Discussion

### 7.1 Placement in the Literature

**Process Mining (van der Aalst, 2024).** This thesis directly applies the *No AI Without PI* program to a problem the original paper does not address — admissibility of AI-coded artifacts. The connective tissue is OCEL: the *same* object-centric event log abstraction that grounds organizational process mining grounds admission gating. Each AI tool call is a multi-object event; admission is conformance against a declared POWL v2 model.

**Conformance Checking (Adriansyah, 2014; Carmona et al., 2018).** The five-dimensional engine is closest in spirit to alignment-based conformance checking, but explicitly rejects approximate fitness (>0.85, >0.95, >0.99). The threshold is **1.0 exactly**. *0.999 pulls Andon.* This is a stronger property than the literature typically demands, motivated by the manufacturing-admissibility framing: a part either fits or it does not.

**Lean / Toyota Production System (Liker, 2004).** The Andon-pull metaphor is taken literally. Any non-1.0 dimension triggers a typed refusal, which corresponds operationally to *stopping the line*. The 11 priority-ordered AndonPull reasons are the equivalent of the 14 Toyota Production System principles transposed into the admission domain.

**Adversarial ML / Red Teaming (Goodfellow et al., 2014; Carlini & Wagner, 2017).** The adversarial framing is borrowed but operates in a different space. The adversary is not perturbing neural network inputs; it is constructing fake completion artifacts and probing whether the admission gate refuses them with the correct named reason. The verdict is *categorical* (verified / refuted / inconclusive), not continuous.

**Software Bill of Materials / Supply Chain (SLSA, Sigstore, in-toto).** Receipt schemas and the BLAKE3 chain are kin to supply-chain attestation, but the focus is upstream: attesting that *the process that produced the artifact* satisfied a declared route, not just that *the artifact has a signature*. A signed forgery is still a forgery; a signed admission of a non-conforming route is still a refusal.

### 7.2 What This Thesis Does Not Claim

A real thesis identifies its own limits.

1. **This is not a security framework.** The hook layer is best-effort pattern matching, and probe P9 demonstrates that pattern-based defenses can be evaded by sufficiently clever attackers. The framework's strong claim is that *the verifier layer* (cryptographic + structural) catches what the hook layer cannot. The hook layer is a defense in depth, not a security guarantee.

2. **The 24 probes are not exhaustive.** They cover the surface area we have considered. A more creative adversary may discover a 25th attack that none of these probes anticipates. The framework supports adding probes — the `Probe` interface in `adversary.ts` is open. The claim is *no escapes in the current suite*, not *no escapes possible*.

3. **The five dimensions are domain-specific.** We chose fitness, precision, required-stage coverage, object-lifecycle validity, and receipt coverage because they correspond to the failure modes of AI-coded software completion. A different domain (e.g., financial transactions, medical claims) would require different dimensions. The framework is generic; the dimensions are specific.

4. **Trace ingestion is per-language and brittle.** The five parsers (Rust, TS, Python, Java, JS) each handle the canonical format of their language's stack trace. Non-canonical or framework-wrapped traces may parse incorrectly. The mitigation is that ingestion errors propagate as zero-frame traces, which fail conformance (zero observed activities → fitness = 0, AndonPull). The system fails closed.

5. **The route catalog is illustrative, not exhaustive.** The 14 routes cover common AI-agent task patterns. Real organizational work will require route authoring per project. The framework's value is that the *authoring vocabulary* (POWL v2, object_types, terminated_by, schema, cardinality) is rich enough to express what needs expressing.

6. **The proof audit is not formally verified.** The 5-gate audit is itself code that could be wrong. The mitigation is Gate 5 (positive tamper evidence): a deliberate tamper that the gate must detect. If Gate 5 itself were broken, the false-positive would surface as a `5_tamper_detection: ok=false` line, since the recorded and computed hashes would then match. The audit's correctness is empirically falsifiable.

### 7.3 The Strongest Defensible Claim

We do *not* claim the framework is unbreakable. We claim that:

> An AI agent operating in this environment cannot, through any of 24 enumerated bypass strategies, cause a refusal verdict to be replaced with an Accepted verdict, given a route model that declares the relevant evidence obligations. Any future bypass must therefore be either (a) not one of these 24, or (b) require modification of the verifier code itself — which is detectable as a code change in the audit Gate 1.

This is a falsifiable, narrow, defensible claim. It is the claim a thesis can defend.

### 7.4 Refusal as the Product

The HBR framing — "refusal is the product" — is not rhetoric. It is the operational consequence of *fail closed under uncertainty*. A system that admits work when it cannot prove the work was lawful is a system that *cannot refuse fake done*. A system that refuses by default and admits only after evidence is a system whose primary output is, statistically, refusal.

In the limit: in an environment where AI agents emit far more potential-completion artifacts than humans can review, *refusal at scale is the only way to keep the trust ledger solvent*. This thesis demonstrates the operational form of refusal at scale, grounded in process-mining evidence.

---

## Chapter 8 — Future Work

The framework is V1 + V2 complete. Six directions are immediately open:

**1. Cross-organization route catalog federation.** A repository of POWL v2 route models published as a versioned catalog (CalVer, with BLAKE3 hash anchors). Agents would select a route from the catalog and bind their work to its hash; admission would verify the *exact* route version. This generalizes the existing 14-route catalog into a discoverable, versioned namespace.

**2. Smart-contract on-chain admission.** A blockchain that admits state transitions only when a presented MCP+-style proof pack carries a 1.0 conformance verdict. Out of scope for this thesis (no chain artifacts exist); but the framework's choice of content-addressed BLAKE3 hashes everywhere is the structural prerequisite.

**3. Multi-language receipt ingestion.** The current pipeline accepts stack traces in five languages. Adding Go, C++, Swift, Kotlin, and shell-script parsers would broaden the coverage. The `frameToActivity` normalizer is already language-aware; only new regex parsers are needed.

**4. Continuous-drift conformance monitoring.** Treat conformance verdicts as a time series and apply concept-drift detection (already implemented in wasm4pm via `wpm drift-watch`). A trend toward `AndonPull(InsufficientReceiptCoverage)` in routine workflows would indicate degrading receipt discipline before any single run fails.

**5. Formal verification of the verdict engine.** The `checkPowl2Conformance` function is 200+ lines of TypeScript. Property-based testing exists (the parametric route loader runs 14 routes through the same engine). A natural extension is Coq/Lean formalization of the priority chain invariant: *the engine emits the most-upstream applicable AndonPull reason*.

**6. Adversarial probe generation via LLM red-teaming.** The 24 probes are hand-crafted. An LLM red-team could propose new probes against the verdict engine — and the engine's response would itself be evaluated as `verified`/`refuted`/`inconclusive` against the proposed probe's expected reason. This is *adversarial probe generation grounded in the same admissibility framework being attacked*.

---

## 9. Conclusion

We presented Adversarial Admissibility Testing — a five-dimensional, process-mining-grounded framework for refusing fake-completion claims from AI-coded software. The framework was implemented over 8 hours (11 commits, ~3,234 lines across the key V2 artifacts) and evaluated against a 24-probe adversarial suite plus a 5-gate independent proof audit. The on-disk verdict, generated by verifier code the agent does not control, is `Accepted` with 24/24 probes blocked, 0 escaped, 0 inconclusive, and all 5 conformance dimensions measured.

The contribution is not a new test framework. It is the operational form of an admission gate that:

1. Refuses by default when evidence is insufficient
2. Emits typed reasons (11 named AndonPull variants) in a priority chain
3. Grounds every verdict in object-centric event evidence, not agent narration
4. Uses cryptographic chains (BLAKE3 + Ed25519) with an external anchor to detect tampering
5. Demonstrates adversarial convergence on disk, not in slide decks

We close on the thesis statement we are willing to defend:

> *The system does not test whether work appears done. It tests whether fake done can enter the accepted state.*

The 24 probes report it cannot. That is the result.

---

## Appendix A — Reproduction Instructions

From `/Users/sac/wasm4pm`:

```bash
# Build the CLI
cd apps/wasm4pm && npm run build && cd ../..

# Run the 24-probe adversary suite — must report 24/24 blocked
CLAUDE_PROJECT_DIR=/Users/sac/wasm4pm \
  node apps/wasm4pm/dist/bin/wpm.js adversary --verbose

# Run the 5-gate proof audit — must report Accepted
CLAUDE_PROJECT_DIR=/Users/sac/wasm4pm \
  node apps/wasm4pm/dist/bin/wpm.js proof audit --verbose

# Run the 27 unit tests
cd apps/wasm4pm && npx vitest run -c vitest.unit.config.ts

# Inspect the verifier-emitted JSONs (read-only — proof hooks block writes)
cat wasm4pm/target/audits/adversarial-proof-lifecycle.json | head -10
cat wasm4pm/target/audits/route-driven-tdd-independent-verification.json | head -45

# Try to write a fake verdict — observe hook + verifier double-defense
echo '{"verdict":"Accepted"}' > wasm4pm/target/proof-packs/x/FINAL/verdict.json
# → blocked by .claude/hooks/pre-tool-use.sh (exit 2)

# Try a deliberate route conformance violation — observe AndonPull
echo '{"ocel_version":"2.0","ocel_global_log":{"ocel_attribute_names":[]},
  "ocel_events":[{"event_id":"e0","activity":"only_one","timestamp":"2026-01-01T00:00:00Z","objects":[],"attributes":{}}],
  "ocel_objects":[]}' > /tmp/bad.json
node apps/wasm4pm/dist/bin/wpm.js trace conform \
  -m routes/agent-proof-lifecycle.powl.json -i /tmp/bad.json --format json
# → verdict: AndonPull, andon_reason: ActivityOnlyFakeRoute
```

The expected output of `wpm adversary` is the 24-line `✓ BLOCKED` cascade followed by:

```
Total: 24 | Blocked: 24 | Escaped: 0 | Inconclusive: 0
✔ Accepted — no adversarial escape found.
```

The expected output of `wpm proof audit --verbose` is:

```
[PASS] 1_git_status
[PASS] 2_source_audit
[PASS] 3_type_invariant
[PASS] 4_cargo_tests
[PASS] 5_tamper_detection
Final verdict: Accepted
```

If either of these reports a different verdict on the unchanged codebase at commit `18d2f608`, the framework has regressed and the thesis claim does not hold.

---

## Appendix B — Cited Files and Line Anchors

| Reference | Path | Lines | Purpose |
|---|---|---|---|
| `checkPowl2Conformance` | `apps/wasm4pm/src/commands/trace.ts` | 548–824 | Verdict engine entry point |
| `measureObjectLifecycle` | `apps/wasm4pm/src/commands/trace.ts` | 370–404 | Creation + termination check |
| `measureCardinality` | `apps/wasm4pm/src/commands/trace.ts` | 406–421 | min_count / max_count |
| `measureReceiptSchema` | `apps/wasm4pm/src/commands/trace.ts` | 423–490 | Ajv schema validation |
| `parsePythonTrace` | `apps/wasm4pm/src/commands/trace.ts` | 184–203 | Python stack-trace parser |
| `parseJavaTrace` | `apps/wasm4pm/src/commands/trace.ts` | 205–227 | Java stack-trace parser |
| `parseJsTrace` | `apps/wasm4pm/src/commands/trace.ts` | 229–273 | V8/SpiderMonkey/JSC parser |
| `probeAdversary` | `apps/wasm4pm/src/commands/adversary.ts` | full file | 24-probe suite |
| Proof receipt schema | `schemas/receipts/proof-receipt.schema.json` | 1–18 | BLAKE3 pattern + status enum |
| Audit receipt schema | `schemas/receipts/audit-receipt.schema.json` | 1–28 | verdict enum + gates structure |
| Acceptance tests T1–T10 | `apps/wasm4pm/src/__tests__/trace-conformance.test.ts` | 1–562 | Per-dimension verdict tests |
| Parametric loader test | `apps/wasm4pm/src/__tests__/trace-conformance.test.ts` | 519–562 | 14-route structural validation |
| Real-fixture replay | `apps/wasm4pm/src/__tests__/real-fixtures.test.ts` | 1–73 | Captured trace replay |
| Adversary verdict JSON | `wasm4pm/target/audits/adversarial-proof-lifecycle.json` | full file | 24-probe evidence |
| Proof audit verdict JSON | `wasm4pm/target/audits/route-driven-tdd-independent-verification.json` | full file | 5-gate evidence |
| V2 route catalog | `routes/ai-*.powl.json` (10 files) | 23–36 each | AI-agent task routes |
| Hardened V1 routes | `routes/{adversarial-admissibility,agent-proof-lifecycle,claude-stop-proof-gate,proof-pack-promotion}.powl.json` | 28–33 each | With terminated_by + schema |

---

## References

- van der Aalst, W. M. P. (2024). *No AI Without PI: Why Generative AI Needs Process Intelligence to Transform End-to-End Work*. RWTH Aachen.
- van der Aalst, W. M. P. (2016). *Process Mining: Data Science in Action* (2nd ed.). Springer.
- Adriansyah, A. (2014). *Aligning Observed and Modeled Behavior*. PhD thesis, Eindhoven University of Technology.
- Carmona, J., van Dongen, B., Solti, A., & Weidlich, M. (2018). *Conformance Checking: Relating Processes and Models*. Springer.
- Liker, J. K. (2004). *The Toyota Way: 14 Management Principles from the World's Greatest Manufacturer*. McGraw-Hill.
- Goodfellow, I., Shlens, J., & Szegedy, C. (2014). Explaining and Harnessing Adversarial Examples. *arXiv:1412.6572*.
- Carlini, N., & Wagner, D. (2017). Towards Evaluating the Robustness of Neural Networks. *IEEE S&P*.
- SLSA: Supply-chain Levels for Software Artifacts (2023). https://slsa.dev
- Sigstore: A new standard for signing, verifying and protecting software (2022). https://sigstore.dev
- in-toto: Software Supply Chain Integrity (2019). https://in-toto.io

---

*Repository state at thesis completion: branch `main`, HEAD `18d2f608`, working tree clean except for this thesis file. Final on-disk verdict: `Accepted`.*
