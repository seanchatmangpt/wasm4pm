# Cognition Layer — Field Contracts (Source of Truth)

EXACT field names from Rust WASM output (`crates/wasm4pm-cognition/src/wasm.rs`). Any other name is a bug. Enforced by hooks `cognition-contract-guard.sh` / `cognition-wasm-gate.sh`.

## cognition_run output (`ContractResult`, wasm.rs:182-190)
`{ status: "ok", breed, run_id, output_hash, replay_pointer (first 16 of output_hash), options_profile, output }`
- NEVER use: `.exit_code`, `.receipt_chain`, `.findings`, `.decision`, `.hash` (use `.output_hash`), `.inference_trace`
- Success check: `status === 'ok'`; receipt save uses `run_id`

## cognition_run INPUT (wasm.rs:118-124)
Send `{ breed: string, contract: BreedInput, options?: { profile? } }` — NEVER a bare BreedInput (Rust `deny_unknown_fields` → "missing field 'breed'").

## cognition_verify output (`VerifyResult`, wasm.rs:226-228)
`{ findings: [...], status: "verified" | "has_findings" }` — NEVER check `=== 'rejected'` (never emitted).

## system_build output (wasm.rs:287-290)
`{ pareto_front: [...], dominated: [...] }` — NEVER `.candidates`.

## Rule struct (breeds/mod.rs)
`{ id, premise: string[], conclusion, certainty: f32 }` — `certainty` is REQUIRED (no serde default); TS type must include it.

## WASM prerequisite
Before editing `packages/cognition/src/{contract,system,receipt}/`: `crates/wasm4pm-cognition/pkg` must exist. Build: `cd crates/wasm4pm-cognition && wasm-pack build --target nodejs --out-dir pkg -- --features wasm`.

## FM-5
At least one cognition test file must NOT mock init.js (`*.integration.test.ts`). pnpm hard-copies file: deps — honest cleanup must also trash `node_modules/wasm4pm-cognition/` and `packages/cognition/node_modules/wasm4pm-cognition/`, then integration tests MUST fail with module-not-found; restore via wasm-pack build + pnpm install.

## watch.ts mapping
Map `status === 'ok'` → Allow/Deny display; `output_hash.slice(0,8)` for short hash. Fields `decision`/`hash` don't exist on WASM output.
