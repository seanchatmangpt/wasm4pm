---
name: wasm4pm Development Workflow
description: 5-step development cycle for wasm4pm
type: rules
---

# wasm4pm Development Workflow

Follow this cycle when implementing features or fixing bugs.

## Step 1: WASM Build (if needed)

Check if the WASM binary needs rebuilding:

```bash
wasm-pack build --target nodejs --profile browser
```

Profiles:
- `mobile` (~500KB) — minimal, conformance only
- `iot` (~1MB) — basic discovery + conformance
- `edge` (~1.5MB) — advanced discovery + streaming basic
- `fog` (~2MB) — all except POWL, full ML + streaming
- `browser` (default, ~2.7MB) — all features (36 kernel-registered algorithms)

Wait for the build to complete before proceeding.

## Step 2: Chicago TDD (RED → GREEN)

**RED:** Write a failing test
```bash
vim crates/wasm4pm-cognition/tests/breed_adversarial.rs
# Add test case that fails
pnpm test
# Verify FAILED
```

**GREEN:** Implement the feature
```bash
vim crates/wasm4pm-cognition/src/lib.rs
# Implement to pass the test
pnpm test
# Verify PASSED
```

## Step 3: Evidence (Three-Layer Requirement)

Every feature needs proof across 3 layers:

1. **Test assertion** — `assert_eq!()` on observable state
2. **OTEL span** — Run with `RUST_LOG=trace` and verify span exists:
   ```bash
   RUST_LOG=trace,wasm4pm_cognition=trace pnpm test -- breed_test 2>&1 | grep "cognition_run"
   ```
3. **Schema conformance** — Receipt has non-empty `signature`, `input_hashes`, `output_hashes`

If any layer is missing, the feature is not done.

## Step 4: BLAKE3 Receipt Chain

After running a CLI command, verify the receipt:

```bash
wpm cognition run --help
# Produces .wasm4pm/receipts/latest.json with:
#   signature (non-empty, Ed25519)
#   input_hashes (includes pack versions)
#   output_hashes (includes generated artifacts)
```

Never skip receipt emission.

## Step 5: Stop Gate Check

Before claiming completion:

```bash
wpm doctor
# Must exit 0
# Must report: BLAKE3 chain OK, OTEL spans present, no FM-5 violations
```

If any check fails, go back to Step 2.

---

**Summary:**
1. Build WASM if needed
2. RED test → GREEN implementation
3. Verify 3-layer evidence (test + OTEL + schema)
4. Check BLAKE3 receipt chain
5. Run wpm doctor

**Only then** claim done.
