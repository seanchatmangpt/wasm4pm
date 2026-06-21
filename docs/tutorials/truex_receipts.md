# Tutorial: Truex Receipt Verification

Truex verifies object-centric OCEL 2.0 execution envelopes with deterministic canonicalization and BLAKE3 digests. This tutorial walks through admitted and refused receipts using the `wpm` CLI.

## Prerequisites

The CLI requires the Node.js WASM target (once per clone):

```bash
cd crates/wasm4pm-cognition && wasm-pack build --target nodejs --out-dir pkg -- --features wasm && cd ../..
```

Run from the monorepo (global publish is not yet available):

```bash
pnpm exec --filter @wasm4pm/cli wpm truex verify examples/out/truex_ocel2_valid.json
```

## Step 1: Verify an Admitted Receipt

Sample envelope: [`examples/out/truex_ocel2_valid.json`](../../examples/out/truex_ocel2_valid.json).

```bash
wpm truex verify examples/out/truex_ocel2_valid.json
```

Expected: exit code `0`, status `ReceiptAdmitted`, equivalence class `EquivalentUnderProfileV1`.

For automation or CI:

```bash
wpm truex verify examples/out/truex_ocel2_valid.json --format json
```

## Step 2: Verify a Refused Receipt (Correct Failure)

A tampered envelope must refuse cleanly — not panic or return a generic error.

```bash
wpm truex verify examples/out/truex_ocel2_forged.json
```

Expected: non-zero exit, structured refusal status (e.g. `ReceiptForged` or `CanonicalizationMismatch`). Correct refusal is a successful boundary operation.

Additional sample envelopes under `examples/out/`:

| File | Purpose |
|------|---------|
| `truex_ocel2_valid.json` | Admitted baseline |
| `truex_ocel2_forged.json` | Tampered batch hash |
| `truex_ocel2_fraudulent.json` | Invalid transition path |

## Step 3: Understand the Canonical Profile

The verifier applies the **JCS-OCEL** rules before hashing:

1. Timestamps forced to UTC with `Z` suffix
2. Object keys sorted lexicographically
3. Arrays sorted by deterministic composite keys (`ocel:id`, event-object tuples, etc.)
4. `ocel2_batch_hash = BLAKE3(canonical_ocel2)`
5. `receipt_hash = BLAKE3(session_id + ":" + ocel2_batch_hash + ":" + expected_path_hash)`

Full specification: [Truex OCEL 2.0 Canonical Profile](../truex-ocel2-canonical-profile.md).

## Step 4: Optional TypeScript Demos

Edge capture and standalone verifier demos live under `examples/`:

```bash
# Standalone TS verifier (educational; see note below)
pnpm dlx tsx examples/truex-cli.ts verify examples/out/truex_ocel2_valid.json

# OTLP egress capture demo (generates sample payloads)
pnpm dlx tsx examples/truex-cli.ts capture
```

**Important:** Authoritative verification for production and CI is **`wpm truex verify`** (Rust/WASM). The TypeScript demos in `examples/truex-cli.ts` and `examples/truex-capture-otlp.ts` share the same JCS-OCEL canonicalization and BLAKE3 hashing via `examples/truex-canonical.ts` for cross-tool parity testing.

Cross-tool parity baseline:

```bash
pnpm dlx tsx scripts/examples/truex-cross-tool-parity.ts
```

## Next Steps

- [Truex Jobs-To-Be-Done](../JTBD.md) — persona-driven use cases
- [OTEL Configuration](../how-to/configure_observability.md) — observability wiring
- [CLI and API Map](../orientation/05-cli-and-api-map.md) — SDK boundary (`kernel.truexVerify`)
- [Getting Started](getting_started.md) — process discovery with `wpm run`
