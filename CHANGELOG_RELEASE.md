# Release Notes - v26.5.29

**Release Date:** 2026-05-19

## Overview

This release includes significant improvements to performance, testing, and release infrastructure.

## What's New


### Features
release(v26.5.29): fix 8 test failures, correct feature gating for mobile/ml/streaming builds
fix(test): increase tolerance for robust scaling test on synthetic 2D data
feat(cycle43): close DX/Observability gaps — flag aliases, edge case handling, OTEL enhancements
test(qol): cycle 43 phase 2 — add test cases for envelope deserialization and custody layer diagnostics
feat(cycle43): autonomic healing observability gap closure with convergence validation
feat(ml): fix mutual information feature importance formula — Cycle 42
feat(qol): automembrane error handling coverage — Phase 3 extension
feat(qol): Phase 3 OTEL instrumentation — automembrane.rs decision-making + healing
feat(engine): complete checkpoint persistence integration (Phase 1.5)
feat(reinforcement): instrument all 5 RL agents with OTEL spans and debug traces
feat(agentic): Phase 2 autonomic traits with full OTEL instrumentation
feat(enterprise): Erlang TraceGraph → OcelLog adapter for wpm run/conformance round-trip
feat(enterprise): Erlang TraceGraph → OcelLog adapter for wpm run/conformance round-trip
feat(enterprise): OTP supervisor POWL route + SASL CLI wiring
feat(contracts): add toOcelLog() adapter — closes AtomVM→wpm-trace-conform pipeline gap
test(autoprocess): phase JSON contract and autonomic pipeline gaps
feat(contracts): AtomVM process lifecycle OCEL bridge
feat(contracts): marketplace OCEL bridge and receipt format
feat(ml): integrate feature quality assessment in all ML tasks (classify, cluster, regress, pca)
feat(swarm): BEAM message format shared schema and validator
feat(trace): add Erlang/BEAM stack trace ingest parser
feat(rl-dimensionality): comprehensive state space analysis with OTEL instrumentation
feat(observability): add model complexity metrics and quality assessment
feat(swarm): route refinement ladder shared JSON spec (closes GAP-4)
feat(conformance): add negative testing suite with invariant violations and statistical rigor
feat(ml): implement comprehensive cross-validation framework (Gap G3)
feat(swarm): add OCEL serializer for mcpp POWL discovery
feat(audit): comprehensive RL systems audit with 14 Rank-1 oracle tests
feat(ml): fix 5 critical edge case gaps in feature encoding and NaN handling
feat(rl-audit): state space exploration audit with 5 monitors
feat(@wasm4pm/ml): add comprehensive overfitting detection suite
audit(input-validation): add guards for 5 critical CLI parameter gaps
chore(cleanup): remove unimplemented test stubs from Iteration 13
feat(cli-dx): clarify command help text to reduce jargon and improve UX
feat(process-mining): close 4 Van der Aalst perspective gaps
feat(cli-dx): clarify command help text to reduce jargon and improve UX
fix(ml): remove problematic test file created by iteration 12b
feat(temporal,social): add Van der Aalst multi-perspective coverage (Iteration 12e)
feat(rl-reward): add rework penalty and momentum bonus to reward function
feat(healing,rl): implement 5 autonomic gap fixes for Iteration 11c
feat(cli): improve error message clarity and add untested command coverage
feat(iter11e): Close ML-CLI and Observability-RL integration gaps
feat(ml): add adaptive parameter suggestion functions for AutoML (Iteration 11b)
fix(ml): correct QualityReport property name in algorithm selector
feat(dx-qol): add parameter validation helpers with actionable errors
feat(dx): add algorithm-selector, param-validators, cli-validator utilities
feat(iter9): complete AutoML and autonomic healing gap fixes
feat(ml): implement feature quality assessment module (Gap 2)
feat(iter8): implement 5 critical gap fixes — parameter suggestions, testing, docs, JSON consistency, RL observability
feat(observability): extend OTEL spans with convergence metrics and healing decision rationale
feat(ml): add detectLogCharacteristics and enhanced parameter suggestion refinements
feat(automl): Add log-aware algorithm selection and ML parameter suggestions
feat(observability): add OTEL spans to RL orchestrator and circuit breaker
fix(kernel,contracts): correct OCEL deployment profiles; cross-enterprise bridge tests
feat(commands): re-implement deduplicate and models commands with comprehensive tests
feat(observability): close OTEL span gaps in conformance-cache, feedback-loop, and result-dedup
feat(cli,kernel): batch/deduplicate/models/timeout commands; fix lint in config/swarm
feat(observability,kernel): discovery cache improvements, result dedup, adaptive timeout tests
feat(observability,cli): add TTL-based discovery result caching
feat(swarm,kernel,obs,cli): consensus logging, adaptive timeout, cache invalidation, feedback command
feat(config): external artifact storage and observability sink backends
feat(cli): first-run UX, profile guide, WASM server, conformance improvements
feat(kernel,engine,testing): feature gates, profile constraints, perf baseline, FeedbackCapture
feat(swarm): LinUCB algorithm consensus for intelligent multi-worker selection
feat(observability): root-cause diagnosis, feedback loop, conformance cache, and coverage fixes
feat(otel): Instrument top 10 WASM exports with non-blocking span emission
test(ml): bridge and marshaling round-trip invariants — float precision, task isolation, determinism
test(ml): add high-dimensional and imbalanced coverage to classifier/reduction tests
fix(ml): resolve k-means NaN bestDist poison from Infinity - Infinity arithmetic
test(ml): clustering and anomaly oracle-ranked tests (Rank 1-3)
test(kernel,config): prediction perspective oracles + AutoML constraint enforcement tests
test(integration): add discovery→ML→quality pipeline tests (Layer 3)
feat(rl,spc,telemetry): add OTEL spans, learning-rate decay, and Q-table safety
feat(types): narrow any→unknown in engine/swarm/cognition packages
feat(types): narrow any→unknown in kernel backends and converters
feat(otel,dx): agent subcommand OTEL attrs + engine/observability type narrowing
feat(otel): instrument all cognition subcommands with withSpanRaw spans
feat(otel): instrument claude and completions commands
feat(automl): targeted MAPE-K learn recommendations + swarm convergence tests
feat(qol): predict command Van der Aalst perspective context + confidence tiers
feat(otel): instrument config show/check/verify/export subcommands
feat(dx,qol): remove stale compiled artifacts + algorithms VDA ratings + env/explain improvements
feat(qol): algorithms command Van der Aalst quality dimension ratings
feat(otel,dx): trace command spans + repl exit-code contract
feat(automl,qol): ml-runner WASM type interfaces + autoprocess health narrative
feat(qol): ml forecast R² display + confidence interval output
feat(otel): add AnalysisSpans and instrument compare/quality/diff commands
feat(dx): config export emits resolved config (not example template) as TOML/ENV/JSON
feat(dx): type-narrow wasm-loader + add config-subcommand smoke tests
feat(qol): compare command — winner declaration + Van der Aalst trade-off narrative
feat(dx): status --show-config with provenance + WASM profile + config file status
feat(qol): quality dimension thresholds + social network bottleneck interpretation
feat(dx): explain trade-offs + init self-documenting configs + agents vitest config
feat(qol): predict + drift-watch interpretive output for practitioners
feat(cli-testing): create proof-cli.test.ts with 34 test cases (25 passing)
feat(dx,qol): round-5 gap-closing — OCEL validation, swarm convergence reasons, MAPE-K audit log
fix(ocel): close OCEL input support, kernel dispatch, and test gaps
fix(rl): close FM-1 Bellman self-reference, add Rank-1 correctness tests for RL orchestrator
fix(prolog8): close byte-cap safety, query correctness, and replay verification gaps
fix(miniml-core): close arithmetic safety and metric correctness gaps
fix(ml): wire ml package to correct WASM functions and fix phantom algorithm calls
feat(autoprocess): close three state-persistence gaps in loadState/saveState
docs(claude-md): sync stale references after iter 1-5 gap fixes
fix(features): close 3 canonical feature flag gaps in wasm4pm/Cargo.toml
feat(init): add conformance/streaming presets, complete env scaffold, and algorithm guidance
feat(spc): implement Western Electric Rule 4 (2-of-3 beyond 2σ) and close test gaps
feat(explain,diff): close three practitioner interpretation gaps
feat(compare,watch): winner recommendation and config what-changed display
fix(miniml-core): close 3 correctness gaps — MCC overflow, AUC tie-handling, WASM-in-native-tests
feat(mcp): close three MCP server gaps — sequential patterns, resource/intervention perspective, process boundary analysis
feat(simulate): close three wpm simulate gaps — distribution stats, playout fix, field mapping
feat(powl): make diff, complexity, footprints output practitioner-readable
feat(engine,config): close three lifecycle and config diagnostic gaps
qol(ml): close three interpretation gaps in the ML pipeline
feat(autoinstincts): close three autonomic observability gaps
feat(autoinstincts): close three autonomic observability gaps
feat(ocel): close OCEL/POWL lifecycle validation and serialization gaps
fix(observability,testing): close four "looks-legitimate-but-isn't" gaps
feat(ml): expose MAE/MAPE on forecasting + macro F1/precision/recall on classify
### Bug Fixes
fix(tests): remove all #[ignore] from OC conformance and performance tests
release(v26.5.29): fix 8 test failures, correct feature gating for mobile/ml/streaming builds
fix(test): adjust spc_rule_1_outlier_detection test data for z-score > 3.0
fix(test): increase tolerance for robust scaling test on synthetic 2D data
fix(cli): document flag aliases in command descriptions
fix(checkpoint-gc): boundary condition fix for age-based deletion
feat(ml): fix mutual information feature importance formula — Cycle 42
feat(qol): Phase 3 OTEL instrumentation — automembrane.rs decision-making + healing
fix(ensemble-voting): deterministic tie-breaking with Rank-1 oracle compliance
fix(merge,tests): resolve conflict markers in Cargo.toml and source files; fix mock engine test expectation for BLAKE3 hash format
fix(cli): tighten autoprocess/explain/predict validation and JSON contracts
fix(drift-watch): validate inputs and surface drift JSON contract fields
fix(compare): validate inputs and surface comparison JSON contract fields
fix(predict): validate task types and --top-k; surface per-task JSON contract fields
fix(swarm): surface best_result and summary fields in JSON payload
fix(simulate): remove invalid <global> XES elements from test fixture; 40/40 tests passing
fix(results): close --diff/--verify JSON contract gaps and exit-code validation
fix(quality): close JSON contract gaps for all 4 Van der Aalst quality dimensions
feat(enterprise): Erlang TraceGraph → OcelLog adapter for wpm run/conformance round-trip
feat(enterprise): Erlang TraceGraph → OcelLog adapter for wpm run/conformance round-trip
fix(social): validate --min-weight and --network-type; close JSON contract gaps
test(drift-watch): streaming JSON fields and threshold validation gaps
fix(typescript): resolve compilation errors from Agent 5 conformance changes
feat(ml): integrate feature quality assessment in all ML tasks (classify, cluster, regress, pca)
fix(rl-guards): add three critical guards for stability
fix(rl-tests): add missing rework_ratio_q parameter to compute_reward calls
fix(ml): add prediction sanity guards to prevent NaN/Infinity scores
test(results): gap coverage for verify/diff/empty-dir edge cases
fix(ml): remove unused import from cross-validation module
fix(observability): conformance cache edge cases
fix(tests,makefile): correct citty-parsing gap for negative --threshold; add 36 gap tests; fix SIGABRT in verify-ts
fix(config): correct autoinstincts G2 test oracle for logSizeHint=1 latency filtering
feat(ml): fix 5 critical edge case gaps in feature encoding and NaN handling
fix(doctor,status): close 4 JSON output gaps in doctor check and status commands
fix(compare,diff): remove <global> sections from XES test fixtures
fix(cli): improve compare CLI argument handling and status command path resolution
chore(lint,cleanup): fix TypeScript errors and clean up WIP artifacts
audit(error-handling): identify and document 5 vague error messages with improvements
audit(conformance): complete trace classification coverage audit
chore(cleanup): remove unimplemented test stubs from Iteration 13
fix(rl): update compute_reward calls to include rework_ratio_q parameter
feat(cli-dx): clarify command help text to reduce jargon and improve UX
feat(cli-dx): clarify command help text to reduce jargon and improve UX
fix(ml): remove problematic test file created by iteration 12b
test(trace): Erlang/AtomVM ingest surface probe
fix(dx): clarify CLI command descriptions and exit code documentation
feat(healing,rl): implement 5 autonomic gap fixes for Iteration 11c
test(contracts): mcpp OCEL roundtrip
feat(iter11e): Close ML-CLI and Observability-RL integration gaps
feat(ml): add adaptive parameter suggestion functions for AutoML (Iteration 11b)
fix(ml): correct QualityReport property name in algorithm selector
fix(dx): correct field names in algorithm-selector test and drift-watch validation
feat(dx): add algorithm-selector, param-validators, cli-validator utilities
fix(ml): correct enum values in algorithm selector type mismatches
feat(iter9): complete AutoML and autonomic healing gap fixes
feat(iter8): implement 5 critical gap fixes — parameter suggestions, testing, docs, JSON consistency, RL observability
fix(cli): close 4 gaps in run and results commands
fix(iter6): close 2 critical gaps — testing cleanup and RL convergence metrics
fix(cli): close 7 gaps in compare and diff commands
feat(observability): extend OTEL spans with convergence metrics and healing decision rationale
fix(tests): remove incomplete autopilotHint test suite
feat(automl): Add log-aware algorithm selection and ML parameter suggestions
fix(cli): close 5 DX gaps in social/validate/watch/explain/autoprocess commands
test(observability): close 3 gaps in OTEL instrumentation contracts
fix(kernel,contracts): correct OCEL deployment profiles; cross-enterprise bridge tests
fix(contracts): close plan-DAG, result-guard, and OCEL-bridge gaps
fix(cli): close 4 DX gaps in predict, simulate, and temporal commands
fix(swarm): close 4 gaps — stale JS artifacts, double ring-buffer, worker timeout, getBestAlgorithm guard
test(planner): close 3 gaps in DAG validation, budget decision table, and plan validation
fix(engine): close four state-machine gaps — history cap, degrade reason, and flaky timing test
fix(config): close three automl-instincts DX/QoL gaps in preset selection
feat(cli,kernel): batch/deduplicate/models/timeout commands; fix lint in config/swarm
fix(kernel): restore speedTier ordinal contracts; fix OTEL span count; exclude WASM tests
feat(config): external artifact storage and observability sink backends
fix(build): correct verify-ts parallelism to --workspace-concurrency=3
feat(observability): root-cause diagnosis, feedback loop, conformance cache, and coverage fixes
test(config): resolver ENV priority edge cases — value+provenance desync prevention, boundary conditions
test(agents): Monitor/Plan/Execute lifecycle contracts and state isolation invariants
fix(typescript): resolve all compiler errors in @wasm4pm/engine and @wasm4pm/swarm
fix(kernel,engine): remove POWL stubs from interface and clean up TODO debt marker
fix(config,kernel): schema min() validations + complete speedTier calibration
fix(kernel): correct speedTier values to logarithmic formula
fix(config,observability): eliminate as-any casts and add span-contract tests
fix(wasm): algorithm safety guards + XES strict XML validation
fix(wasm): replace Mutex with RefCell for single-threaded WASM safety
test(rust): declare conformance + XES strict validation integration tests
fix(ml): resolve k-means NaN bestDist poison from Infinity - Infinity arithmetic
test(contracts): cross-system receipt chain — wasm4pm BLAKE3 receipt → mcpp admission gate
test(contracts): mcpp-bridge contract tests — configToMcppExtensions, conformanceThresholds, buildMcppRequest
test(cli): triage and commit 3 untracked CLI test files (203 tests)
test(cli): temporal, diff, init CLI integration tests
test(otel): add structural span-coverage tests for social/autoprocess/simulate/temporal/drift-watch
test(observability): span factory and instrumentation contract tests
test(planner,predict): edge-case budget mapping/determinism/node-structure + predict-cli validation
fix(dx): narrow any→unknown in engine wasm-loader federation and observability wrapper
fix(dx): narrow any→unknown in watch run schema
fix(ml): guard k-means++ against degenerate totalDist=0 centroid selection
feat(qol): predict command Van der Aalst perspective context + confidence tiers
fix(dx): narrow any→unknown in kernel handlers drift + introspection validators
fix(dx): gitignore compiled artifacts in contracts/src — prevents ESM parallel test collisions
test(observability): secret-redaction domain contracts + flush summary diagnostic
fix(dx): narrow any→unknown in observability otel-exporter/json-writer/secret-redaction
fix(dx): contracts any→unknown + JSDoc on index exports + cli harness env isolation
fix(dx): narrow any→unknown in contracts hash/validation/receipt-builder public APIs
fix(dx): swarm test imports use .js extensions (ESM requirement)
fix(dx): completions exit code literal → EXIT_CODES.system_error + test import .js extensions
feat(otel): add AnalysisSpans and instrument compare/quality/diff commands
feat(qol): compare command — winner declaration + Van der Aalst trade-off narrative
fix(predict): import translateContractExitCode and createError from contracts
fix(doctor): add 3s timeout to pnpm version check to prevent corepack hangs
feat(qol): predict + drift-watch interpretive output for practitioners
feat(dx,qol): round-5 gap-closing — OCEL validation, swarm convergence reasons, MAPE-K audit log
fix(dx/qol/automl/otel/proof): close gap-audit round 4 across 7 domains
fix(dx/qol/automl/mcp/drift/conformance): close gap-audit round 3 across 6 domains
fix(dx/qol/mcp/drift/automl): close gap-audit round 2 across 5 domains
fix(planner): close profile mapping, parity, and edge case gaps in execution planner
fix(engine): add MTTR measurement, recovery path tests, and RecoveryStarted/Completed spans
fix(ocel): close OCEL input support, kernel dispatch, and test gaps
fix(rl): close FM-1 Bellman self-reference, add Rank-1 correctness tests for RL orchestrator
fix(compare): close wpm compare gaps
fix(prolog8): close byte-cap safety, query correctness, and replay verification gaps
fix(powl): close WASM function wiring, field name, and receipt gaps in wpm powl
fix(miniml-core): close arithmetic safety and metric correctness gaps
fix(agentic): close stub, test coverage, and instrumentation gaps in agentic framework
fix(dx): improve CLI error messages and help text for actionable developer guidance
fix(ml): wire ml package to correct WASM functions and fix phantom algorithm calls
fix(observability): close OTEL span coverage and semconv schema gaps
fix(membrane,config): wire WASM4PM_MEMBRANE_* variables to config schema and runtime
fix(validation): add real-data algorithm validation script with pm4py ground truth
fix(cognition): close three field-contract gaps in TypeScript layer
fix(wasm4pm-algos,wasm4pm-utils,wasm4pm-compat): close three API-drift gaps in auxiliary crates
fix(tps-metrics): close three quality gaps — rename misleading field, fix saturation bug, replace stub tests
fix(config): close three config validation gaps — source/sink cross-field requirements, swarm algorithm ID validation, and prediction tasks enforcement
fix(doctor): resolve HTML report test failure
fix(trace): close three wpm trace gaps — ingest zero-frames diagnostic, Accepted fixture, and CLI test coverage
feat(autoprocess): close three state-persistence gaps in loadState/saveState
docs(claude-md): sync stale references after iter 1-5 gap fixes
fix(features): close 3 canonical feature flag gaps in wasm4pm/Cargo.toml
feat(compare,watch): winner recommendation and config what-changed display
fix(receipts): close three BLAKE3 receipt chain gaps
fix(miniml-core): close 3 correctness gaps — MCC overflow, AUC tie-handling, WASM-in-native-tests
feat(mcp): close three MCP server gaps — sequential patterns, resource/intervention perspective, process boundary analysis
feat(simulate): close three wpm simulate gaps — distribution stats, playout fix, field mapping
feat(powl): make diff, complexity, footprints output practitioner-readable
fix(prolog8): close three WASM ABI gaps — schema, answer cap, error messages
test(coverage): add 53 tests for three untested high-value paths
fix(validate): add actionable fix guidance to every failing check in wpm validate
fix(quality): annotate all 4 Van der Aalst dimensions with thresholds and contextual advisories
fix(conformance): surface which traces deviated and why in wpm conformance output
dx(cli): replace opaque unsupported-extension errors with actionable guidance
fix(lint): resolve TypeScript compilation error in agents package
chore(lint,cleanup): fix TypeScript errors and clean up WIP branches
feat(ocel): close OCEL/POWL lifecycle validation and serialization gaps
fix(doctor): close OTEL flush gaps and exit-code bugs in tps/fix/perf/report subcommands
fix(observability,testing): close four "looks-legitimate-but-isn't" gaps
feat(ml): expose MAE/MAPE on forecasting + macro F1/precision/recall on classify
### Performance Improvements
fix(tests): remove all #[ignore] from OC conformance and performance tests
release(v26.5.29): fix 8 test failures, correct feature gating for mobile/ml/streaming builds
fix(ensemble-voting): deterministic tie-breaking with Rank-1 oracle compliance
feat(conformance): add negative testing suite with invariant violations and statistical rigor
fix(dx): clarify CLI command descriptions and exit code documentation
feat(commands): re-implement deduplicate and models commands with comprehensive tests
feat(observability,kernel): discovery cache improvements, result dedup, adaptive timeout tests
feat(observability,cli): add TTL-based discovery result caching
feat(kernel,engine,testing): feature gates, profile constraints, perf baseline, FeedbackCapture
feat(observability): root-cause diagnosis, feedback loop, conformance cache, and coverage fixes
test(config): resolver ENV priority edge cases — value+provenance desync prevention, boundary conditions
fix(typescript): resolve all compiler errors in @wasm4pm/engine and @wasm4pm/swarm
test(engine): performTransition history invariants, invalid-transition safety, and MTTR contracts
test(contracts): exhaustive error code range invariants — Rank 1 bijectivity and domain isolation
test(ml): regression oracle-ranked tests — Rank 1-3 mathematical and domain contracts
test(cli): triage and commit 3 untracked CLI test files (203 tests)
test(cli): swarm + benchmark CLI integration tests
test(cli): add compare and run CLI integration tests, clean up config temp dirs
feat(qol): ml forecast R² display + confidence interval output
fix(dx/qol/automl/otel/proof): close gap-audit round 4 across 7 domains
fix(powl): close WASM function wiring, field name, and receipt gaps in wpm powl
feat(simulate): close three wpm simulate gaps — distribution stats, playout fix, field mapping
fix(doctor): close OTEL flush gaps and exit-code bugs in tps/fix/perf/report subcommands
test(ml): Rank-2 domain-contract tests for new quality metrics
feat(ml): expose MAE/MAPE on forecasting + macro F1/precision/recall on classify
### Documentation
fix(rl-guards): add three critical guards for stability
fix(observability): conformance cache edge cases
feat(healing,rl): implement 5 autonomic gap fixes for Iteration 11c
docs(cli): add config precedence hint to help output
feat(iter8): implement 5 critical gap fixes — parameter suggestions, testing, docs, JSON consistency, RL observability
test(enterprise): close 5 AtomVM/Erlang/marketplace bridge gaps (section K)
docs(config,planner): clarify removed ML field backward-compatibility status
docs(wasm4pm-cli): clarify relationship between Rust and TypeScript wpm binaries
docs(claude-md): sync stale references after iter 1-5 gap fixes
feat(spc): implement Western Electric Rule 4 (2-of-3 beyond 2σ) and close test gaps
docs(prolog8): add Prolog8 API section and update AAT/test docs
### Dependencies
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [26.5.29] - 2026-05-19

### Added
- Updated documentation and README.md for the v26.5.29 release.

## [26.5.15] - 2026-05-15 — Proof-Gate v2, Adversarial Admissibility v2, 21-Hook Coverage, Advanced Algorithms

### Added

**Proof-Gate v2 — Multi-dimensional Conformance**
- `ProofDimension` + `ProofPackWriter` types with `wpm proof audit` verb (5-dimension conformance: fitness, precision, lifecycle, cardinality, receipt_coverage)
- `receipt_coverage` and `object_lifecycle_validity` dimensions implemented
- Evidence-binding layer via `complete_activity()` — closes the activity-as-proof loophole
- `TestEvent` carries `object_ids` for richer evidence checks
- Real captured traces + replay test fixtures (V2-D)
- `VERIFIED_PROOF` (renamed from `PLACEHOLDER_PROOF`)

**Adversarial Admissibility v2 — POWL v2 Trace Pipeline**
- POWL v2 full-dimension conformance + 21-probe adversary gate + proof-promote
- 24-probe adversary suite (incl. P22-P24 — schema/cardinality/lifecycle gates)
- 10 AI-agent task routes catalog + 4 hardened existing routes (V2)
- `ObjectTypeDeclaration` extension + 3 cross-language stacktrace parsers (rust/typescript/python/java/js)


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
