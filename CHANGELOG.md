<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: CHANGELOG.md; source-sha256: 41c9cd627f430e4fe8408f3166e71fc14fba8139f2681f143eefce112dea02cc; reason: root governance or canonical reference -->

# Changelog

wasm4pm uses [CalVer](https://calver.org/): YEAR.MONTH.DAY
- Pin exact versions in production (e.g. "26.6.9") — never use ^ or ~ ranges.
- Multiple releases same day: 26.6.9a, 26.6.9b etc.

## [26.10.10] — 2026-10-10

### Fixed
- Cognition correctness: asp stable-model enumeration forces all fact
  atoms (was: fact-as-premise atoms enumerated free — bogus "stable
  models" omitting mandatory facts); CSP AC-3 revises over ALL constraints
  per variable pair (was: first-only — unsound domains); LTL finite-trace
  `G p` false negatives (vacuous `Always` at trace end); prolog8 NAF
  groundness (typed `NegationFloundering` refusal), receipt hashes now
  bind rule bodies + output bindings (receipt-hash ripple: old receipts
  replay `VersionIncompatible`), memoized SLD, latent proof fan-in panic.
- Universal anticheat harness: 57/57 green (was 39/54 with 15 failures) —
  4 breeds rewritten to the documented Surface-3 trace contracts
  (abductive_ibe, abductive_lp, description_logic, script_sam) plus
  asp/mdp/clp detail alignment; BreedOracle + adversaries for the 3 P5
  breeds (coverage 55/55); provenance binding detects post-hoc trace
  fabrication; vacuous oracle assertions are errors; OCEL gate fail-closed
  (55/55 modeled); serde `deny_unknown_fields` on the breed data plane.
- Conformance: pm4py fitness parity achieved on identical log+PNML
  (sepsis TBR 1.0000 vs 1.0; was 0.0045) — PNML initial-marking merge,
  minimal-enabling BFS for silent transitions, pm4py remaining-token
  convention; Declare confidence denominators (violating traces now
  deflate); standard f-measure; honest `method`/`engine`/`cap_applied`
  payload fields; fake-intrinsics claims demoted to documented scalar
  unrolling; wasm32 v128 alignment UB removed (aligned blocks + simd128
  cfg gates).
- Discovery: Declare/POWL `fall_through_fired` + inductive `fallback`
  surfaced (silent flower models were indistinguishable from cuts);
  `from_dfg=true` is a loud error; variant dedup deterministic; OC-DFG
  deterministic sort + per-type frequencies; OCEL `objectTypes`
  metadata preserved; lifecycle models registered for all 55 breeds.
- ML evaluation honesty: real hold-out evaluation (was absent) for
  remaining-time/outcome/RF/next-activity; real k-fold AutoML (was
  in-sample); NaN input screening; `detect_drift_with_threshold`.
- Datasets: real 1,050-case Sepsis log restored (md5
  `90a79e23…`), truth-in-labeling renames for a mislabeled BPI-2020
  file; download script refuses error bodies (status/size/sniff/sha256).
- Parser guards: bounded gzip decompression (bomb-resistant);
  namespace-prefixed XES parses instead of silently yielding an empty
  log; CSV type-inference unified (numbers-first); 512 MB guards on all
  OCEL entry points.
- Panic hardening: typed errors over reachable panics (pattern-dispatch
  shifts, binary-format section readers, miniml NaN labels, Bayes
  factor caps, CSP iteration budget).
- prolog8 receipt binding gaps (rule bodies, output bindings) and the
  latent `>8`-support proof panic; planner `at end` conditions evaluated
  (plans violating them were accepted) and default-deny admission wired
  on the production MCP path.

### Changed
- Canonical implementations where verdicts were mislabeled: real A*
  (admissible h, branch-and-bound; beam preserved as
  `discover_beam_from_log`), canonical PSO (velocity/inertia) and
  per-arc-normalized ACO (empty-result laundering removed), disjoint
  LinUCB per Li et al. 2010 (per-action uncertainty), isolation forest
  per Liu et al. 2008, canonical Page–Hinkley, gradient-checked neural
  backprop, ocpq AND/OR/NOT algebra with memoized CHILD-SET, real
  STRIPS means-ends planning for autoinstinct_learning, real DENDRAL
  generate-and-test isomer enumeration, Planner durative-action
  soundness (`at end` + concurrent-effect conflicts).
- External oracles: pm4py parity harness (token replay/ETC/alignments;
  fitness parity witnessed), graphlaw vector-oracle court (45
  provenance-pinned vectors across 12 breeds; confirm+falsify harness;
  fragment-boundary exclude-list), bench index generator
  (`bench-tools index`), dataset provenance in receipts.
- Bench honesty: shared real-data loader (silent 0-measurement skips
  became honest failures); ~30 synthetic-data call sites re-grounded on
  real logs; closed_claw pipelines compile + data-grounded; budgets
  re-derived from the seeded baseline; 320 committed build outputs
  untracked; tests fail loudly on missing datasets
  (`WASM4PM_ALLOW_DATA_SKIP=1` restores skip-green).
- Infra: `wpm cognition run` writes BLAKE3 command receipts + emits
  tracing spans (Absolute Rules 6/7); cognition guard hooks wired;
  CI: dtolnay/rust-toolchain SHA-pinned in all 8 workflows, simd128
  wasm check, bench-gate job, self-destructing deps-bot removed;
  `wpm doctor` exit-code fix; oracle fixture law substitution removed.
- Versions: workspace 26.10.8 -> 26.10.10 (members from 26.10.6), five
  internal path deps aligned, `Cargo.lock` reconciled.

### Added
- graphlaw vector-oracle court + harness; pm4py parity harness +
  reference numbers; `bench-tools index` (machine-readable bench
  inventory, 50 targets) and `bench-bootstrap`/`bench-all` chains;
  seeded baseline + receipt ledger (regress/verify/ledger/budget now
  executable); ML hold-out evaluation exports
  (`*_with_eval`, `evaluate_rf_predictor`, `predict_outcome_evaluated_wasm`,
  `detect_drift_with_threshold`); `discover_astar_bounded`;
  benchmark provenance (`datasets` field, `DatasetProvenance` labels).

## [26.10.8] — 2026-10-08

### Changed
- Versions: workspace version bumped 26.9.30 -> 26.10.8 (`Cargo.toml`
  `[workspace.package]`), the 5 internal path dependencies (`wasm4pm`,
  `wasm4pm-cognition`, `prolog8`, `miniml`, `ocpq`) aligned to 26.10.8, and
  `package.json` bumped 26.10.7 -> 26.10.8. `Cargo.lock` reconciled.

## [26.10.7] — 2026-10-07

### Changed
- Versions: `package.json` bumped 26.10.6 -> 26.10.7 (W632 lockfile
  convergence; `Cargo.lock` verified already converged, `cargo metadata`
  EXIT=0, zero diff).

## [26.10.6] — 2026-10-07

Baseline seal for the post-26.9.30 fleet campaign: workspace version bump,
CI root-cause fixes, and receipt-doctor standing documentation. No lib
source changes.

### Fixed
- CI: `cargo fmt` drift in 4 Rust files and ES2023 `toSorted` in the
  registry-closure kernel test (TS2550) that surfaced after the v26.9.30
  integration merge.
- CI: install `rdflib` and `pytest` before the TypeScript integration tests
  (interview-assist tests shell out to `python3` with both; pre-existing
  failure on main run 36502285639).

### Changed
- Versions: all workspace `package.json` versions bumped 26.9.28 -> 26.10.6
  (W601p phase-0 seal); receipt verify-ocel2 / doctor standing documentation
  in `apps/wasm4pm/README.md` and
  `docs/jira/26.10.6/prd_ard_receipt_truth_verification.md`; refreshed the
  algorithm-selection-with-scaling test.

## [26.9.30] — 2026-09-30

First crates.io release since 26.7.1 (no 26.8.x or 26.9.x version of any crate
was ever published to crates.io). Published set, in dependency order: `prolog8`,
`miniml`, `wasm4pm-cognition`, `wasm4pm`. `wasm4pm-ex4pm-bindings`,
`wasm4pm-cmca` and `bench-tools` stay `publish = false`.

### Changed
- `wasm4pm-ex4pm-bindings` WASM artifact is now linked from a `staticlib`
  with `rust-lld`, exporting only the 70 `export_name` symbols
  (`crates/wasm4pm-ex4pm-bindings/scripts/build-wasm.sh`): 0 host imports
  (was 87 `__wbindgen_*`) and 71 exports (was ~3300); the script fails on any
  import or missing export.
- `alpha_plus_plus_inner` and the OC-Petri-net flatten helper return
  `Result<_, String>` internally (`*_pure` variant); the wasm-bindgen-exported
  signatures are unchanged.
- `wasm4pm` crate package excludes the BPI_2020 `.xes` test logs so the
  `.crate` stays well under the 10 MB crates.io limit.
- Versions: workspace, `wasm4pm`, `wasm4pm-cognition`, `prolog8`, `miniml`,
  `ocpq` bumped to 26.9.30. `wasm4pm-ex4pm-bindings` stays at 26.8.27.

### Known limitations
- The `*_replay_v1` exports of `wasm4pm-ex4pm-bindings` only check that the
  recomputed response is non-empty; they do not verify a digest.

## [26.8.27] — 2026-08-27

### Added
- `crates/wasm4pm-ex4pm-bindings` (new workspace member): C-ABI host bindings
  for ex4pm integration — Phase-1 process-intelligence exports (discover,
  conform, simulate, optimize, powl_mine) with `_replay_v1` companions, and
  Phase-2 thin wrappers over existing wasm4pm/prolog8 algorithms (survival,
  markov, bayesian, ocpq_eval, strips_plan, htn_plan, ctl_check,
  allen_temporal, oc_discover, align, etc_precision, soundness, playout,
  prolog_query).
- `alloc_v1`/`dealloc_v1` exports closing the host-write gap in the ptr/len
  ABI.
- Phase-4: 14 statistics/ML bindings drawn from `wasm4pm::ml`, `hand_stats`,
  and `prediction_drift` (39 crate tests).

## [26.7.23] — 2026-07-23

### Fixed
- Cognition code-projection hardening: complete refusal receipts preserved as
  tests; projected lookup keys, graph nodes, and grid traversal constrained
  to hashable/regular input.
- Interview assistant: unbroken Next.js production build and CI lockfile
  drift; Chicago visual TDD contract and Playwright visual lifecycle
  commands.

### Added
- `ALGORITHM_AND_BREED_STATUS.md` and the CLI docs generator
  (`apps/wasm4pm/scripts/gen-cli-docs.ts`).

## [26.7.1] — 2026-07-01

First-principles project refocus: repository hygiene, CI root-cause fixes, a
correctness fix closing a native/WASM test-coverage gap, and a new native
temporal/PDDL planning crate.

### Added
- `crates/wasm4pm-planner`: PDDL-subset temporal planner (parse/ground/schedule/
  admission/receipt/capability_router) with prolog8 admission gating and its own
  MCP server binary (`wasm4pm-planner-mcp`). Distinct from `packages/planner`
  (TS execution-plan DAGs for process-mining configs) — see ADR note in
  `crates/wasm4pm-planner/README.md`.
- `crates/wasm4pm-cognition/tests/gated_dispatch_ocel_conformance.rs`: 26 native
  tests routing representative breeds through the gated `run_breed()` conformance
  path, closing a coverage hole where native tests exclusively used the
  gate-skipping `dispatch_breed_test()`.
- `@wasm4pm/agents` re-introduced (previously removed in 26.6.25) with honest
  execute semantics: `_applyCorrection`/`_createSnapshot` report explicit
  `not_implemented` instead of fabricating success telemetry.

### Fixed
- **CI**: `test.yml` passed empty `${{ matrix.rust }}` to the toolchain action
  (matrix key is `rust-version`) — broke every POSIX CI leg. A tracked file
  named `nul` (Windows-reserved) broke every Windows checkout.
- **Cognition conformance** (39 failures → 0): native tests skip the OCEL
  conformance gate entirely, so lifecycle-model gaps and stale TS test
  contracts went undetected. Reconciled `ELIZA_MODEL`'s phase kinds with the
  breed's documented fallback path; fixed `csp_ac3` to report `unsat` (was
  `None`, violating its own postcondition); updated ~34 stale TS assertions/
  fixtures across 13 breeds to match current output shapes (paper-provenance
  value assertions kept, not weakened).
- `models.rs`: streaming conformance checker now falls back to place marking
  for initial tokens.
- `validate.ts`: OCEL validation now accepts camelCase `eventTypes`/
  `objectTypes` and object-shaped `object_types`.

### Removed
- `packages/autopm`, `packages/agent-context` — zero importers in the product
  dependency graph.
- `crates/wasm4pm-lsp` — already workspace-excluded (out-of-repo `lsp-max`
  dependency, unbuildable in a clean checkout); revival path noted in
  `Cargo.toml`.

### Changed
- Doc-truth reconciliation: breed count corrected to 55 everywhere (was
  52/39/21 across CLAUDE.md/README/architecture doc) — `breeds/registry.json`
  is the single source of truth.
- `crates/prolog8`: continued NAF/SLD-resolution kernel work (backtracking
  solver, PARARULE-Plus falsification suite, 10s benchmark wall clock).

### Known issues (pre-existing, out of scope for this release)
- `apps/wasm4pm` CLI test suite: ~206 pre-existing failures, none touching
  files changed in this release. Root causes: local Node 25 made
  `process.stdout` a getter-only property, breaking a mock pattern used by
  many test files (CI pins Node 22/24, unaffected); a backlog of documented
  input-validation gaps (test names prefixed `gap:`, e.g. `batch --workers`
  validation).

## [26.6.25] — 2026-06-25

### Added
- POWL v2.0 semantics: complete ChoiceGraph implementation with full node/edge traversal, start/end sentinel removal, and validated construction via `ChoiceGraph::new`
- POWL v2 test coverage: conformance, soundness, footprint, token replay, and cross-validation tests updated for v2 API
- wasm4pm-compat v26.6 dependency pinned across all Rust crates

### Changed
- `powl_arena.rs`: migrated `ChoiceGraph::new_raw` calls to `ChoiceGraph::new` (API change in wasm4pm-compat v26.6)
- `powl_parser.rs`: updated edge index types and error formatting for v2 ChoiceGraph API
- `powl_api.rs`: removed `start_idx`/`end_idx` from `node_info_json` output (no longer part of public ChoiceGraph contract)
- `more_discovery.rs`: removed `ProcessTreeOperator::Or` mapping (not in wasm4pm-compat v26.6 API)
- Deleted `packages/agents` (superseded by cognition layer + MCP server architecture)

## [Unreleased]

## [26.6.9] — 2026-06-09

### Changed
- Upgraded pnpm 8.15.4 → 11.5.2; fixed workspace:* dependencies
- Aligned all license metadata to BUSL-1.1
- Added COMMERCIAL_LICENSE.md, SECURITY.md, NOTICE, THIRD_PARTY_LICENSES
- Added OTLP exporter for production telemetry
- Fixed to_js silent data-loss bug on wasm32 (8 sites in ilp_discovery.rs + final_analytics.rs)

## [26.6.8] — 2026-04-28

### Added
- 38 algorithms in kernel registry; Prolog8 engine; POWL analysis; social network mining
