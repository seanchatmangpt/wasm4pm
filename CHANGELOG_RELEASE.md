# Release Notes - v26.5.13

**Release Date:** 2026-05-13

## Overview

This release includes significant improvements to performance, testing, and release infrastructure.

## What's New


### Features
feat(tooling): add scan-ghost-impls.sh — detect fake implementations
feat(observability): OTEL Phase C — wire agent subcommands (Round 5 cont)
feat(observability): OTEL Phase C — wire cell subcommands (Round 5 cont)
feat(observability): OTEL Phase C — wire 3 more commands (Round 5 partial)
feat(observability): OTEL Phase B+ — 5 deferred commands wired (Round 4)
feat(otel): add late-attrs callback + withSpanRaw for child-span model
feat(cli): Round 3 surfaces K, M, N, O — 11→3 failure reduction
feat(observability): OTEL Phase B — wire 5 more commands (Surface L)
feat(lab): test:published script for post-publish artifact validation
feat(observability): OTEL bootstrap + withSpan helper + receipts (Phase A)
feat(testing): runCli auto-detects built CLI binary; cli adds wasm4pm dep
feat(cli): doctor envelope + vitest WASM init + JTBD-4 honest test
feat(cli): output-shape discriminator + exit-code preflight + FM-5 deletions
feat(cognition): wasm-pack nodejs target + breed coverage + FM-5 doc
fix(xes): tag-based parser handles inline event/attribute syntax
feat(conformance): add per-trace precision to TraceReplayResult and FitnessResult
powl v2: ChoiceGraph spec compliance per BPM 2025 paper
feat(cell8): implement real proof-carrying gates and manifest storage
refactor(cognition): STRIPS frame axioms + GPS subgoal ordering (Level 10 features)
feat(cognition): Level 10 integration tests + Hearsay build_agenda fix
feat(validation): comprehensive pm4py algorithm validation framework
### Bug Fixes
release(v26.5.13): finish thesis-benchmark-numbers release
feat(tooling): add scan-ghost-impls.sh — detect fake implementations
test(correctness): add 20 algorithm-oracle tests + single-impl pattern
feat(otel): add late-attrs callback + withSpanRaw for child-span model
fix(cli): close last 3 failures — kebab init flag + handle-based DFG shape
feat(cli): Round 3 surfaces K, M, N, O — 11→3 failure reduction
feat(cli): doctor envelope + vitest WASM init + JTBD-4 honest test
feat(cognition): wasm-pack nodejs target + breed coverage + FM-5 doc
fix(makefile): check-debt whitelist .rs/.ts/.tsx, ignore gate scripts
fix(xes): tag-based parser handles inline event/attribute syntax
fix(wasm): gate tracing_subscriber init to non-wasm32 target
docs(claude): correct algorithm/package/command counts and crate naming
powl v2: fix eager-silent firing at choice points (close τ_start gap)
powl v2: integrate ChoiceGraph across all 24 POWL touchpoints
powl v2: ChoiceGraph spec compliance per BPM 2025 paper
feat(cell8): implement real proof-carrying gates and manifest storage
feat(cognition): Level 10 integration tests + Hearsay build_agenda fix
test(cognition): adversarial and counterfactual breed tests
fix(tests): remove non-functional PetriNet::new() test
fix(algos): columnar cache attribute lookup - use iterator find()
### Performance Improvements
powl v2: fix eager-silent firing at choice points (close τ_start gap)
powl v2: ChoiceGraph spec compliance per BPM 2025 paper
test(cognition): adversarial and counterfactual breed tests
### Documentation
docs(claude): correct algorithm/package/command counts and crate naming
Merge pull request #33 from seanchatmangpt/thesis-benchmark-numbers
### Dependencies
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [26.5.13] - 2026-05-13 — POWL 2.0, Cell8 Proof Gates, OTEL Phases A–C

### Added

**POWL 2.0 Process Discovery**
- Formal POWL 2.0 implementation per van der Aalst BPM 2025 paper
- `MineDG` choice-graph discovery algorithm (PM×)
- ChoiceGraph integrated across 24 POWL touchpoints
- 144 POWL tests (unit, integration, system, adversarial, pm4py validation): 100% pass; 0 regressions across 38/40 algorithms

**Cell8 Proof-Carrying Gates**
- 8 `CellReady` conjunct checks with real gate logic and evidence strings
- `cell_build` emits BLAKE3 content hash + all 8 gates + persistent manifest
- `cell_verify` returns real status (`verified` / `not_ready` / `not_found`)
- `cell_doctor` formats per-conjunct diagnostic report
- `cell_replay` does fixture determinism via BLAKE3 hash comparison
- `cell_export` emits EARL-compatible machine-readable proof assertions

**OTEL Observability — Phases A → C**
- Bootstrap + `withSpan` / `withSpanRaw` helper + receipts (Phase A)
- 22 of 29 CLI commands instrumented (Phase B/C); 7 explicit exempts + 2 deferred
- Late-attrs callback for child-span model
- `exitWithFlush` helper drains OTEL spans before `process.exit`

## Build Information

### WASM Targets
- Bundler (ES modules + Node.js)
- Node.js (CommonJS + WASM)
- Web/Browser (optimized for browsers)

### Build Flags
- RUSTFLAGS: `-C target-feature=+simd128`
- wasm-opt: `-O3 --enable-simd`
- Profile: release with LTO disabled

### Platform Support
- Node.js: 14.0.0+
- Browsers: Chrome 57+, Firefox 52+, Safari 11+, Edge 79+
- Rust: 1.70+

## Installation

### npm
```bash
npm install wasm4pm
```

### Yarn
```bash
yarn add wasm4pm
```

### pnpm
```bash
pnpm add wasm4pm
```

## Breaking Changes

None in this release.

## Migration Guide

No migration needed from v26.4.x.

## Known Issues

None reported.

## Testing

This release includes:
- 800+ unit tests
- 50+ integration tests
- Browser compatibility tests
- Performance benchmarks
- Code coverage >70%

## Contributors

See git log for full contributor list.

## License

MIT OR Apache-2.0

---

For detailed information, see:
- [README](./README.md)
- [API Documentation](./docs/API.md)
- [Algorithm Guide](./docs/ALGORITHMS.md)
- [FAQ](./docs/FAQ.md)
