# Cognition Definition of Done

Architecture diagram: #39 (Cognition Build DoD).

A cognition layer change is done when ALL 10 items pass.
Run the checklist with:

```bash
make cognition-dod
# or
bash crates/wasm4pm-cognition/scripts/cognition-dod-checklist.sh
```

Exit code 0 means all 10 items satisfied. Exit code 1 means one or more failed.

## The 10 DoD Items

### DoD-01: Real Rust crate exists

`crates/wasm4pm-cognition/Cargo.toml` must exist and contain a `[package]` section.

A JSON package.json or an empty directory does not satisfy this item. The crate must
be a compilable Rust library, not a stub.

### DoD-02: All breeds are Rust modules

All 9 cognition breeds must exist as non-empty Rust source files under
`crates/wasm4pm-cognition/src/breeds/`:

| Breed | File |
|-------|------|
| `frame` | `breeds/frame.rs` or `breeds/frame/mod.rs` |
| `cbr` | `breeds/cbr.rs` or `breeds/cbr/mod.rs` |
| `dendral` | `breeds/dendral.rs` or `breeds/dendral/mod.rs` |
| `strips` | `breeds/strips.rs` or `breeds/strips/mod.rs` |
| `prolog` | `breeds/prolog.rs` or `breeds/prolog/mod.rs` |
| `production_rules` | `breeds/production_rules.rs` or `breeds/production_rules/mod.rs` |
| `gps` | `breeds/gps.rs` or `breeds/gps/mod.rs` |
| `soar` | `breeds/soar.rs` or `breeds/soar/mod.rs` |
| `hearsay` | `breeds/hearsay.rs` or `breeds/hearsay/mod.rs` |

### DoD-03: Common breed trait exists

A common `CognitionBreed` trait (or equivalent `*Breed` trait) must be defined.
Acceptable locations: `src/breeds/mod.rs`, `src/traits.rs`, `src/cognition.rs`,
or `src/lib.rs`. The trait provides the shared contract all breed implementations
must satisfy.

### DoD-04: wasm-bindgen exports exist

`src/wasm.rs` must exist and contain `#[wasm_bindgen]` annotations with at minimum
these exported functions:

- `cognition_run` — runs a cognition contract given an input
- `cognition_verify` — verifies a previous run and returns a receipt
- `cognition_replay` — replays a run by receipt_id, returns combined_hash
- `system_build` — builds a cognition system definition
- `system_verify` — verifies a system definition

### DoD-05: TS facade is thin

`packages/cognition/src/index.ts` must exist. It must delegate all computation
to the compiled WASM module and contain no embedded business logic.

A companion test `packages/cognition/src/__tests__/zero-logic.test.ts` must exist
to enforce this contract programmatically.

### DoD-06: No forbidden placeholder tokens

The `crates/wasm4pm-cognition/src/` tree must contain no instances of:

- `pub struct Stub` — placeholder type
- `todo!()` — unimplemented code marker
- `unimplemented!()` — unimplemented code marker
- `fake_impl` — fabricated implementation

This mirrors the TPS fail-fast principle: placeholders are defects, not acceptable
interim states.

### DoD-07: Capability probe passes

`bash crates/wasm4pm-cognition/scripts/cognition-doctor.sh` must exit 0.

The doctor script performs 9 independent checks covering workspace registration,
compile health, breed completeness, stub detection, adversarial detector presence,
WASM export presence, TS facade presence, and CLI integration.

### DoD-08: Verify emits receipt

`cognition_verify` in `src/wasm.rs` must return a JSON structure containing a
receipt with at minimum: `run_id` and `combined_hash`. This is the cryptographic
proof of execution required by the Chicago TDD doctrine.

### DoD-09: Replay works

`cognition_replay` in `src/wasm.rs` must accept a `receipt_id` parameter and return
a structure containing `combined_hash`. The full roundtrip is verified by
`make cognition-cycle`:

```
run (produces receipt_id + combined_hash)
  -> receipt (fetches original combined_hash)
  -> replay (produces replayed combined_hash)
  -> assert orig == replayed (determinism proof)
```

If the hashes differ, it indicates non-determinism in the cognition layer — a defect.

### DoD-10: CLI uses compiled WASM

`apps/wasm4pm/src/commands/cognition.ts` must exist and must not contain:

- `(stub)` markers in console.log
- `console.log` calls with "not yet" or "TODO" messages
- `throw new Error("not implemented")`

The CLI command must delegate to the compiled WASM via the TS facade. Direct
computation in the CLI command layer violates the zero-logic facade contract.

## Rationale

These 10 items implement Van der Aalst's "Make it actionable" principle applied
to the development process itself. A practitioner holding the cognition layer source
should be able to run `make cognition-dod` and receive a falsifiable, binary answer:
done or not done. No judgment required.

The Chicago TDD constitution is explicit: model-vs-log mismatch is a defect. The DoD
is the model. The running system is the log. If they diverge, it is a defect, not a
"discrepancy".
