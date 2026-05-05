# AGENT4-002: Implement 14 Missing CLI Commands

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 80 hours  
**Complexity:** High  
**Type:** Feature Implementation  

## Summary

Agent 4 promised 20 CLI commands in CLAUDE.md but only 6 are implemented (~35% feature parity). 14 commands are missing, making the CLI unusable for announced features.

## Missing Commands

| Command | Purpose | Impact |
|---------|---------|--------|
| `wpm predict` | Run prediction tasks (6 perspectives) | **HIGH** — Core feature |
| `wpm drift-watch` | Monitor for concept drift | **HIGH** — Core feature |
| `wpm ml` | Run ML algorithms (6 tasks) | **HIGH** — Core feature |
| `wpm powl` | Analyze POWL models | **MEDIUM** |
| `wpm quality` | Assess model quality (4 metrics) | **HIGH** |
| `wpm conformance` | Check log-to-model fitness | **HIGH** |
| `wpm validate` | Validate event logs | **MEDIUM** |
| `wpm simulate` | Monte Carlo simulation | **MEDIUM** |
| `wpm temporal` | Analyze temporal patterns | **MEDIUM** |
| `wpm social` | Mine social networks | **LOW** |
| `wpm autoprocess` | Autonomic process optimization | **MEDIUM** |
| `wpm doctor` | Diagnostic checks (17 checks) | **MEDIUM** |
| `wpm explain` | Algorithm/perspective explanations | **MEDIUM** |
| `wpm init` | Scaffold config files | **HIGH** |
| `wpm results` | Manage saved results | **MEDIUM** |

**Implemented (6):** `wpm run`, `wpm compare`, `wpm diff`, `wpm watch`, `wpm status`, `wpm agent`

**Missing (14):** All listed above

## Acceptance Criteria

### 1. Core Commands (High Priority)
```bash
# Prediction tasks (6 perspectives)
$ wpm predict next-activity -i log.xes
$ wpm predict remaining-time -i log.xes
$ wpm predict outcome -i log.xes
$ wpm predict drift -i log.xes
$ wpm predict features -i log.xes
$ wpm predict resource -i log.xes

# ML analysis (6 algorithms)
$ wpm ml classify -i log.xes --features [...] --target [...]
$ wpm ml cluster -i log.xes --k 5
$ wpm ml forecast -i log.xes --type throughput
$ wpm ml anomaly -i log.xes --alpha 0.2
$ wpm ml regress -i log.xes --features [...] --target [...]
$ wpm ml pca -i log.xes --n-components 5

# Quality assessment
$ wpm quality -i log.xes --model dfg.json
$ wpm conformance -i log.xes --model petrinet.json
$ wpm validate -i log.xes
```

### 2. Utility Commands
```bash
# Initialization
$ wpm init --preset balanced
$ wpm init --interactive

# Result management
$ wpm results list
$ wpm results view <id>
$ wpm results compare <id1> <id2>
$ wpm results delete <id>

# Help/Explanation
$ wpm explain dfg
$ wpm doctor
$ wpm status --full
```

### 3. Exit Code Contract
All commands must use correct exit codes:
- 0 = SUCCESS
- 1 = CONFIG_ERROR
- 2 = SOURCE_ERROR
- 3 = EXECUTION_ERROR
- 5 = SYSTEM_ERROR

### 4. Output Formats
All commands support:
- `--format human` (default, colored)
- `--format json` (structured JSON)
- `--format table` (columnar, if applicable)

### 5. Configuration
All commands respect 5-layer precedence:
1. CLI flags (highest)
2. TOML file
3. JSON file
4. Environment variables
5. Defaults (lowest)

## Implementation Plan

### Phase 1: Prediction Commands (24 hours)
1. Create `apps/wasm4pm/src/commands/predict.ts`
2. Implement all 6 prediction perspectives
3. Wire to `@wasm4pm/kernel` prediction system
4. Output formatting (human/json/table)
5. Error handling and exit codes
6. 8+ integration tests

### Phase 2: ML Commands (24 hours)
1. Create `apps/wasm4pm/src/commands/ml.ts`
2. Implement all 6 ML algorithms
3. Parameter handling (k, window size, threshold)
4. Output formatting with result summaries
5. Error handling and validation
6. 8+ integration tests

### Phase 3: Quality/Conformance (12 hours)
1. Create `apps/wasm4pm/src/commands/quality.ts`
2. Create `apps/wasm4pm/src/commands/conformance.ts`
3. Create `apps/wasm4pm/src/commands/validate.ts`
4. Implement quality metrics (fitness, precision, generalization, simplicity)
5. Error handling
6. 6+ integration tests

### Phase 4: Utility Commands (12 hours)
1. Create `apps/wasm4pm/src/commands/init.ts`
2. Create `apps/wasm4pm/src/commands/results.ts`
3. Create `apps/wasm4pm/src/commands/explain.ts`
4. Create `apps/wasm4pm/src/commands/doctor.ts` (enhance existing)
5. Wire result persistence to CLI
6. 6+ integration tests

### Phase 5: Additional Commands (8 hours)
1. Create `apps/wasm4pm/src/commands/simulate.ts`
2. Create `apps/wasm4pm/src/commands/temporal.ts`
3. Create `apps/wasm4pm/src/commands/powl.ts`
4. Basic implementations, minimal options
5. 4+ integration tests

## Metrics

- Lines of code: ~5,000
- Files created: 14 command files
- Files modified: 3 (cli.ts, exit-codes.ts, output.ts)
- Test coverage: 30+ integration tests
- Complexity: High (varied implementations)

## Dependencies

- `@wasm4pm/kernel` (prediction, ML)
- `@wasm4pm/config` (config resolution)
- `@wasm4pm/testing` (CLI harness)
- No new npm dependencies

## Blockers

- AGENT4-001: Exit code contract must be fixed first
- AGENT1-001: Introspection APIs needed for explain command
- AGENT2-001: Config presets needed for init command

## Related Issues

- AGENT3-001: Wire SHACL validator (quality/conformance validation)
- AGENT9-002: OTEL instrumentation (all commands emit spans)
