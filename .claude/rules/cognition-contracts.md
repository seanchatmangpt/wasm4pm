# Cognition Layer — Field Contracts (Source of Truth)

These are the EXACT field names from Rust WASM output. Using any other field name is a bug.
Hooks `cognition-contract-guard.sh` and `cognition-wasm-gate.sh` enforce these at edit time.

---

## `cognition_run` output → `ContractResult`

**Source:** `crates/wasm4pm-cognition/src/wasm.rs:182-190`

```json
{
  "status": "ok",
  "breed": "<string>",
  "run_id": "<blake3-hex>",
  "output_hash": "<blake3-hex>",
  "replay_pointer": "<first 16 chars of output_hash>",
  "options_profile": "<string | null>",
  "output": { ...BreedOutput... }
}
```

**NEVER use:** `.exit_code` (undefined), `.receipt_chain` (undefined), `.findings` (not on run output), `.decision` (undefined), `.hash` (use `.output_hash`), `.inference_trace` (lives inside `.output` if breed populates it)

**Correct success check:**
```typescript
const ok = (cresult as { status?: string }).status === 'ok';
finalExitCode = ok ? EXIT_CODES.success : EXIT_CODES.execution_error;
```

**Correct receipt save:**
```typescript
const runId = (cresult as { run_id?: string }).run_id;
saveReceipt(runId, '.wasm4pm/receipts');
```

---

## `cognition_run` INPUT shape

**Source:** `crates/wasm4pm-cognition/src/wasm.rs:118-124`

Rust expects `{ breed: string, contract: BreedInput, options?: { profile?: string } }`.

**NEVER send:** bare `BreedInput` directly — Rust uses `deny_unknown_fields`, returns "missing field 'breed'".

**Correct call:**
```typescript
const inputJson = JSON.stringify({ breed, contract: input });
wasm.cognition_run(inputJson);
```

---

## `cognition_verify` output → `VerifyResult`

**Source:** `crates/wasm4pm-cognition/src/wasm.rs:226-228`

```json
{
  "findings": [...],
  "status": "verified"   // when no findings
            "has_findings"  // when detectors fire
}
```

**NEVER check:** `=== 'rejected'` — this value is never emitted. Use `=== 'has_findings'`.

---

## `system_build` output → `SystemBuildResult`

**Source:** `crates/wasm4pm-cognition/src/wasm.rs:287-290`

```json
{
  "pareto_front": [{ "id": "...", "family_id": "...", "dimensions": {...} }],
  "dominated": [{ "id": "...", "reason": "..." }]
}
```

**NEVER use:** `.candidates` — does not exist. Use `.pareto_front` and `.dominated`.

---

## `Rule` struct — required fields

**Source:** `crates/wasm4pm-cognition/src/breeds/mod.rs`

```rust
pub struct Rule {
    pub id: String,
    pub premise: Vec<String>,
    pub conclusion: String,
    pub certainty: f32,   // REQUIRED — no serde(default)
}
```

TypeScript `Rule` type MUST include `certainty: number` (or `certainty?: number` after adding `#[serde(default)]` to Rust).

---

## WASM binary prerequisite

Before editing any file in `packages/cognition/src/contract/`, `packages/cognition/src/system/`, or `packages/cognition/src/receipt/`, the WASM must exist:

```bash
test -d crates/wasm4pm-cognition/pkg   # must pass
```

If it does not exist, build it first:
```bash
cd crates/wasm4pm-cognition
wasm-pack build --target nodejs --out-dir pkg
```

Then add to `packages/cognition/package.json`:
```json
"dependencies": { "wasm4pm-cognition": "file:../../crates/wasm4pm-cognition/pkg" }
```

---

## FM-5 Rule for cognition tests

Every test file in `packages/cognition/src/__tests__/` may use `vi.mock('../init.js')` for unit-level tests.

**But:** at least one test file MUST test without mocking init.js. Otherwise 100% of WASM wrapper coverage is fabricated — deleting the binary would not cause any test to fail.

The integration test file should be named `*.integration.test.ts` or clearly not mock init.js.

---

## Watch verb field mapping

`watch.ts` receives `ContractResult` from `runContract()`. Map fields correctly:

```typescript
// WRONG — these fields don't exist
decision: result.decision === 'Allow' ? 'Allow' : 'Deny'
hash: result.hash.slice(0, 8)

// CORRECT — use actual Rust output fields
const r = result as { status?: string; output_hash?: string };
decision: r.status === 'ok' ? 'Allow' : 'Deny',
hash: typeof r.output_hash === 'string' ? r.output_hash.slice(0, 8) : '00000000',
```

## FM-5 cleanup ritual (pnpm hard-copy trap)

pnpm hard-copies file: dependencies into node_modules. Deleting only `crates/wasm4pm-cognition/pkg/` does NOT invalidate tests.

**Honest cleanup ritual:**

```bash
rm -rf crates/wasm4pm-cognition/pkg/ \
       node_modules/wasm4pm-cognition/ \
       packages/cognition/node_modules/wasm4pm-cognition/
pnpm test --filter @wasm4pm/cognition
# Integration tests MUST FAIL with module-not-found.
# If they pass, FM-5 is violated — tests are not exercising real WASM.
```

After validating, restore via `cd crates/wasm4pm-cognition && wasm-pack build --target nodejs --out-dir pkg -- --features wasm && cd ../.. && pnpm install`.
