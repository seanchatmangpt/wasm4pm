# OTEL Span Coverage Dashboard

**Last Updated:** 2026-04-12T00:50:58.777Z

## Overall Coverage

- **Total Functions:** 596
- **Instrumented:** 0
- **Coverage:** 0%
- **Target:** 80%
- **Status:** ❌ FAIL

## Coverage by Package

| Package | Coverage | Instrumented | Total | Missing |
|---------|----------|--------------|-------|----------|
| ❌ config | 0% | 0 | 37 | 37 |
| ❌ contracts | 0% | 0 | 102 | 102 |
| ❌ engine | 0% | 0 | 81 | 81 |
| ❌ kernel | 0% | 0 | 37 | 37 |
| ❌ ml | 0% | 0 | 19 | 19 |
| ❌ observability | 0% | 0 | 48 | 48 |
| ❌ planner | 0% | 0 | 27 | 27 |
| ❌ swarm | 0% | 0 | 29 | 29 |
| ❌ testing | 0% | 0 | 216 | 216 |

## Top Gaps

### config (37 missing)

- `hashConfig` (hash.ts:39)
- `verifyConfigHash` (hash.ts:48)
- `fingerprintConfig` (hash.ts:55)
- ... and 34 more

### contracts (102 missing)

- `getCompatibility` (compatibility.ts:63)
- `isFeatureSupported` (compatibility.ts:101)
- `getSupportedPlatforms` (compatibility.ts:114)
- ... and 99 more

### engine (81 missing)

- `bootstrapEngine` (bootstrap.ts:30)
- `createBootstrapError` (bootstrap.ts:57)
- `BootstrapKernel` (bootstrap.ts:13)
- ... and 78 more

### kernel (37 missing)

- `KernelResult` (api.ts:17)
- `PartialResult` (api.ts:38)
- `KernelStats` (api.ts:53)
- ... and 34 more

### ml (19 missing)

- `detectEnhancedAnomalies` (anomaly.ts:191)
- `buildFeatureMatrix` (bridge.ts:18)
- `encodeLabels` (bridge.ts:108)
- ... and 16 more

## How to Fix

For each missing function, add an Instrumentation call at the start:

```typescript
export function myFunction(params) {
  const span = Instrumentation.createSpan("myFunction", requiredAttrs);
  try {
    // ... implementation
    return result;
  } finally {
    span.end();
  }
}
```
