# AGENT2-001: Implement 3 Config Presets

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 30 hours  
**Complexity:** Medium  
**Type:** Feature Implementation  

## Summary

Agent 2 (Config Refinement) promised 3 production-ready config presets (fast, balanced, quality) but none are implemented. The preset system is non-functional, forcing users to manually configure complex multi-section configs.

## Problem Statement

Current state:
- No executable presets in code
- No profile recommendation engine
- No config template generation
- Config resolution has no preset pathway

Users experience:
- ❌ Must manually write wasm4pm.toml or .env
- ❌ No starting point for different use cases
- ❌ Easy misconfiguration (invalid algorithm for profile)
- ❌ No guidance on fast vs. quality trade-offs

## Acceptance Criteria

### 1. Fast Preset
```toml
# wasm4pm-fast.toml
[execution]
profile = "mobile"           # Minimal WASM (500KB)
[algorithm]
name = "dfg"                 # Fastest discovery
[observability]
logLevel = "warn"            # Minimal overhead
[output]
format = "json"
```

Use cases: CI/CD, quick exploration, embedded environments  
Expected: DFG discovery in <100ms on 10K event logs

### 2. Balanced Preset
```toml
# wasm4pm-balanced.toml
[execution]
profile = "fog"              # Standard WASM (2.1MB)
[algorithm]
name = "heuristic_miner"     # Quality vs. speed balance
[observability]
logLevel = "info"
otel.enabled = true
[prediction]
enabled = true
tasks = ["next_activity", "remaining_time"]
```

Use cases: Production monitoring, real-time insights, mixed workloads  
Expected: Balanced latency/quality

### 3. Quality Preset
```toml
# wasm4pm-quality.toml
[execution]
profile = "browser"          # Full WASM (2.7MB)
timeout = 120s
[algorithm]
name = "genetic_algorithm"   # Highest quality models
parameters.population_size = 100
parameters.iterations = 50
[conformance]
method = "alignments"        # Exact (not approximate)
[observability]
logLevel = "debug"
otel.enabled = true
metrics.enabled = true
```

Use cases: Offline analysis, research, regulatory compliance  
Expected: Highest model quality, takes 10-30 seconds

### 4. Preset Loader Function
```typescript
export function getPresetConfig(
  preset: 'fast'|'balanced'|'quality'
): Config {
  // Returns validated Config object, ready to use
}

export function suggestPreset(constraints: {
  maxMemoryMb?: number;
  maxLatencyMs?: number;
  requireAlgorithms?: string[];
  requireFeatures?: string[];
}): 'fast'|'balanced'|'quality';
```

### 5. Example Files
- `examples/wasm4pm-fast.toml` — Ready to copy and use
- `examples/wasm4pm-balanced.toml`
- `examples/wasm4pm-quality.toml`
- `examples/wasm4pm-fast.json` — JSON equivalent
- `examples/.env.fast` — Environment variable preset

### 6. CLI Integration
```bash
$ wpm init --preset fast        # Create config from preset
$ wpm init --preset balanced
$ wpm init --preset quality
```

## Definition of Done

- ✅ 3 presets fully implemented and validated
- ✅ `getPresetConfig()` function works for all 3
- ✅ `suggestPreset()` recommends correct preset for constraints
- ✅ 5+ example files (TOML, JSON, env)
- ✅ CLI `wpm init --preset` integration complete
- ✅ All presets tested with actual algorithm execution
- ✅ 20+ tests covering all presets and constraints
- ✅ Documentation updated with preset guide

## Implementation Plan

### Phase 1: Preset Definitions (8 hours)
1. Create `packages/config/src/presets/definitions.ts`
2. Define 3 presets with comments explaining each section
3. Validate against schema (no type errors)
4. Write 6 tests

### Phase 2: Loader & Recommendation (10 hours)
1. Create `packages/config/src/presets/loader.ts`
2. Implement `getPresetConfig()` (validates preset, returns Config)
3. Implement `suggestPreset()` (constraints → best preset)
4. Write 8 tests
5. Integration test with resolver

### Phase 3: Examples & CLI (8 hours)
1. Create example files: wasm4pm-{fast,balanced,quality}.{toml,json}
2. Create .env.{fast,balanced,quality} examples
3. Wire `--preset` flag into `wpm init`
4. Write 4 integration tests

### Phase 4: Documentation (4 hours)
1. Update docs/configuration-guide.md with preset guide
2. Add decision tree: "Which preset for my use case?"
3. Add performance expectations per preset
4. Update CLAUDE.md with preset references

## Metrics

- Lines of code: ~1,200
- Test coverage: 20+ tests
- Files created: 5 (definitions, loader, examples)
- Files modified: 3 (index.ts, resolver.ts, cli.ts)

## Dependencies

- `@wasm4pm/config` (existing)
- `zod` (existing)
- No new npm dependencies

## Blockers

- Requires AGENT1-001 (introspection) to validate presets don't use unavailable algorithms

## Related Issues

- AGENT1-001: Introspection APIs (validation dependency)
- AGENT4-002: CLI command implementation (--preset flag)
