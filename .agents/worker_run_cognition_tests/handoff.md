# Handoff Report: Run Cognition Tests

## 1. Observation
We ran the command `pnpm --filter @wasm4pm/cognition test` within `/Users/sac/wasm4pm`. The verbatim console output observed is:

```
> @wasm4pm/cognition@26.7.1 test /Users/sac/wasm4pm/packages/cognition
> vitest run


 RUN  v1.6.1 /Users/sac/wasm4pm/packages/cognition

 ✓ src/__tests__/cognition-breeds-real-data.integration.test.ts  (13 tests) 59ms
 ✓ src/__tests__/cognition-breeds-paper-data.integration.test.ts  (39 tests) 59ms
 ✓ src/__tests__/track-c2-quality-science.test.ts  (8 tests) 12ms
 ✓ src/__tests__/contract-guard.test.ts  (19 tests) 15ms
 ✓ src/__tests__/contract-run.unit.test.ts  (6 tests) 17ms
 ✓ src/__tests__/system-shape-validation.unit.test.ts  (11 tests) 11ms
 ✓ src/__tests__/contract-wrappers.unit.test.ts  (13 tests) 8ms
 ✓ src/__tests__/chain-show-guards.unit.test.ts  (9 tests) 11ms
 ✓ src/__tests__/cognition-breeds-periodic-4.integration.test.ts  (20 tests) 90ms
 ✓ src/__tests__/cognition-breeds-periodic-1.integration.test.ts  (28 tests) 96ms
 ✓ src/__tests__/cognition-breeds-periodic-2.integration.test.ts  (28 tests) 104ms
 ✓ src/__tests__/cognition-breeds.integration.test.ts  (49 tests) 111ms
 ✓ src/__tests__/field-contracts.unit.test.ts  (35 tests) 23ms
 ✓ src/__tests__/unit/field-contract.test.ts  (38 tests) 34ms
 ✓ src/__tests__/cognition-breeds-periodic-3.integration.test.ts  (24 tests) 185ms
 ✓ src/__tests__/cognition-errors.test.ts  (6 tests) 3ms
 ✓ src/__tests__/adversarial-catalogue.test.ts  (5 tests) 4ms
 ✓ src/__tests__/bvc.test.ts  (4 tests) 5ms
 ✓ src/__tests__/unit/field-contract-sentinel.integration.test.ts  (2 tests) 8ms
 ✓ src/__tests__/cognition-wasm.integration.test.ts  (2 tests) 12ms
 ✓ src/__tests__/receipt-chain.test.ts  (6 tests) 3ms

 Test Files  21 passed (21)
      Tests  365 passed (365)
   Start at  20:08:45
   Duration  644ms (transform 1.56s, setup 1ms, collect 2.71s, tests 870ms, environment 2ms, prepare 1.24s)
```

The Git context is:
- Commit: `7ca35e38be2c1295506452e708bf9514ca9c87b2`
- Branch/status:
  ```
   M ORIGINAL_REQUEST.md
   M RELEASE_CERTIFICATE.v26.7.1.json
   M pnpm-lock.yaml
  ?? .agents/
  ?? ALGORITHM_AND_BREED_STATUS.md
  ```
- Package identity: `wasm4pm@26.7.1`

## 2. Logic Chain
1. The user requested running tests specifically for the package `@wasm4pm/cognition`.
2. We verified the path to the cognition package as `packages/cognition`.
3. We ran the test command `pnpm --filter @wasm4pm/cognition test`.
4. The output shows that all 21 test files and 365 tests passed without any errors or failures.
5. The console output has been captured verbatim and saved to `/Users/sac/wasm4pm/.agents/worker_run_cognition_tests/handoff.md`.

## 3. Caveats
- No code was changed as part of this run; this is a pure verification/testing task.
- The state of external dependencies and global configurations was assumed to be correct based on the monorepo's current state.

## 4. Conclusion
The `@wasm4pm/cognition` tests execute successfully and all 365 test cases are verified as passing.

## 5. Verification Method
To verify this independently, run:
```bash
pnpm --filter @wasm4pm/cognition test
```
The output should match the captured log above.
