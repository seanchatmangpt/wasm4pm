# 00 — BUILD PLAN: the ggen Oracle (wasm4pm as judge of process POSSIBILITY)

**Status:** Master synthesis. The single authoritative build sequence across specs 01–08.
**Date:** 2026-05-30
**Version train:** `26.5.x` (workspace `26.5.29`, `/Users/sac/wasm4pm/Cargo.toml:7`). All new crates/modules use `version.workspace = true` — never re-introduce the `26.5.30` / `26.5.28` drift the structure map flagged (`00-STRUCTURE-MAP.md §7`).
**Reads:** `00-STRUCTURE-MAP.md` (ground truth), `GGEN-NEEDS.md` (ggen's requirements), specs `01`–`08`.
**Scope discipline:** spec-only. This document writes no Rust, no `Cargo.toml`, no standalone fixture. Every claim is grounded in the sibling specs, which are grounded in real `file:line` reads.

---

## 1. The vision (one paragraph)

wasm4pm today is a judge of process **history**: it discovers a model from a finished log, replays a finished trace, and audits a finished receipt envelope. The ggen oracle is the leap to a judge of process **possibility** — an **Andon oracle** that watches ggen's append-only OCEL tape (`/Users/sac/ggen/.ggen/ocel/agent-edit-events.ocel.jsonl`) and can say **STOP mid-trace** the instant a partial trace becomes impossible to lawfully complete: "`ReceiptEmitted` before `GatePassed`", "`RepairApplied` without a routed obligation", "a future-checkpoint event polluted the current gate", "this `ReceiptEmitted` has no causal predecessor." The oracle adjudicates ggen's 6-link living-loop law (`DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted`, emitted by `crates/ggen-lsp/src/intel/events.rs`) against authored checkpoint models, returns a stable `Admitted`/`Refused` verdict with `{code, severity, json_path, message}` findings (the existing `ReceiptDoctor` shape, `wasm4pm/src/receipt.rs:62-82`), and exits non-zero on refusal — the externalizable evidence ggen's Chicago-TDD subprocess tests assert on. The same engine retires ggen's duplicated PM stack: ggen keeps only its domain event builders and links one tiny `ocel-core` types crate; everything else — discovery, conformance, prefix-completability, variant governance, OCPQ, metrics — is consumed via the `wpm` CLI as an external oracle.

---

## 2. The ggen ↔ wasm4pm boundary (non-negotiable)

```
┌─────────────────────────────┐         ┌──────────────────────────────────────┐
│ ggen  (LOCAL law)           │         │ wasm4pm  (PROCESS law)                 │
│                             │         │                                        │
│ • diagnostic species/routes │         │ • discovery / conformance              │
│ • residual sets             │ LINKS   │ • prefix-completability (STOP mid-trace)│
│ • "this URI re-observed"    │ ocel-core│ • variant governance / leakage         │
│ • "this artifact must not   │ ───────▶│ • receipt + object causality           │
│    be written"              │ (types  │ • OCPQ law queries                     │
│ • EMITS the OCEL tape       │  only)  │ • manufacturing metrics + corpus       │
│   (intel/events.rs builders)│         │                                        │
└──────────────┬──────────────┘         └────────────────┬───────────────────────┘
               │  .ocel.jsonl  (append-only NDJSON tape)  │
               │  ──────────── subprocess ──────────────▶ │  wpm <verb> … --format json
               │  ◀──── stdout JSON + exit code ────────  │  (Admitted=0 / Refused≠0)
```

- **ggen LINKS exactly one crate: `ocel-core`** (`serde`+`serde_json`+`chrono` only, `crates/ocel-core/`). It uses `ocel-core` for the OCEL 2.0 **types** (so `intel/events.rs` builders construct `OCELEvent`/`OCELObject`/`OCELRelationship`) and to emit the tape. It never links the discovery/conformance/oracle logic.
- **wasm4pm is consumed as an external `wpm` CLI oracle** (subprocess + machine-readable JSON). This matches ggen's Chicago-TDD doctrine: real external boundary, externalizable evidence, exit-code adjudication (`GGEN-NEEDS.md §5`).
- **ggen asks; wasm4pm adjudicates.** ggen holds the *law* (query strings, checkpoint bindings, the `living-loop-6link.law.json`, `VariantPolicy` catalogs under `.ggen/oracle/`). wasm4pm holds the *evaluator* and returns the *verdict*. The law stays on ggen's side (RDF-is-truth); adjudication stays on wasm4pm's side.
- **The serialized-name constraint is load-bearing** (see §6). ggen's Gall proof tests grep the on-disk JSONL for `"activity":"DiagnosticRaised"`, the object-id substring, and the code `GGEN-TPL-001`. The oracle reconciles via `#[serde(alias="activity")]`, never by forcing ggen to rename.

---

## 3. Dependency DAG / build sequence

Spec **01** is the foundation: every other spec parses the OCEL that 01 produces. The DAG below is the strict build order. An arrow `A → B` means "B consumes a capability built in A."

```
                         ┌────────────────────────────────────────────┐
                         │ 01 — ocel-core + NDJSON intake (FOUNDATION) │
                         │  • serde alias activity→event_type (G1)     │
                         │  • fold_ndjson / TailPolicy / FoldReport    │
                         │  • wpm oracle ingest                        │
                         └───────────────┬────────────────────────────┘
                                         │ produces the canonical OCEL value
                                         │ + the serde-alias wire contract
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                 ▼                                 ▼
┌───────────────────┐         ┌───────────────────────┐         ┌──────────────────────┐
│ 02 — checkpoint   │         │ 03 — conformance +     │         │ 06 — receipt +       │
│ model registry    │────────▶│ discovery oracle       │         │ object causality     │
│ (the DECLARED law)│ supplies│ (history judge, done   │         │ (receipt = witness;  │
│ • CheckpointModel │ model_id│  correctly)            │         │  6-link ordering law)│
│   Descriptor      │ + DFG/  │ • flatten_ocel→EventLog│         │ • check_ordering_law │
│ • 6 checkpoint    │ Petri   │ • dfg_structural_diff  │         │ • ReceiptWitness     │
│   models          │ adapter │ • wpm oracle conform / │         │ • query_provenance   │
│ • wpm model …     │         │   discover-diff        │         │ • wpm oracle attest  │
└─────────┬─────────┘         └───────────┬────────────┘         └──────────┬───────────┘
          │ declared model +              │ ConformanceResult +              │ per-trace
          │ refusal/terminal/             │ per-trace verdict                │ verdicts +
          │ window-scope decls            │                                  │ object graph
          ▼                               ▼                                  │
┌───────────────────┐         ┌───────────────────────┐                     │
│ 04 — prefix /      │         │ 05 — variant           │                     │
│ online conformance │         │ governance + leakage   │                     │
│ (THE Andon leap)   │◀────────│ • enumerate_variants   │                     │
│ • OrderingLaw→DFA  │ shares  │ • VariantPolicy        │                     │
│ • completability   │ window/ │ • check_declare        │                     │
│   (reverse-BFS)    │ checkpt │ • L1/L2/L3 leakage     │                     │
│ • PrefixOracle     │ concept │ • wpm oracle variant / │                     │
│ • wpm oracle       │         │   leakage              │                     │
│   check / watch    │         └───────────┬────────────┘                     │
└─────────┬─────────┘                     │                                  │
          │ ALIVE/terminal definition     │ checkpoint window primitive      │
          │ + prefix-completability       │ + variant verdicts               │
          ▼                               ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 07 — OCPQ process-law query language (declarative FRONT-END to 03/04/05/06)           │
│   REQUIRE/FORBID/RESPONSE → DeclareModel ; PRESERVE/FORBID_GLOBAL_BEFORE → native eval │
│   FOR checkpoint = … (needs 05 window) ; ALIVE marker (needs 04) ; wpm ocpq            │
└───────────────────────────────────────────┬───────────────────────────────────────────┘
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ 08 — manufacturing metrics + bad-trace corpus (MEASUREMENT + REGRESSION over 03–07)   │
│   M1–M8 metrics ; CorpusLabel ; wpm metrics ; wpm corpus run ("Truthforge for law")   │
│   consumes per-trace verdicts from 03/04/06 ; andon_reason enum owned by 06            │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 What unlocks what (edge list)

| Edge | What flows | Citation |
|---|---|---|
| 01 → all | the canonical `OCEL` value + the `#[serde(alias="activity")]` wire contract; every sibling parses through `fold_ndjson` / `import_ocel_ndjson` | 01 §4, §5; consumed by 03 OQ5, 04 §7.2, 05 §8, 06 §2.1, 07 §4.3, 08 §1.2 |
| 02 → 03 | declared `model_id` + the checkpoint-model→`DFG`/`PetriNet` adapter (B7); turns mocked `wpm mining conformance` (`mining.rs:75 DFG::new()`) into a real load | 03 B7, §9 OQ2 |
| 02 → 04 | `terminal_states` / `non_completable_if` + `partial_order` — the authored law 04 compiles to a DFA; ALIVE-as-marking reconciliation | 02 §3.2, §8; 04 §6 |
| 02 → 05 | `VariantPolicy` storage + the diag-code→checkpoint fallback partition key | 05 §3.5, §8 |
| 02 → 06 | `model_digest` + the `Receipt` object lifecycle in `receipt_order_barrier_v1` | 02 §8; 06 §3 |
| 03 → 08 | `ConformanceResult` + per-trace verdict → metrics M4/M7 and corpus grading | 08 §2.1, §4 |
| 04 → 07 | the ALIVE / prefix-completability primitive for `FORBID … BEFORE …_ALIVE` | 07 T6, §11 OQ1 |
| 04 ↔ 05 | shared checkpoint/window concept; 04 exposes `PrefixContext.window_id`, 05 owns the windowing primitive (D9/D10 live in 05's domain) | 04 §5 (D9/D10), §13 OQ2; 05 §3.5 |
| 05 → 07 | the checkpoint-window primitive for `FOR checkpoint = …` | 07 T5, §11 OQ2 |
| 06 → 08 | the canonical `andon_reason` refusal enum (08 proposes names, 06 ratifies/owns) | 08 §8 OQ1 |
| 03/04/06 → 08 | per-trace `TraceVerdict` the corpus runner grades and the metrics aggregate | 08 §2.2, §3 |

### 3.2 The critical path (longest dependency chain)

```
01 (ocel-core + intake)  →  02 (registry + authored law)  →  04 (prefix DFA + completability)
   →  05 (window primitive)  →  07 (OCPQ FOR-scope + ALIVE)  →  08 (corpus regression grid)
```

03 and 06 are **parallelizable after 01** — they are the "history judge done correctly" and the "receipt-as-witness," and both are independently valuable first wins (each closes `GGEN-NEEDS.md §7` proof obligation #6 on its own axis). The structure map and specs 03/06 both flag the receipt-causality oracle (06) and the conformance wire-up (03) as the **smallest first patches** that turn a mocked surface into a real one.

---

## 4. Phased milestone plan (mapped to existing crates)

Crate dependency direction is fixed: `ocel-core` (leaf) ← `wasm4pm-types` ← `wasm4pm-algos` ← `wasm4pm` (engine) ← `wasm4pm-cli` (`wpm`). **All new oracle logic lands in `wasm4pm-algos` (pure Rust, no `wasm-bindgen`) or `wasm4pm-cli`** — never in the `wasm4pm` `cdylib` engine, so the oracle is reachable as a pure-Rust subprocess without a JS/WASM runtime (verified per 04 §12 A8, 07 §10 A7).

### Phase 0 — Foundation (spec 01)

| Lands in | Module / artifact | Spec |
|---|---|---|
| `crates/ocel-core/` | serde aliases on `OCELEvent`/`OCELRelationship` (G1–G3); `intake::fold_ndjson` + `TailPolicy` + `FoldReport` (G4–G6); fix version drift `26.5.30 → version.workspace` (G7) | 01 §3–§5 |
| `crates/wasm4pm-types/src/import/ocel/mod_ocel.rs` | `import_ocel_ndjson` delegates to `fold_ndjson_str`; delete dead `"name"` branch | 01 §5.5 |
| `crates/wasm4pm-cli/src/commands/` | `wpm oracle ingest` (emit `FoldReport` + OCEL summary JSON) | 01 §6 |
| `fixtures/real/ggen-living-loop-6link/` | native `.ocel.jsonl` + `expected-ocel.json` + `expected-ingest.json` + truncated-tail variant (G8) | 01 §8 |

**Exit gate:** ggen's native line deserializes into `OCELEvent`; re-serialization stays OCEL-2.0 (no `activity` leakage); on-disk grep constraint holds; `fold_ndjson` recovers all 6 activities + 4 object types; truncated tail tolerated; full `cargo test --workspace` green (01 §9 A1–A10).

### Phase 1 — Declared law + history judge (specs 02, 03, 06 in parallel after Phase 0)

| Lands in | Module / artifact | Spec |
|---|---|---|
| `wasm4pm/src/model_registry.rs` (extend) | `CheckpointModelDescriptor`, `bind_checkpoint`/`resolve_checkpoint`, `load_model_dir` (B1–B3); reconciled `living_diagnostic_clear_v1.pnml` (two repair transitions, ALIVE=terminal marking, B6) | 02 §3–§6 |
| `crates/wasm4pm-cli/src/commands/model.rs` | `wpm model register|list|show|validate|bind` | 02 §4.2 |
| `fixtures/models/` | 6 `*.checkpoint.json` descriptors + reconciled PNML | 02 §6 |
| `crates/wasm4pm-algos/src/` | `flatten_ocel_to_eventlog` (pure, 2.A; B1); `dfg_structural_diff` → `DiscoveryDiff` (B4); checkpoint-model → `DFG`/`PetriNet` adapter (B7) | 03 §5.1 |
| `crates/wasm4pm-cli/src/commands/oracle.rs` | `wpm oracle conform` + `wpm oracle discover-diff`; fix `wpm mining conformance` to load real model (B2, `mining.rs:75`) | 03 §5.2 |
| `crates/wasm4pm-algos/src/oracle/` | `ordering_law.rs` (`check_ordering_law`, B1); `receipt_witness.rs` (B2/B3/B4); `object_causality.rs` (§6 catalog, B5); lift `query_provenance` out of the `#[wasm_bindgen]` closure (`ocel_io.rs:258`) | 06 §4–§7 |
| `crates/ocel-core/src/intake.rs` | additive `ReceiptTruthRefusal` variants (`ReceiptBeforeGatePassed`, `ReceiptMissingPredecessor`, `RepairWithoutRoute`, …) | 06 §7.2 |
| `crates/wasm4pm-cli/src/commands/oracle.rs` | `wpm oracle receipt-causality | object-causality | attest` | 06 §7.3 |
| `fixtures/real/ggen-living-loop-conform/`, `…-receipt-causality/` | positive + negative fixtures (first impossible-OCEL fixtures in repo) | 03 §7; 06 §9 |

**Exit gate:** `wpm oracle conform` admits the clean 6-link tape (fitness 1.0, 0 deviating); the receipt-before-gate negative fixture refuses with `ReceiptBeforeGate`/`ReceiptBeforeGatePassed`; `wpm oracle attest` returns `Admitted` for ggen's real green tape — closing `GGEN-NEEDS.md §7` proof obligation #6 (03 §8, 06 §10).

### Phase 2 — The possibility leap (specs 04, 05)

| Lands in | Module / artifact | Spec |
|---|---|---|
| `crates/wasm4pm-algos/src/prefix_conformance/` | `OrderingLaw` + `compile()` → DFA with `q_DEAD` sink + reverse-BFS `completable` bitset; `PrefixOracle::{classify_prefix, observe, snapshot}`; detectors D1–D8; `check_tape`/`watch_tape` | 04 §6, §7 |
| `crates/wasm4pm-cli/src/commands/oracle.rs` | `wpm oracle check` (one-shot) + `wpm oracle watch` (tail, one `EarlyStop` JSON/line) | 04 §9.1 |
| `crates/wasm4pm-algos/src/{variant,declare_conformance,checkpoint}.rs` | `enumerate_variants`/`VariantSet`/`VariantPolicy`/`drift` (T1–T4); `check_declare` over `DeclareModel` (T5); `window_by_checkpoint` + L1/L2/L3 leakage rules (T6–T7) | 05 §3 |
| `crates/wasm4pm-cli/src/commands/oracle.rs` | `wpm oracle variant | leakage | signature` | 05 §4 |
| `fixtures/real/ggen-oracle-bad-prefix/`, `variant-*/`, `leakage-*/` | per-detector negative corpus + the happy-6link positive control | 04 §11; 05 §6 |

**Exit gate:** law compiles + completability exact; `01-receipt-before-gate` early-STOP fires at the `ReceiptEmitted` index; incremental `observe` == batch `classify_prefix`; each forbidden variant fixture refuses with its named `VariantRefusal`; the barrier law is replayable (removing the pre-ALIVE event makes the input Admitted — proves law, not hardcoded bool, 05 §7 #7). D9/D10 (cross-checkpoint detectors) are declared but explicitly deferred — 05 owns the window primitive; 04 only exposes the hook.

### Phase 3 — Declarative front-end + measurement (specs 07, 08)

| Lands in | Module / artifact | Spec |
|---|---|---|
| `crates/wasm4pm-algos/src/ocpq/` | EBNF parser (T1); `OcpqQuery` JSON-AST + compiler to `DeclareModel` (T2); object-scoped evaluator (T3–T6); `OcpqRefusal` (T8); resolve the `template` vs `constraint_type` field mismatch (`declare_conformance.rs:53` vs `models.rs:556`) in one coordinated patch | 07 §3–§5, §6.1 |
| `crates/wasm4pm-cli/src/commands/ocpq.rs` | `wpm ocpq -q '<query>' -i <log> --object-type --checkpoint -f json` | 07 §5 |
| `crates/wasm4pm-algos/src/{metrics,corpus}.rs` | M1–M8 + `ManufacturingMetricsReport` (B1/B2); `CorpusLabel` + corpus runner ("Truthforge for process law", B4/B6) — every ratio via `conformance::clamp_finite` | 08 §2, §4 |
| `crates/wasm4pm-cli/src/commands/{metrics,corpus}.rs` | `wpm metrics` + `wpm corpus run` | 08 §3 |
| `fixtures/real/ggen-living-loop/`, `ocpq-living-loop/` | the 9-scenario labeled corpus (5 already on disk + 4–6 new) | 08 §4; 07 §9 |

**Exit gate:** OCPQ Q1+Q2+Q3 admit ggen's real tape (closes `GGEN-NEEDS.md §7` #6 for the law direction); `wpm corpus run` reports N/N labels honored, `fake_live_catch_rate == 1.0`, and a deliberately mislabeled fixture forces a non-zero exit (anti-cheating, 08 §7 #4).

---

## 5. The cross-cutting acceptance gate

This is the **single end-to-end proof** that the whole oracle is real, spanning all phases. It has two halves, and **both** must pass:

### 5.1 Positive: ggen's real 6-link tape mine-conforms

ggen's emitted living-loop log (`DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted`, produced by `intel/events.rs`, not hand-authored) must, when handed to `wpm`, return `Admitted` across every oracle surface:

```bash
wpm oracle ingest   <tape> --format json          # 6 event types + 4 object types recovered      (01)
wpm oracle conform  <tape> --model living_diagnostic_clear_v1 -f json  # verdict Admitted, fitness 1.0  (03)
wpm oracle check    <tape> --law living-loop-6link.law.json -f json    # verdict Admitted (TERMINAL)     (04)
wpm oracle attest   <tape> --format json          # state Admitted, witnesses[].predecessors = all 6   (06)
wpm ocpq -q 'REQUIRE GatePassed BEFORE ReceiptEmitted; FORBID ReceiptEmitted WITHOUT GatePassed' -i <tape> -f json  # Admitted  (07)
wpm metrics         <tape> --format json          # andon_frequency 0.0, mean_repair_loop 1.0          (08)
```

This is `GGEN-NEEDS.md §7` proof obligation #6: *"demonstrate ggen's emitted 6-link living-loop log mines into a conforming process via wpm"* — proving ggen no longer needs its own `conformance.rs`/`dfg.rs`/`self_audit.rs`.

### 5.2 Negative: the bad-trace corpus is rejected correctly

The canonical corpus (08 §4 — 1 good + 8+ bad, the first impossible-OCEL fixtures in the repo) must be graded exactly:

```bash
wpm corpus run fixtures/real/ggen-living-loop --model gall-001-living-loop --format json
# valid_living_clear       → Accept   (AndonClear)
# receipt_before_gate      → Reject   (ReceiptBeforeGate)
# missed_clear             → Reject   (InsufficientReceiptCoverage)
# route_missing            → Reject   (RepairWithoutRoute)
# orphan_receipt           → Reject   (ReceiptWithoutPredecessor)
# checkpoint_leakage       → Reject   (FutureCheckpointLeak)
# … (all forbidden shapes) → Reject
# exit 0 iff EVERY label honored; non-zero if any bypassed
```

**Anti-cheating clause (08 §7 #4, mirrors `wpm receipt truthforge`):** a deliberately mislabeled fixture (label a bad trace `Accept`) MUST force a non-zero exit. The easy path must be the real path — faking acceptance is harder than running the real oracle.

**The gate is green only when 5.1 returns `Admitted`/exit-0 on every surface AND 5.2 returns the exact label for every corpus fixture.**

---

## 6. Coordination points back to ggen

Three classes of ggen-side coordination. **None may be a silent change** — each is a coordinated edit to ggen with its proof tests updated in the same change, citing `GGEN-NEEDS.md §3.1`.

### 6.1 The serialized-name constraint (zero ggen change — the lowest-risk path)

ggen's Gall proof tests (`crates/ggen-lsp/tests/ggen_tpl_001_stale_clear.rs`, `…_living_loop.rs`) grep the on-disk JSONL for `"activity":"DiagnosticRaised"`, the object-id substring (`item.tera`), and `GGEN-TPL-001`. The oracle reconciles **without** forcing a rename via serde aliases on the canonical `ocel-core` types (01 §4):

- `OCELEvent.event_type`: `#[serde(rename="type", alias="activity")]`
- `OCELEvent.time`: `#[serde(alias="timestamp")]`
- `OCELEvent.relationships`: `#[serde(alias="objects")]`
- `OCELEvent.id`: `#[serde(alias="event_id")]`
- `OCELRelationship.object_id`: `#[serde(rename="objectId", alias="id")]`

Aliases affect **deserialization only**; re-serialization stays OCEL-2.0 (`"type"`/`"time"`), so wasm4pm's own outputs are standard and ggen's tape on disk is unchanged. **This is `GGEN-NEEDS.md §3.1` option (a) and requires NO ggen-side rename.** Every sibling spec that re-serializes must honor it (01 §10, 04 §10, 05 §8, 07 §6.1).

### 6.2 Additive emission ggen MUST add (coordinated, additive-only)

For the deeper causality/leakage queries to be answerable, ggen must add fields/objects to `intel/events.rs` — all additive (extra `attributes` keys, extra `objects`/`relationships`), so no existing grep breaks (06 §5.3, B7):

| Addition | Needed by | Spec |
|---|---|---|
| object types `proof_lane`, `checkpoint`, `branch`, `commit` + their refs | object-causality queries, cross-checkpoint leakage | 06 §5.1, §5.3 |
| object→object relations: `receipt --follows--> previous_receipt`; `episode --witnessed_in--> checkpoint`; `checkpoint --on--> branch`; `branch --at--> commit` | `query_provenance_traversal` O2O step; receipt lineage | 06 §5.2, §5.3 |
| split `file` ref into `source` / `repair` qualifiers | source/repair surface checks; `foreign_surface_block` | 06 §3.1, §5.3; 08 §4.3 |
| attributes `residual`, `gate_result`, `source_graph_hash`, `previous_receipt_id` on `GatePassed`/`ReceiptEmitted` | residual-preservation (B4), lineage chain (B2) | 06 §3.1 |
| a `checkpoint` partition attribute (or confirm diag-code prefix is the key) | variant windowing / leakage L1 | 05 §3.5, §8 OQ1 |
| confirm `RouteSelected.attributes.route_id` is populated | metric M7 route_effectiveness | 08 §8 OQ4 |
| confirm/ship `living-loop-6link.law.json` as ggen's authored law (passed via `--law`) | prefix oracle | 04 §13 OQ3 |

**Graceful degradation:** until ggen ships §6.2, the oracle degrades to `Warning` findings (e.g. `MissingResidualSet`) — never panics — so it is useful on today's tape and stricter as ggen enriches it (06 §10 #8).

### 6.3 The one coordinated proof-assertion change

When ggen migrates its proof from string-grep to oracle-verdict (03 §6), the on-disk JSONL stays byte-identical (via §6.1 aliases); only the *assertion* moves from `grep "activity":"DiagnosticRaised"` to `wpm oracle conform … && assert verdict==Admitted && fitness==1.0`. This is the single coordinated ggen-side change, landed with the assertion update in the same commit. The ALIVE-as-marking reconciliation of `living_diagnostic_clear_v1.pnml` (02 §3.1, B6) must be confirmed against `crates/ggen-lsp/tests/ggen_tpl_001_*` before it lands.

---

## 7. Document index (all 9 docs)

| Doc | Title | Role | Key deliverable | Status counts (exists / to-build) |
|---|---|---|---|---|
| `00-STRUCTURE-MAP.md` | wasm4pm Structure Map | Survey / ground truth | The 12-capability exists-vs-build table; crate map; 3 OCEL shapes | 0 full-exist / 6 partial / 6 to-build |
| `00-BUILD-PLAN.md` | **This document** | Master synthesis | DAG, phased milestones, acceptance gate, ggen coordination | — |
| `01-ocel-core-and-streaming-intake.md` | ocel-core + NDJSON intake | **Foundation** | serde aliases (G1), `fold_ndjson` (G4–G6), `wpm oracle ingest` | 2 exist / 8 fix-or-build (G1–G8) |
| `02-checkpoint-process-model-registry.md` | Checkpoint model registry | Declared law store | `CheckpointModelDescriptor`, 6 models, `wpm model …` | 14 exist / 7 to-build (B1–B7) |
| `03-conformance-and-discovery-oracle.md` | Conformance + discovery | History judge (done right) | `flatten_ocel`, `dfg_structural_diff`, `wpm oracle conform`/`discover-diff` | 9 exist / 7 to-build (B1–B7) |
| `04-prefix-and-online-conformance.md` | Prefix / online / negative | **The Andon leap** | `OrderingLaw`→DFA + completability, `PrefixOracle`, `wpm oracle check`/`watch` | 9 exist / 7 to-build (+1 latent bug: `from_dfg`) |
| `05-variant-governance-and-leakage.md` | Variant governance + leakage | Process-signature + windowing | `enumerate_variants`, `check_declare`, L1/L2/L3, `wpm oracle variant`/`leakage` | 6 exist / 9 to-build (T1–T9) |
| `06-receipt-and-object-causality.md` | Receipt + object causality | Receipt-as-witness | `check_ordering_law`, `ReceiptWitness`, query catalog, `wpm oracle attest` | 6 exist / 7 to-build (B1–B7) |
| `07-ocpq-process-law-query-language.md` | OCPQ query language | Declarative front-end | EBNF→`OcpqQuery`→`DeclareModel`, `wpm ocpq` | 9 exist / 8 to-build (T1–T8) |
| `08-metrics-and-bad-trace-corpus.md` | Metrics + bad-trace corpus | Measurement + regression | M1–M8, `CorpusLabel`, `wpm metrics`/`corpus run` | 11 exist / 6 to-build (B1–B6) |

### 7.1 Reconciliations the build must NOT paper over (cross-spec)

- **`ocel-core` and NDJSON already partially exist** (01 §2.1, 06 §2.1): the structure map marked them TO BE BUILT; specs 01/06 found `crates/ocel-core/` carved and `intake::NDJsonStream` present. Build = *complete/unify*, not start from zero. The version drift (`26.5.30`) is real and must be fixed (01 G7).
- **The Declare checker EXISTS** (07 §2.1): `declare_conformance.rs:27 check_declare_conformance` is real — the structure map said "no checker found." 05/07 build object-scoping on top, not a new checker. But it has a `template` vs `constraint_type` field mismatch (07 §6.1) to resolve in one coordinated patch.
- **`wpm mining conformance` is mocked** (`mining.rs:75 DFG::new()`): 03 B2 is the smallest patch turning a mocked table into a real oracle.
- **Latent bug** (04 §3.2): `streaming_conformance.rs:35` calls a non-existent `StreamingConformanceChecker::from_dfg`. The Andon oracle avoids it (uses the pure `OrderingLaw` path); file separately, do not block on it.
- **`andon_reason` enum ownership** (08 §8 OQ1): 06 owns the canonical refusal-code enum; 08 proposes names; 04/05/07 contribute their `*Refusal` variants in the same `{code,severity,json_path,message}` family. One shared vocabulary, ratified by 06.

---

*Descriptive synthesis only. No Rust source, `Cargo.toml`, or existing file was modified. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/00-BUILD-PLAN.md`.*
