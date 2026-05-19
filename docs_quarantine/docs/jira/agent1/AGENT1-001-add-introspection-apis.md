# AGENT1-001: Add Introspection APIs

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 40 hours  
**Complexity:** High  
**Type:** Feature Implementation  

## Summary

Agent 1 (ML/RL DX) promised introspection APIs but delivery was not found. Users cannot discover which algorithms are available, what their characteristics are, or whether prerequisites are met before execution.

## Problem Statement

Current state:
- No `getAlgorithmMetadata()` function
- No algorithm capability matrix per deployment profile
- No error diagnostics API
- No sample dataset loader
- No WASM pre-flight checks

Users experience:
- ❌ Cannot determine algorithm availability in their profile
- ❌ Blind discovery (trial-and-error)
- ❌ Generic error messages with no remediation hints
- ❌ No way to validate before executing expensive algorithms

## Acceptance Criteria

### 1. Algorithm Metadata API
```typescript
export function getAlgorithmMetadata(name: string): AlgorithmMetadata {
  return {
    name: string;
    description: string;
    deploymentProfiles: DeploymentProfile[];
    speedScore: number;        // 0-90
    qualityScore: number;      // 0-100
    useCases: string[];
    parameters: {
      [key: string]: {
        type: 'number'|'string'|'boolean';
        min?: number;
        max?: number;
        default: any;
        description: string;
      }
    };
    examples: string[];        // Working config snippets
  };
}
```

### 2. Profile Capability Queries
```typescript
export function listAlgorithmsByProfile(profile: DeploymentProfile): string[];
export function validateAlgorithmInProfile(algo: string, profile: DeploymentProfile): ValidationResult;
export function getProfileCapabilities(profile: DeploymentProfile): ProfileCapabilities;
```

### 3. Error Diagnostics
```typescript
export function diagnoseError(error: Error): DiagnosticResult {
  return {
    rootCauses: string[];     // 3+ likely causes
    suggestions: string[];    // 3+ actionable fixes
    examples: string[];       // Code examples
  };
}
```

### 4. Sample Dataset Loader
```typescript
export function loadSampleDataset(type: 'simple'|'bpi2020'|'synthetic'): EventLog;
```

### 5. WASM Pre-flight Check
```typescript
export async function validateWasmReadiness(): Promise<{
  ready: boolean;
  version: string;
  availableAlgorithms: string[];
  warnings: string[];
}>;
```

## Definition of Done

- ✅ All 6 functions implemented and exported from `@wasm4pm/kernel`
- ✅ All 41 algorithms have complete metadata
- ✅ Error diagnostics cover 8+ error types
- ✅ 3 sample datasets load successfully
- ✅ 30+ tests covering all APIs
- ✅ Zero breaking changes to existing exports
- ✅ JSDoc on all public APIs with examples
- ✅ Integration tested with CLI

## Implementation Plan

### Phase 1: Metadata Registry (12 hours)
1. Create `packages/kernel/src/introspection/algorithms.ts`
2. Register all 41 algorithms with speed/quality scores
3. Map algorithms to deployment profiles
4. Write 10 tests

### Phase 2: Error Diagnostics (10 hours)
1. Create `packages/kernel/src/introspection/diagnostics.ts`
2. Implement 8 error type handlers
3. Generate 3+ suggestions per error
4. Write 8 tests

### Phase 3: Validators & Datasets (10 hours)
1. Create `packages/kernel/src/introspection/validators.ts`
2. Create `packages/kernel/src/introspection/datasets.ts`
3. Implement sample dataset loaders
4. Write 12 tests

### Phase 4: Integration (8 hours)
1. Wire into CLI error handling
2. Add `--explain` flags to commands
3. Test CLI integration
4. Write integration tests

## Metrics

- Lines of code: ~2,500
- Test coverage: 30+ tests
- Files created: 6
- Files modified: 2 (index.ts, package.json)

## Dependencies

- `@wasm4pm/kernel` (existing)
- `zod` (existing)
- No new npm dependencies

## Blockers

None identified.

## Related Issues

- AGENT1-002: RL agent introspection (future)
- AGENT2-001: Config presets (depends on profile metadata)
- AGENT3-001: Error handling integration
