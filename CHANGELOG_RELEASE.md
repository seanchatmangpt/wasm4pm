# wasm4pm v26.5.15 Release Notes

**Release Date:** 2026-05-15
**CalVer:** vYEAR.MONTH.DAY → v26.5.15 = May 15, 2026
**Status:** Production Ready

## Headline

Proof-gate v2 (multi-dimensional conformance), adversarial admissibility
v2 (24 probes), 21-hook Claude Code coverage, object-centric process
mining algorithms (OC-DFG, OC-DECLARE, OC-LA, Alpha+++), and a
real-data validation suite spanning 14 test files plus 8 criterion
benches.

## What's New

### Proof-Gate v2 — multi-dimensional conformance

`ProofDimension` + `ProofPackWriter` + `wpm proof audit` verb implement
5-dimension conformance scoring (fitness, precision, lifecycle,
cardinality, receipt_coverage). New `receipt_coverage` and
`object_lifecycle_validity` dimensions close the activity-as-proof
loophole through the `complete_activity()` evidence binding.

### Adversarial Admissibility v2

POWL v2 trace pipeline with 24 adversarial probes (A1-A4, B1-B5, C1-C5,
D1-D5, E1-E5, P22-P24 for schema/cardinality/lifecycle). Hostile inputs
that previously passed audit-with-warning now refuse with typed Andon
classes. Route conformance gate enforces exactly 1.0 (0.8 is diagnostic;
admission requires unity).

### Object-Centric Process Mining

New `wasm4pm/src/advanced/` module: Alpha+++ (`alphappp.rs`),
Object-Centric DECLARE (`oc_declare.rs`), Object-Centric DFG (`ocdfg.rs`),
Object-Centric Local Alignment (`ocla.rs`). New `wasm4pm-macros/` crate
prepares the workspace for derive-macro authoring over POWL routes and
OCEL event types.

### Real-Data Validation Suite

14 integration test files (~150 KB) covering analytics, autonomic loop,
conformance, coverage gaps, filters, ML, OCEL, POWL + prediction, pm4py
cross-validation, real-world parity, and substrate certificate. 8 new
criterion benchmarks for anti-fake detection, OCEL export, parser hot
path, route-driven TDD, self-conformance. 12 audit scripts including
`scan-ghost-impls.sh`, `scan-lies.sh`, capability-matrix and
substrate-cert generators.

### REPL + CLI

`wpm repl` interactive command (load → stats → run on real XES data;
verified on `bpi2020_travel.xes` — 10,500 traces, 17 nodes / 39 edges).
`wpm run --no-retry` flag for early-exit on algorithm failure. 5
industry-domain examples (`examples/01-05-*.js`).

### Claude Code Hook Coverage — 21 Event Types

Complete documented set of Claude Code lifecycle hooks (SessionStart,
SessionEnd, PreCompact, PostCompact, plus all previous events). 31
hooks total, 4 pre-existing test failures fixed during audit.

### Documentation

3 PhD thesis chapters + 3 benchmark reports organized under
`docs/{thesis,benchmarks,validation}/`. Expanded rustdoc on `spc`,
`rl_orchestrator`, `error`, `models`, `binary_format` modules.

## Fixes

- `miniml-core` bench typo (latent E0432/E0433 hidden by
  upload-artifact deprecation since v26.5.13)
- Doctor project memory path encoding (preserved leading dash)
- `action_restart` cloud-only thread-local gating
- WASM function names in `repl` and `watch`:
  `analyze_event_statistics` + `get_trace_count` (the previously-named
  `analyze_statistics` never existed)
- Proof audit Gate 2 grep exit code + Rust target paths

## Breaking changes (release infra)

- `actions/upload-artifact@v3` → `@v4` across all release/test/bench
  workflows. v3 was deprecated by GitHub 2024-04-16 and was
  fail-fasting every CI run since v26.5.13. This unblocks real CI
  signal end-to-end.
- `LogStats` field names: `trace_count`/`event_count` →
  `total_cases`/`total_events` (matches actual WASM output).

## Cleanup

- 207 per-package vitest configs + compiled `.test.js`/`.js.map`
  consolidated under a single root vitest configuration.
- Tracked symlinks to author's `/Users/sac/.claude/rules/*` removed
  (broke CI on every non-author machine).
- Stub bench-data placeholders removed (`bpi2012_loans.xes` 0 bytes,
  etc.).
- One Windows-incompatible tracked file with literal colons in its
  path removed (caused `actions/checkout@v4` to fail on Windows
  runners with "invalid path").
- 11 finished agent worktrees pruned (content preserved as
  `wip/worktree-*` branches on origin).

## CI/CD Hardening

- Removed `continue-on-error: true` from lint/format/Rust-fmt steps in
  test, release, and bench-regression workflows. Lint failures now
  block.
- `.markdownlint.json` relaxes 4 legacy-noise rules (MD034 no-bare-urls,
  MD040 fenced-code-language, MD059 descriptive-link-text, MD060
  table-column-style) repo-wide. Preserves strictness on substantive
  rules.

## Verification

```bash
npm view @wasm4pm/cli@26.5.15 version
cargo search wasm4pm-types | head -1
git tag --verify v26.5.15
gh release view v26.5.15 --json tagName -q .tagName
```

## Stats

- 36 commits in PR #37 (the substantive release content)
- 2 commits in PR #38 (post-merge rustdoc expansion)
- +109,592 / −33,497 total lines changed
- 14 files version-bumped to 26.5.15
- 24 adversarial probes total
- 5 conformance dimensions in proof-gate v2
- 5 deployment profiles (mobile/iot/edge/fog/browser)
- 36 kernel-registered algorithms
