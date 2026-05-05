# @wasm4pm/testing

Test harnesses for the pictl monorepo. Provides parity, determinism, CLI, OTEL, and certification testing infrastructure.

## Harnesses

```typescript
// Parity: explain() output matches plan() structure
import { checkParity, checkParityBatch } from '@wasm4pm/testing';

// Determinism: same input → same output (receipt hash stable)
import { checkDeterminism, stableReceiptHash, receiptsMatch } from '@wasm4pm/testing';

// CLI: run wpm commands and assert exit codes / JSON output
import { runCli, assertExitCode, assertJsonOutput, createCliTestEnv, EXIT_CODES } from '@wasm4pm/testing';

// OTEL: capture and validate OpenTelemetry spans
import { OtelCapture, createOtelCapture } from '@wasm4pm/testing';

// Certification: gate tests that must pass before merge
import { CertificationGate, runCertification } from '@wasm4pm/testing';
```

## OtelCapture

`assertRequiredAttributes()`, `assertValidTraces()`, `assertNonBlocking()` return `string[]` (violations), not void/throw. Check the returned array length.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Config error |
| 2 | Source error |
| 3 | Execution error |
| 4 | Partial failure |
| 5 | System error |

## Gotchas

- Run vitest from package directory, not monorepo root
- Read test files before declaring untested — tests may be consolidated
- `as const` is type-level only, not runtime frozen
