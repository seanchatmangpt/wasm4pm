# 08 — Manufacturing Metrics + Canonical Bad-Trace Corpus

**Status:** Spec. Buildable by the wasm4pm agent system. Spec-only — no Rust/Cargo.toml modified by this document.
**Date:** 2026-05-30
**Capability area:** (a) Manufacturing metrics derived from ggen's OCEL stream; (b) a canonical good/bad-trace fixture corpus ("Truthforge for process law").
**Version train:** `26.5.x` (workspace is `26.5.29`, `/Users/sac/wasm4pm/Cargo.toml:7`). New code uses `version.workspace = true`.
**Grounding:** every "EXISTS" claim below cites a real `file:symbol` read from `/Users/sac/wasm4pm`. Everything else is **TO BE BUILT**.

> **Doctrine.** ggen knows *local* law and emits an append-only OCEL tape. wasm4pm must judge *process* law. This spec adds the **measurement** layer (manufacturing metrics: cost, repair loops, cycle time, Andon frequency, collisions, recurrence, route effectiveness, fake-live catch rate) and the **regression** layer (a labeled corpus where every checkpoint model can be proven to *accept* valid traces and *reject* forbidden ones). Both are derivations over the OCEL the survey calls shape **2.C/2.D** — `activity` / `event_id` / inline `objects` — which is exactly what ggen emits and what wasm4pm's own fixtures already use (`fixtures/real/.../expected-ocel.json`, survey §2.C).

---

## 0. Scope and boundary

| In scope (this spec) | Out of scope (sibling specs) |
|---|---|
| Metric definitions as derivations over OCEL events/objects | The 6-link ordering law encoding itself (spec 06 / `DeclareModel`) |
| The metrics report JSON schema + `wpm` surface | NDJSON importer (GGEN-NEEDS §4a; survey §3) |
| The good/bad-trace fixture corpus (9 scenarios) | `ocel-core` carving (GGEN-NEEDS §2) |
| Labeling each fixture ACCEPT/REJECT per checkpoint model | Prefix-completability engine internals (spec 07) |
| Mapping onto `fixtures/real/` + `cli_tests.rs` conventions | Variant-governance allow/deny-list internals (spec 04) |

The metrics oracle and the corpus **consume the verdicts produced by the conformance / ordering / prefix oracles** (siblings). This spec defines *what to measure once those verdicts exist* and *what corpus proves they are correct*. Where a verdict field is needed but not yet produced, it is flagged `[needs sibling]`.

---

## 1. What EXISTS to build on (cited) vs. TO BE BUILT

### 1.1 EXISTS

| Asset | Citation | How this spec uses it |
|---|---|---|
| `ConformanceResult { fitness, precision, generalization, simplicity, total_traces, fitting_traces, deviating_traces }` + `conformance_rate()`, `with_precision/with_generalization/with_simplicity` | `crates/wasm4pm-types/src/conformance.rs:62-114` | The four quality metrics (fitness/precision/generalization/simplicity) are **already a serde struct** — the metrics report embeds it verbatim; the new metrics are *additive*, not a replacement. `with_*` setters exist but are unused (only `fitness` is computed today — survey item #11). |
| `clamp_finite(x, lo, hi)` NaN-safe clamp | `crates/wasm4pm-types/src/conformance.rs:51` | Every ratio metric defined here MUST route through `clamp_finite` (or its equal) so a zero-denominator / NaN never panics. Cite this as the canonical clamp. |
| `TokenReplayResult { fitness, produced_tokens, consumed_tokens, missing_tokens, remaining_tokens }` | `crates/wasm4pm-types/src/conformance.rs:5` | Token accounting available for fitness sub-evidence if a metric wants replay detail. |
| Existing ggen-living-loop verdict shape: `{ route_id, fitness, precision, required_stage_coverage, receipt_coverage, object_lifecycle_validity, verdict, andon_reason, details:[{dimension, ok, detail}] }` with `verdict ∈ {AndonPull, ...}`, `andon_reason ∈ {InsufficientReceiptCoverage, ...}` | `fixtures/real/trace-conform-agent-proof-lifecycle/expected-conform.json:1-52` | **This is the in-tree per-trace verdict contract.** The metrics report aggregates *across* these per-trace verdicts. The bad-trace corpus reuses this exact `expected-conform.json` shape for its labels. |
| `ReceiptDoctorReport { state: Admitted|Refused, findings: Vec<ReceiptFinding>, admitted }`; `ReceiptFinding { code, json_path, message, severity: Deny|Warning }` | `wasm4pm/src/receipt.rs:62-82` | The **finding shape** the fake-live / Andon metrics count. The metrics oracle counts findings by `code` and `severity`. |
| `wpm receipt truthforge <file>` adversarial mutator matrix: clones a receipt, applies 4 mutations, asserts each is `CAUGHT`, prints `{name, caught, refusal_codes}` rows, exits non-zero if any `BYPASSED` | `crates/wasm4pm-cli/src/commands/receipt.rs:367-494` | **The template for the corpus runner.** "Truthforge for process law" mirrors this: instead of mutating one receipt at runtime, it replays a *checked-in* corpus of good+bad traces and asserts each label (`ACCEPT`/`REJECT`) is honored. The `{name, caught, codes}` row layout and the "all caught ⇒ success, any bypassed ⇒ non-zero exit" contract carry over directly. |
| `fixtures/real/ggen-living-loop/` — already holds `expected-ocel.json` (good 6-link) + `bad-trace-missing-gate.json`, `bad-trace-orphan-receipt.json`, `bad-trace-out-of-order.json`, `bad-trace-future-leak.json` | `fixtures/real/ggen-living-loop/` (dir listing, this survey) | **The corpus already has a home and 5 of the 9 scenarios already exist on disk.** This spec standardizes their labels and adds the missing 4 (`missed_clear`, `over_clear`, `route_missing`, `pending_repair_missing`, `foreign_surface_block`, `unstable_source_graph` — see §4 for the exact 9). |
| `wpm receipt doctor` JSON-emit + non-zero-exit-on-refusal convention; `-f human|json`, `-a producer|operator|ci` | `crates/wasm4pm-cli/src/commands/receipt.rs:140`, `:186` | The `--format json` + exit-code convention the metrics/corpus subcommands copy. |
| `Io` + `Table` printer | `crates/wasm4pm-cli/src/io.rs:68-124` | Human-format rendering of metric tables / corpus matrix. |
| `wpm lean` / `wpm spc` waste audits | `crates/wasm4pm-cli/src/commands/{lean,spc}.rs` | Conceptual neighbors (Lean Six Sigma waste, statistical process control). The manufacturing-metrics report is the OCEL-derived analog; reuse the `[WASTE]/[LEAN]` framing and `--strict` gate semantics (`lean.rs:11`, strict→`Err`). |
| `compute_blake3_hash`, `compute_sha256_hash` | `wasm4pm/src/receipt.rs:164/168` | Used to derive a stable `metrics_run_id` / corpus fingerprint. ggen already BLAKE3-derives `event_id`/`receipt_id` (GGEN-NEEDS §3.1). |
| truex `canonical_stringify` | `crates/wasm4pm-algos/src/truex/canonicalize.rs:3` | Canonicalize each fixture before hashing so the corpus fingerprint is reproducible cross-machine. |

### 1.2 TO BE BUILT

| # | Thing | Why it does not exist | Attach point |
|---|---|---|---|
| B1 | The 8 manufacturing metrics as named derivations | Only `fitness` is computed anywhere (`conformance.rs`, survey #11); no cost/loop/cycle-time/Andon/collision/recurrence/route/fake-live metric exists | new `wasm4pm-algos::metrics` module (pure Rust, link-safe) |
| B2 | `ManufacturingMetricsReport` JSON schema + versioned envelope | No shared JSON envelope exists; each command rolls its own (survey §5) | `wasm4pm-algos::metrics::ManufacturingMetricsReport` (serde) |
| B3 | `wpm metrics <input.ocel.jsonl>` subcommand (or `wpm oracle metrics`) | No metrics command exists | `crates/wasm4pm-cli/src/commands/metrics.rs` + wire into `main.rs` tree |
| B4 | The corpus runner `wpm corpus run <dir>` ("Truthforge for process law") | `truthforge` mutates one receipt at runtime; there is no checked-in good/bad OCEL corpus runner (survey item #12) | `crates/wasm4pm-cli/src/commands/corpus.rs` |
| B5 | 4 missing fixtures + label files (`expected-verdict.json`) for all 9 | Only 5 raw OCEL files exist; none carries an ACCEPT/REJECT label per model | `fixtures/real/ggen-living-loop/` |
| B6 | A `CorpusLabel` schema binding each fixture to `{model_id, expect: Accept|Reject, expected_andon_reason?}` | No label concept exists | inside fixtures + `wasm4pm-algos::corpus` |

**Count: EXISTS = 11 assets; TO BE BUILT = 6 things (B1–B6).**

---

## 2. Manufacturing metrics — definitions as OCEL derivations

All metrics are **pure functions over a parsed `OCEL`** (the 2.C/2.D shape: events have `activity`, `timestamp`, inline `objects:[{id,type}]`; ggen object types are `File`, `DiagnosticCode`, `Episode`, `Agent` — confirmed in `fixtures/real/ggen-living-loop/expected-ocel.json:9-31`). They are computed in a new pure-Rust module `wasm4pm-algos::metrics`.

### 2.0 Shared vocabulary (ground truth from ggen's emitted log)

- **Activities (the 6-link chain):** `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted`. (`fixtures/real/ggen-living-loop/expected-ocel.json`.)
- **Episode** = the unit of a single living-loop attempt; object type `Episode`, e.g. `ep_1`. A *receipted change* is one Episode that reaches `ReceiptEmitted`.
- **DiagnosticCode** object, e.g. `diag_GGEN-TPL-001` = the diagnostic species (the `GGEN-TPL-001` code, survey §6).
- **File** object, e.g. `file_1` = the surface under edit.
- **Agent** object, e.g. `agent_x` = the editing agent (from `attach_attribution`).

> **Notation.** For an episode `E`, let `events(E)` = events whose `objects` include `E`'s id, ordered by `(timestamp, event_id)`. `first(E,A)` / `last(E,A)` = first/last event in `events(E)` with `activity == A` (or ∅). A *clear* = an episode reaching `ReceiptEmitted` with a preceding `GatePassed`. Every ratio routes through `clamp_finite` (`conformance.rs:51`).

### 2.1 The 8 metrics

| # | Metric | Derivation | Unit / range |
|---|---|---|---|
| M1 | **cost_per_receipted_change** | `total_events / receipted_changes`, where `receipted_changes = |{E : last(E,ReceiptEmitted) ≠ ∅}|` and `total_events = |events|`. Optional weighted form: sum of per-event `attributes.cost` if present, else event-count proxy. | events/receipt, `≥1.0` |
| M2 | **mean_repair_loop_count** | Per episode `E`, `loops(E) = count(activity == RepairApplied in events(E))`; metric = `mean over E of loops(E)`. A healthy clear has `loops == 1`; `>1` = rework. | loops/episode, `≥0` |
| M3 | **checkpoint_cycle_time** | Per episode `E` that clears: `cycle(E) = time(last(E,ReceiptEmitted)) − time(first(E,DiagnosticRaised))`. Report `{mean_ms, p50_ms, p95_ms, max_ms}`. (Timestamps are RFC-3339, e.g. `2026-05-15T12:00:00+00:00`.) | milliseconds |
| M4 | **andon_frequency** | `andon_pulls / total_episodes`, where `andon_pulls = |{E : per-trace verdict.verdict == "AndonPull"}|` `[needs sibling — conformance verdict]`. Standalone fallback: count episodes that DiagnosticRaised but never reached ReceiptEmitted. Also bucket by `andon_reason` (`expected-conform.json:9`). | ratio `[0,1]` + per-reason histogram |
| M5 | **agent_collision_rate** | Two episodes *collide* if they share a `File` object and their `[first DiagnosticRaised, last ReceiptEmitted]` time-intervals overlap AND carry distinct `Agent` ids. `metric = colliding_episode_pairs / C(total_episodes,2)`. | ratio `[0,1]` |
| M6 | **species_recurrence** | Per `DiagnosticCode` id `c`: `recurrence(c) = episodes_touching(c)`. Report top-N `{code, count, mean_loops, clear_rate}`. "Recurrence" = same species re-raised across distinct episodes — the chronic-defect signal. | per-code histogram |
| M7 | **route_effectiveness** | Per `RouteSelected` route value (from `RouteSelected` event `attributes.route_id` if present, else the diagnostic code as proxy): `effectiveness(r) = clears_after_route(r) / selections(r)`. A route that is selected but rarely clears is ineffective. | per-route ratio `[0,1]` |
| M8 | **fake_live_catch_rate** | `findings_caught / fake_live_injected`, computed over the **corpus run** (§4): a fixture labeled `Reject` is "caught" iff the oracle returns `verdict != AndonPull`/`Refused` for it. `fake_live_catch_rate = |REJECT fixtures correctly refused| / |REJECT fixtures|`. This is the corpus's own self-grade — mirrors truthforge's `all_caught` (`receipt.rs:476-492`). | ratio `[0,1]`, target `1.0` |

> **M4/M7 dependency:** the per-trace `verdict` and `andon_reason` come from the conformance/ordering oracle (sibling spec). Until that lands, M4/M7 use the **standalone fallbacks** noted above (pure structural derivation: reached-ReceiptEmitted-or-not), so the metrics module is buildable independently and tightens when the sibling verdict is wired.

### 2.2 Proposed Rust surface (TO BE BUILT — `wasm4pm-algos::metrics`)

```rust
// crates/wasm4pm-algos/src/metrics.rs   (TO BE BUILT)
// Pure Rust, link-safe (no wasm-bindgen). Operates on ocel-core OCEL (or the 2.C shape
// produced by the NDJSON importer). Every ratio routes through conformance::clamp_finite.

pub struct ManufacturingMetricsReport {
    pub report_version: String,        // e.g. "ggen-oracle.metrics/1"
    pub metrics_run_id: String,        // blake3 of canonicalized input (truex canonical_stringify)
    pub source: String,                // path/identifier of the .ocel.jsonl analyzed
    pub total_events: usize,
    pub total_episodes: usize,
    pub receipted_changes: usize,

    pub cost_per_receipted_change: f64,        // M1
    pub mean_repair_loop_count: f64,           // M2
    pub checkpoint_cycle_time: CycleTimeStats, // M3
    pub andon_frequency: AndonStats,           // M4
    pub agent_collision_rate: f64,             // M5
    pub species_recurrence: Vec<SpeciesStat>,  // M6
    pub route_effectiveness: Vec<RouteStat>,   // M7
    pub fake_live_catch_rate: Option<f64>,     // M8 (Some only when run over a labeled corpus)

    // The four classic PM metrics, reused verbatim from the existing struct.
    pub conformance: Option<wasm4pm_types::ConformanceResult>, // conformance.rs:62
}

pub struct CycleTimeStats { pub mean_ms: f64, pub p50_ms: f64, pub p95_ms: f64, pub max_ms: f64, pub n: usize }
pub struct AndonStats     { pub frequency: f64, pub pulls: usize, pub by_reason: Vec<(String, usize)> }
pub struct SpeciesStat    { pub code: String, pub count: usize, pub mean_loops: f64, pub clear_rate: f64 }
pub struct RouteStat      { pub route_id: String, pub selections: usize, pub clears: usize, pub effectiveness: f64 }

pub fn compute_metrics(ocel: &OCEL) -> ManufacturingMetricsReport;            // standalone (M4/M7 fallback)
pub fn compute_metrics_with_verdicts(ocel: &OCEL, verdicts: &[TraceVerdict])  // tighten M4/M7
    -> ManufacturingMetricsReport;
```

`TraceVerdict` is the sibling-produced per-episode verdict (shape = `expected-conform.json`). When absent, `compute_metrics` uses structural fallbacks and sets `conformance: None`.

### 2.3 Report JSON schema (B2)

```json
{
  "report_version": "ggen-oracle.metrics/1",
  "metrics_run_id": "b3:9f2c…",
  "source": ".ggen/ocel/agent-edit-events.ocel.jsonl",
  "total_events": 6,
  "total_episodes": 1,
  "receipted_changes": 1,
  "cost_per_receipted_change": 6.0,
  "mean_repair_loop_count": 1.0,
  "checkpoint_cycle_time": { "mean_ms": 5000.0, "p50_ms": 5000.0, "p95_ms": 5000.0, "max_ms": 5000.0, "n": 1 },
  "andon_frequency": { "frequency": 0.0, "pulls": 0, "by_reason": [] },
  "agent_collision_rate": 0.0,
  "species_recurrence": [ { "code": "GGEN-TPL-001", "count": 1, "mean_loops": 1.0, "clear_rate": 1.0 } ],
  "route_effectiveness": [ { "route_id": "GGEN-TPL-001", "selections": 1, "clears": 1, "effectiveness": 1.0 } ],
  "fake_live_catch_rate": null,
  "conformance": { "fitness": 1.0, "precision": 1.0, "generalization": null, "simplicity": null,
                   "total_traces": 1, "fitting_traces": 1, "deviating_traces": 0 }
}
```

The `conformance` block is the existing `ConformanceResult` serde shape (`conformance.rs:62`) unchanged — proving the new report is *additive*. This example is the expected output for the good `fixtures/real/ggen-living-loop/expected-ocel.json` (one clean 6-link episode, 5-second cycle time from `12:00:00` to `12:00:05`).

---

## 3. CLI surface mapping (B3, B4)

Follow the survey §5 recommendation: a versioned JSON envelope, `--format json`, non-zero exit on failure, tests in `cli_tests.rs`. Two new subcommands, mirroring the `wpm receipt` family (`commands/receipt.rs`).

```
wpm metrics <input.ocel.jsonl> [-f human|json] [--strict] [--corpus <dir>]
   # reads the OCEL stream via the NDJSON importer (sibling), runs wasm4pm-algos::metrics,
   # emits ManufacturingMetricsReport. --corpus runs the corpus first to populate M8.
   # --strict: exit non-zero if andon_frequency > 0 or fake_live_catch_rate < 1.0 (lean.rs:11 pattern).

wpm corpus run <dir> [-f human|json] [--model <model_id>]
   # "Truthforge for process law". For each fixture in <dir> with a CorpusLabel:
   #   - parse the OCEL, run the ordering/conformance/prefix oracle (siblings) under <model_id>,
   #   - compare the verdict to the label's expect (Accept|Reject) and expected_andon_reason,
   #   - emit a matrix row {scenario, model, expect, got, ok}.
   # Exit 0 iff every fixture's label is honored (mirrors truthforge all_caught, receipt.rs:476-492).
```

`wpm corpus run` is the regression harness: **every future checkpoint model is registered, pointed at this corpus, and must accept all `valid_living_clear` fixtures and reject all forbidden ones.** This is what makes the corpus a permanent guardrail rather than a one-time fixture set.

**Human output for `wpm corpus run`** (copying the truthforge matrix layout, `receipt.rs:475-489`):

```
=== TRUTHFORGE FOR PROCESS LAW — CORPUS RUN ===
Model: gall-001-living-loop
  - valid_living_clear            : ACCEPT  expect=Accept got=AndonClear        OK
  - missed_clear                  : REJECT  expect=Reject got=AndonPull         OK
  - over_clear                    : REJECT  expect=Reject got=AndonPull         OK
  - receipt_before_gate           : REJECT  expect=Reject got=Refused           OK
  - route_missing                 : REJECT  expect=Reject got=AndonPull         OK
  - pending_repair_missing        : REJECT  expect=Reject got=AndonPull         OK
  - foreign_surface_block         : REJECT  expect=Reject got=Refused           OK
  - checkpoint_leakage            : REJECT  expect=Reject got=Refused           OK
  - unstable_source_graph         : REJECT  expect=Reject got=AndonPull         OK
================================================
CORPUS LAW VERIFICATION: SUCCESS (9/9 labels honored, fake_live_catch_rate=1.000)
```

---

## 4. The canonical good/bad-trace fixture corpus (B5, B6)

### 4.1 Home and convention (cited)

Fixtures live in `fixtures/real/ggen-living-loop/` (the dir already exists; 5 raw OCEL files already present). The convention to follow is established by `fixtures/real/trace-conform-agent-proof-lifecycle/`: each scenario carries an `expected-ocel.json` (or a named `bad-trace-*.json`) **plus** an `expected-conform.json` verdict (`expected-conform.json:1-52`). This spec adds a sibling **`expected-verdict.json`** per fixture carrying the `CorpusLabel` so the corpus runner can grade without re-deriving intent.

### 4.2 `CorpusLabel` schema

```json
{
  "scenario": "receipt_before_gate",
  "model_id": "gall-001-living-loop",
  "expect": "Reject",
  "expected_andon_reason": "ReceiptBeforeGate",
  "rationale": "ReceiptEmitted (e5) carries an earlier timestamp than GatePassed (e4): a receipt cannot precede the gate that authorizes it.",
  "ggen_serialized_constraints": {
    "must_contain_activity": ["ReceiptEmitted", "GatePassed"],
    "must_contain_code": "GGEN-TPL-001"
  }
}
```

`expect ∈ {Accept, Reject}`. `expected_andon_reason` is checked only when `expect == Reject`. `ggen_serialized_constraints` preserves GGEN-NEEDS §3.1: the on-disk JSONL must keep `"activity":"…"`, the object-id substrings, and the `GGEN-TPL-001` code so ggen's own proof greps stay green.

### 4.3 The 9 scenarios — label table

`Accept` = the trace is lawful for the model; the oracle must return `AndonClear`/`Admitted`. `Reject` = forbidden; the oracle must return `AndonPull`/`Refused` with the named reason.

| # | scenario | label | expected_andon_reason | what makes it good/bad | on-disk status |
|---|---|---|---|---|---|
| 1 | `valid_living_clear` | **Accept** | — | All 6 links in order, single episode, GatePassed before ReceiptEmitted, one RepairApplied. | EXISTS: `expected-ocel.json` |
| 2 | `missed_clear` | **Reject** | `InsufficientReceiptCoverage` | DiagnosticRaised…GatePassed but **no** ReceiptEmitted — the loop "cleared" the gate yet never emitted a receipt (the agent-proof-lifecycle fixture's exact failure, `expected-conform.json:9`). | TO BE BUILT |
| 3 | `over_clear` | **Reject** | `ReceiptWithoutDiagnostic` | A ReceiptEmitted with **no** preceding DiagnosticRaised in its episode — clearing a defect that was never raised. | TO BE BUILT |
| 4 | `receipt_before_gate` | **Reject** | `ReceiptBeforeGate` | ReceiptEmitted timestamp precedes GatePassed timestamp (ordering inversion). | EXISTS: `bad-trace-out-of-order.json` (e5 ReceiptEmitted @12:00:04 before e4 GatePassed @12:00:05) |
| 5 | `route_missing` | **Reject** | `RepairWithoutRoute` | RepairSuggested/RepairApplied present but **no** RouteSelected — repair without a routed obligation. | TO BE BUILT (derive from good by dropping e1) |
| 6 | `pending_repair_missing` | **Reject** | `GateWithoutRepair` | GatePassed/ReceiptEmitted present but RepairApplied **absent** — gate passed with no repair actually applied (the `bad-trace-missing-gate.json` is the dual; this is its sibling). | TO BE BUILT |
| 7 | `foreign_surface_block` | **Reject** | `ForeignSurfaceWrite` | An event's `objects` reference a `File` id outside the episode's declared surface set — a write to a surface the diagnostic never licensed. | TO BE BUILT |
| 8 | `checkpoint_leakage` | **Reject** | `FutureCheckpointLeak` | An event tagged for checkpoint N+1 (e.g. a second `Episode` id `ep_2` or a later-checkpoint diagnostic) appears inside checkpoint N's window — `bad-trace-future-leak.json` already does this: e5 ReceiptEmitted references `ep_2` while e0–e4 reference `ep_1`. | EXISTS: `bad-trace-future-leak.json` |
| 9 | `unstable_source_graph` | **Reject** | `SourceGraphUnstable` | The same `File` object is touched by overlapping episodes/agents (collision, M5 ≠ 0) such that the source under proof changed mid-loop — must be re-observed, not cleared. | TO BE BUILT |

Plus the two pre-existing extra bad traces map to scenarios above:
- `bad-trace-missing-gate.json` → a variant of #6 (`pending_repair_missing` family: it has RepairApplied e3 then ReceiptEmitted e5 but **no GatePassed** — i.e. `ReceiptWithoutGate`). Recommend labeling it `gate_missing` as a 10th scenario, **Reject / GateMissing**, since it is distinct from #4 (present-but-out-of-order) and #6 (repair-missing). It already exists on disk.
- `bad-trace-orphan-receipt.json` → a variant of #3 (`over_clear`): a lone ReceiptEmitted with no predecessors at all. Label `orphan_receipt`, **Reject / ReceiptWithoutPredecessor**. Already exists on disk.

> **Net corpus = 1 good + 8+ bad, with 5 already on disk.** The builder adds the 4–6 missing OCEL files and an `expected-verdict.json` (CorpusLabel) for every fixture.

### 4.4 Example fixtures (fenced — buildable verbatim)

All use the in-tree 2.C shape (`ocel_version`, `ocel_events[*].{event_id,activity,timestamp,objects:[{id,type}],attributes}`, `ocel_objects`), confirmed against `expected-ocel.json:1-90`. ggen object types: `File`, `DiagnosticCode`, `Episode`, `Agent`.

**(1) `valid_living_clear`** — already on disk as `expected-ocel.json` (6 events e0–e5, single `ep_1`, monotonic timestamps `12:00:00`…`12:00:05`). Its label:

```json
{ "scenario": "valid_living_clear", "model_id": "gall-001-living-loop",
  "expect": "Accept", "rationale": "All six links present and ordered; GatePassed precedes ReceiptEmitted.",
  "ggen_serialized_constraints": { "must_contain_activity":
    ["DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied","GatePassed","ReceiptEmitted"],
    "must_contain_code": "GGEN-TPL-001" } }
```

**(2) `missed_clear`** — drop `e5 ReceiptEmitted` from the good trace (keep e0–e4). New file `bad-trace-missed-clear.json`:

```json
{ "ocel_version": "2.0", "ocel_global_log": { "ocel_attribute_names": [] },
  "ocel_events": [
    { "event_id": "e0", "activity": "DiagnosticRaised", "timestamp": "2026-05-15T12:00:00+00:00",
      "objects": [ {"id":"file_1","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
                   {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} },
    { "event_id": "e1", "activity": "RouteSelected", "timestamp": "2026-05-15T12:00:01+00:00",
      "objects": [ {"id":"file_1","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
                   {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} },
    { "event_id": "e2", "activity": "RepairSuggested", "timestamp": "2026-05-15T12:00:02+00:00",
      "objects": [ {"id":"file_1","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
                   {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} },
    { "event_id": "e3", "activity": "RepairApplied", "timestamp": "2026-05-15T12:00:03+00:00",
      "objects": [ {"id":"file_1","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
                   {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} },
    { "event_id": "e4", "activity": "GatePassed", "timestamp": "2026-05-15T12:00:04+00:00",
      "objects": [ {"id":"file_1","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
                   {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} }
  ],
  "ocel_objects": [
    {"id":"file_1","type":"File","attributes":{}}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode","attributes":{}},
    {"id":"ep_1","type":"Episode","attributes":{}}, {"id":"agent_x","type":"Agent","attributes":{}} ] }
```
Label: `{ "scenario":"missed_clear", "model_id":"gall-001-living-loop", "expect":"Reject", "expected_andon_reason":"InsufficientReceiptCoverage", "rationale":"GatePassed reached but ReceiptEmitted never emitted." }`

**(3) `over_clear` / `orphan_receipt`** — already on disk as `bad-trace-orphan-receipt.json` (a single `e5 ReceiptEmitted`, no predecessors). Label:

```json
{ "scenario": "orphan_receipt", "model_id": "gall-001-living-loop", "expect": "Reject",
  "expected_andon_reason": "ReceiptWithoutPredecessor",
  "rationale": "ReceiptEmitted with no DiagnosticRaised/GatePassed predecessor in its episode." }
```

**(4) `receipt_before_gate`** — already on disk as `bad-trace-out-of-order.json` (e5 ReceiptEmitted @`12:00:04`, e4 GatePassed @`12:00:05`). Label:

```json
{ "scenario": "receipt_before_gate", "model_id": "gall-001-living-loop", "expect": "Reject",
  "expected_andon_reason": "ReceiptBeforeGate",
  "rationale": "ReceiptEmitted timestamp (12:00:04) precedes GatePassed (12:00:05); a receipt cannot precede its authorizing gate." }
```

**(5) `route_missing`** — the good trace with `e1 RouteSelected` removed. Label:
```json
{ "scenario": "route_missing", "model_id": "gall-001-living-loop", "expect": "Reject",
  "expected_andon_reason": "RepairWithoutRoute",
  "rationale": "RepairSuggested/RepairApplied occur with no preceding RouteSelected — repair without a routed obligation." }
```

**(7) `foreign_surface_block`** — the good trace where `e3 RepairApplied`'s `objects` swaps `file_1` for an undeclared `file_2` (a File never introduced by DiagnosticRaised):
```json
{ "event_id": "e3", "activity": "RepairApplied", "timestamp": "2026-05-15T12:00:03+00:00",
  "objects": [ {"id":"file_2","type":"File"}, {"id":"diag_GGEN-TPL-001","type":"DiagnosticCode"},
               {"id":"ep_1","type":"Episode"}, {"id":"agent_x","type":"Agent"} ], "attributes": {} }
```
Label `expected_andon_reason: "ForeignSurfaceWrite"` — repair touched a surface the diagnostic never licensed.

**(8) `checkpoint_leakage`** — already on disk as `bad-trace-future-leak.json` (e5 references `ep_2` while e0–e4 reference `ep_1`). Label:
```json
{ "scenario": "checkpoint_leakage", "model_id": "gall-001-living-loop", "expect": "Reject",
  "expected_andon_reason": "FutureCheckpointLeak",
  "rationale": "ReceiptEmitted (e5) references Episode ep_2 while the loop e0–e4 ran under ep_1: a next-checkpoint object leaked into this checkpoint's gate window." }
```

(`gate_missing` = `bad-trace-missing-gate.json`, label `expected_andon_reason: "GateMissing"`; `pending_repair_missing` and `unstable_source_graph` follow the same construction — derive from the good trace by removing `e3 RepairApplied`, or by adding a second overlapping `Agent`/`Episode` on `file_1`.)

### 4.5 Why this mirrors `wpm receipt truthforge`

`truthforge` (`receipt.rs:367-494`) takes a **good** receipt, applies N mutations, and asserts each mutation is **CAUGHT** — proving the gate cannot be bypassed. The corpus runner inverts the storage but keeps the contract: the mutations are **checked-in fixtures** (reproducible, reviewable, hashable via truex `canonical_stringify`) rather than runtime clones, and the "all caught ⇒ exit 0, any bypassed ⇒ exit non-zero" rule is identical (`receipt.rs:476-492`). M8 `fake_live_catch_rate` IS truthforge's `all_caught` expressed as a ratio.

---

## 5. ggen-side consumption contract (external `wpm` oracle)

ggen invokes `wpm` as a **subprocess** (GGEN-NEEDS §5: only `ocel-core` is linked; everything else is the external CLI oracle). Chicago-TDD doctrine: real boundary, externalizable JSON evidence, exit-code adjudication.

1. ggen appends to `.ggen/ocel/agent-edit-events.ocel.jsonl` (unchanged; ggen is the producer).
2. ggen runs `wpm metrics .ggen/ocel/agent-edit-events.ocel.jsonl --format json` and parses `ManufacturingMetricsReport` from stdout. Exit 0 = metrics computed; non-zero (under `--strict`) = an Andon-frequency / fake-live regression.
3. For regression, ggen runs `wpm corpus run fixtures/real/ggen-living-loop --model gall-001-living-loop --format json` and asserts `9/9 labels honored` (or whatever the model demands). This is ggen's proof that its emitted log mines into a conforming process via the external oracle (GGEN-NEEDS §7 proof obligation #6), and that the oracle rejects every forbidden shape.
4. **Serialized-name contract (load-bearing):** the corpus fixtures and the metrics derivations key off `"activity":"…"`, the object `id` substrings, and the `GGEN-TPL-001` code exactly as ggen emits them (GGEN-NEEDS §3.1). No metric or fixture may rename a field without coordinating with ggen's Gall proof tests (`crates/ggen-lsp/tests/ggen_tpl_001_*`). The `CorpusLabel.ggen_serialized_constraints` block makes this explicit and machine-checkable.

**Report envelope versioning:** `report_version` / a `model_id` field travels in every JSON payload so ggen can assert it speaks a compatible oracle dialect. Survey §5 notes no shared envelope exists today; this spec defines `"ggen-oracle.metrics/1"` and a `corpus/1` envelope as the first two.

---

## 6. Mapping onto existing crates + CLI

| Artifact | Lands in | Convention followed |
|---|---|---|
| `metrics` module (M1–M8, report structs) | `crates/wasm4pm-algos/src/metrics.rs` (new) | Pure Rust, link-safe (like `dfg.rs`, `conformance.rs`); reuse `conformance::clamp_finite` + embed `ConformanceResult`. `version.workspace = true`. |
| `corpus` runner logic | `crates/wasm4pm-algos/src/corpus.rs` (new) | Pure Rust; consumes sibling verdicts; mirrors `truthforge` all-caught contract. |
| `wpm metrics`, `wpm corpus` subcommands | `crates/wasm4pm-cli/src/commands/{metrics,corpus}.rs` (new) + `main.rs` tree | `clap` derive, `-f human|json`, `--strict`, non-zero exit on failure (copy `receipt.rs:140/186`, `lean.rs:11`). JSON via `serde_json::to_string_pretty`. Human via `Io`/`Table` (`io.rs:68-124`). |
| Fixtures + labels | `fixtures/real/ggen-living-loop/*.json` (5 exist) + `*.verdict.json` (new) | Same dir + dual-file convention as `trace-conform-agent-proof-lifecycle/` (`expected-ocel.json` + `expected-conform.json`). |
| Tests | `crates/wasm4pm-cli/tests/cli_tests.rs` | `assert_cmd::Command::cargo_bin("wpm")` + `predicates` (existing style, `cli_tests.rs:6-13`). One test per corpus label + one metrics-report assertion. |

---

## 7. Acceptance criteria (verifiable by wasm4pm builders)

1. `wasm4pm-algos::metrics::compute_metrics(&ocel)` returns a `ManufacturingMetricsReport` for the good fixture with: `total_events==6`, `total_episodes==1`, `receipted_changes==1`, `cost_per_receipted_change==6.0`, `mean_repair_loop_count==1.0`, `checkpoint_cycle_time.mean_ms==5000.0`, `andon_frequency.frequency==0.0`, `agent_collision_rate==0.0`, one `species_recurrence` for `GGEN-TPL-001` with `clear_rate==1.0`. (All numerically asserted; no NaN — `clamp_finite` proven by `conformance.rs:139` regression style.)
2. `wpm metrics <good>.json --format json` exits 0 and stdout parses to the §2.3 schema with `report_version=="ggen-oracle.metrics/1"`.
3. `wpm corpus run fixtures/real/ggen-living-loop --model gall-001-living-loop --format json`:
   - returns `Accept`/`AndonClear` for `valid_living_clear`;
   - returns `Reject`/`AndonPull`-or-`Refused` for **every** bad fixture with the label's `expected_andon_reason`;
   - exits 0 iff all labels honored, non-zero if any is bypassed (mirrors `receipt.rs:489-492`).
4. `fake_live_catch_rate == 1.0` on the full corpus (every REJECT fixture caught). A deliberately mislabeled fixture (e.g. labeling `bad-trace-out-of-order.json` as `Accept`) makes the run exit non-zero — proving the harness is not vacuous (anti-cheating: the easy path must be the real path).
5. Every fixture, canonicalized via truex `canonical_stringify` (`truex/canonicalize.rs:3`) and BLAKE3-hashed, yields a stable `metrics_run_id` / corpus fingerprint reproducible across machines.
6. `crates/wasm4pm-cli/tests/cli_tests.rs` gains: one `#[test]` asserting the metrics JSON for the good fixture, and one `#[test]` asserting `wpm corpus run` reports `9/9` (or N/N) labels honored and exits 0. Both use `assert_cmd` against the real `wpm` binary (Chicago-style, no mocks).
7. The serialized-name constraints in each `CorpusLabel.ggen_serialized_constraints` are satisfied by the fixture on disk (`"activity":"…"`, object id substrings, `GGEN-TPL-001` present) — verified by a grep-style assertion so ggen's Gall proofs cannot silently break.

---

## 8. Open questions (flag back to ggen / sibling specs)

1. **Verdict vocabulary ownership.** `andon_reason` strings (`ReceiptBeforeGate`, `RepairWithoutRoute`, `FutureCheckpointLeak`, …) must be a *shared enum* with the conformance/ordering oracle (sibling 06). This spec proposes the names; sibling must ratify and own the canonical enum. The existing in-tree value is only `InsufficientReceiptCoverage` (`expected-conform.json:9`).
2. **Cost weighting.** M1 defaults to event-count proxy. Does ggen emit a per-event `attributes.cost` (e.g. tokens, wall-time)? If yes, M1 should sum it. Needs ggen confirmation of `intel/events.rs` attribute keys.
3. **Episode/checkpoint identity.** M3/M8 assume one `Episode` object id per loop and that a "checkpoint window" = a set of Episode ids. The leakage scenario (`bad-trace-future-leak.json`) leaks via a second `ep_2`. Confirm with ggen whether checkpoints are identified by Episode id, by a separate `Checkpoint` object type, or by a run-id attribute — this drives cross-checkpoint leakage detection (sibling 08-leakage).
4. **Route id source.** M7 reads route from `RouteSelected.attributes.route_id`; the in-tree fixtures have empty `attributes`. Confirm ggen populates a route identifier, else M7 falls back to the diagnostic code as route proxy.
5. **Corpus model-matrix.** Should `wpm corpus run` accept multiple `--model` ids and produce a per-model × per-scenario matrix (a full regression grid for every checkpoint)? Recommended yes, but defer the multi-model envelope to a follow-up once the single-model runner is green.

---

*This document is descriptive/spec-only. No Rust source, Cargo.toml, or existing file was modified. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/08-metrics-and-bad-trace-corpus.md`.*
