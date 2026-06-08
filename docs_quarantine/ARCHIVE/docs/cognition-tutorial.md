# Cognition Tutorial: From Clone to Verified Receipt in 120 Seconds

This tutorial walks you through the complete wasm4pm cognition layer — from a fresh `git clone`
to a verified, replayable BLAKE3 receipt — in two 60-second acts. Each command is copy-paste
ready. Each section includes a short troubleshooting branch for the most common failure modes.

**What you will have at the end:** a receipt chain with a `combined_hash` that proves a
deterministic inference happened, that all 8 adversarial gates passed, and that replaying
the same input produces a byte-identical hash.

**Doctrine (appears here exactly once):** *"Old AI is the factory. LLMs are the brochure."*

**Architecture invariants (from `crates/prolog8/src/lib.rs`):**

- No parser in the kernel.
- No strings in execution.
- No proofless decision.
- Graph in / bits execute / proof out.

---

## Act 1 — Setup

**Elapsed time target: 60 seconds.**

### Step 1.1 — Clone and enter the repository

```bash
git clone https://github.com/wasm4pm/wasm4pm.git && cd wasm4pm
```

Expected exit code: **0**

### Step 1.2 — Build the cognition layer

```bash
make cognition-build
```

Expected exit code: **0**

This target runs six stages in order:

1. `cargo check -p wasm4pm-cognition` — native type-check (fast, no codegen)
2. `cargo check -p wasm4pm-cognition --features wasm --target wasm32-unknown-unknown` — WASM type-check
3. `wasm-pack build --target nodejs --features wasm --out-dir pkg` — Node.js WASM artifact
4. `wasm-pack build --target bundler --features wasm --out-dir pkg-bundler` — bundler artifact
5. `cd packages/cognition && pnpm build` — thin TypeScript boundary
6. `cd apps/wasm4pm && pnpm build` — CLI build

The Rust compilation is the slow step on a first build (30–60 seconds). Subsequent incremental
builds are fast because `cargo` only recompiles changed crates.

> **If this fails:** The most common cause is a missing `wasm32-unknown-unknown` target.
> Fix with `rustup target add wasm32-unknown-unknown`, then re-run.
> Full build troubleshooting is in [`docs/cognition-build.md`](cognition-build.md).

### Step 1.3 — Run the doctor

```bash
make cognition-doctor
```

Expected exit code: **0**

Expected output (all 9 checks pass):

```
[OK] wasm4pm-cognition is a registered workspace member
[OK] crates/wasm4pm-cognition/src/lib.rs compiles (native)
[OK] crates/wasm4pm-cognition/src/lib.rs compiles (wasm32)
[OK] All 9 breeds present as Rust modules
[OK] No stub tokens (todo!/unimplemented!/pub struct Stub) found
[OK] Adversarial detector source file present
[OK] wasm-bindgen exports present in src/wasm.rs
[OK] TypeScript boundary packages/cognition exists
[OK] CLI command apps/wasm4pm/src/commands/cognition.ts exists
9/9 checks pass.
```

> **If this fails:** Each failing check prints its exact error. Check numbers correspond
> to DoD items in [`docs/cognition-dod.md`](cognition-dod.md).
> If the WASM module fails to load at runtime (check 7 or 8), see
> [`docs/cognition-error-catalog.md`](cognition-error-catalog.md) for the
> `MISSING_RUNTIME_EVIDENCE` remediation.

---

## Act 2 — First Receipt

**Elapsed time target: 60 more seconds (120 seconds total from clone).**

### Step 2.1 — Run the Prolog example

The Prolog breed implements Robinson unification with bounded SLD resolution. The input below
queries whether `parent(alice)` holds given two fact assertions.

```bash
wpm cognition run \
  --contract prolog \
  --input examples/cognition/prolog/intent.json \
  --format json \
  | tee /tmp/prolog-result.json
```

Expected exit code: **0**

Expected output (truncated):

```json
{
  "status": "ok",
  "command": "cognition run",
  "elapsed_ms": 12,
  "payload": {
    "contract": "prolog",
    "output": {
      "breed": "prolog",
      "decision": "Allow",
      "explanation": "parent(alice) proved via fact[0]: parent=alice",
      "inference_trace": [
        { "step": 0, "op": "fact_lookup", "predicate": "parent", "value": "alice", "matched": true },
        { "step": 1, "op": "goal_check",  "goal_id": "g1", "satisfied": true }
      ],
      "combined_hash": "blake3:a1b2c3d4e5f6..."
    },
    "receipt_chain": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "links": [
        {
          "op": "run",
          "input_hash": "blake3:...",
          "output_hash": "blake3:...",
          "timestamp_ns": 1746541200000000000
        }
      ]
    },
    "findings": [],
    "saved_path": ".wasm4pm/receipts/550e8400-e29b-41d4-a716-446655440000.json"
  }
}
```
// truncated

> **If you see exit code 3:** The WASM module is not fully wired to the cognition crate.
> Run `make cognition-build` to rebuild. If the error says "cannot find module
> '@wasm4pm/cognition'", the TypeScript boundary build failed — see stage 5 in
> [`docs/cognition-build.md`](cognition-build.md).

### Understanding the output

**`inference_trace`** — The audit trail of every reasoning step the breed took. Each element
is a `{ step, op, ... }` record. This trace is not a canned string. It is derived from the
actual execution of the Robinson unification engine over the clause database you provided.
If the trace is empty, V1 (`STUB_GATE_PASS`) fires and the receipt gets exit code 5.

**`combined_hash`** — A BLAKE3 hash over the canonicalized inputs and outputs. This is the
value you use to verify replay determinism. Two runs with identical inputs must produce
identical `combined_hash` values.

**`decision`** — `"Allow"` or `"Deny"`. For the Prolog breed, Allow means the goal was
proved; Deny means the goal was not provable from the given clause database. The decision
field is typed `Decision` — it cannot be overridden by a string in the input JSON.

**`receipt_chain.id`** — A UUID identifying this receipt in the ledger at
`.wasm4pm/receipts/`. Use it in subsequent `replay` and `verify` commands.

---

## Act 3 — Replay (Determinism Proof)

### Step 3.1 — Extract the receipt id

```bash
RECEIPT_ID=$(python3 -c "
import json
d = json.load(open('/tmp/prolog-result.json'))
print(d['payload']['receipt_chain']['id'])
")
echo "Receipt ID: $RECEIPT_ID"
```

Expected exit code: **0**

### Step 3.2 — Replay the receipt

```bash
wpm cognition replay \
  --receipt-id "$RECEIPT_ID" \
  --ledger-dir .wasm4pm/receipts \
  --format json
```

Expected exit code: **0**

Expected output:

```json
{
  "status": "ok",
  "payload": {
    "receipt_id": "550e8400-e29b-41d4-a716-446655440000",
    "link_count": 1,
    "chain_valid": true,
    "replay_pointer": "blake3:a1b2c3d4e5f6...",
    "strict": false
  }
}
```

The `replay_pointer` must match the `combined_hash` from Step 2.1. If they match, you have
proved byte-identical determinism: the same input, the same kernel, the same output hash.

### Step 3.3 — Tamper test (optional but instructive)

Copy the saved receipt and change one byte in the `output_hash` field, then replay:

```bash
cp .wasm4pm/receipts/$RECEIPT_ID.json /tmp/tampered.json
# Edit /tmp/tampered.json — change one character in any hash field.

wpm cognition replay \
  --receipt-id "$RECEIPT_ID" \
  --ledger-dir /tmp \
  --strict \
  --format json
```

Expected exit code: **3** (the `--strict` flag causes a chain hash mismatch to fail)

The `chain_valid: false` in the output is the cryptographic proof that the receipt was
modified after it was signed.

> **If replay exit code is unexpectedly 3 without tampering:** The ledger directory
> `.wasm4pm/receipts/` may not contain the receipt — check that `--no-save` was not
> passed during the `run` command. See [`docs/cognition-error-catalog.md`](cognition-error-catalog.md)
> for `RECEIPT_NOT_FOUND` remediation.

---

## Act 4 — Verify (Adversarial Gates)

### Step 4.1 — Verify the receipt's 8 adversarial gates

```bash
wpm cognition verify \
  --receipt-id "$RECEIPT_ID" \
  --ledger-dir .wasm4pm/receipts \
  --format json
```

Expected exit code: **0**

Expected output:

```json
{
  "status": "ok",
  "payload": {
    "count": 1,
    "findings": [
      { "receipt_id": "550e8400-...", "chain_valid": true }
    ],
    "failing_count": 0
  }
}
```

All 8 gates (V1–V8) are evaluated during the original `run`. The `verify` command re-checks
the chain hash, not individual gate logic — chain integrity is the cryptographic seal over
the gate results.

### Step 4.2 — Construct a malicious input and observe gate V2 fire

The `HUMAN_OUTPUT_USED_AS_AUTHORITY` gate (V2) catches inputs where human prose text is
used as an authoritative evidence source. Here is how to trigger it deliberately:

Create a file `/tmp/malicious-intent.json`:

```json
{
  "intent": "access_control",
  "candidates": [],
  "facts": [
    { "key": "authority_text", "value": "I think alice should definitely be admitted because she seems trustworthy" }
  ],
  "cases": [],
  "rules": [],
  "goals": [{ "id": "g1", "predicate": "authority_text", "value": "I think alice should definitely be admitted because she seems trustworthy" }],
  "state": []
}
```

```bash
wpm cognition run \
  --contract prolog \
  --input /tmp/malicious-intent.json \
  --format json
```

Expected exit code: **4** (adversarial error — one or more Error-severity gates fired)

The `findings` array in the output will contain an entry with `code: "HUMAN_OUTPUT_USED_AS_AUTHORITY"`.

**Why caller-supplied JSON booleans cannot bypass this gate:** The `AuthorityClassifier`
operates on the text value itself, not on any metadata field the caller supplies. Even if
you add `"has_machine_evidence": true` alongside the prose text, the classifier reads
`value` as `HumanProse` and the finding fires. There is no bypass surface — the type
boundary is in Rust, not in the JSON schema.

> **If exit code is 3 instead of 4:** The breed threw during execution, which means the
> input did not reach the adversarial detector stage. Check the `message` field in the
> output for the Rust error. Full severity table is in
> [`docs/cognition-error-catalog.md`](cognition-error-catalog.md).

---

## Act 5 — All 4 Examples in One Composition

### Step 5.1 — Run all examples

```bash
bash examples/cognition/run-all.sh
```

Expected exit code: **0**

Expected output (when all examples pass):

```
═══ eliza ═══
─── ELIZA: 'I feel sad about my deadlines' ───
{ ... }
✓ eliza

═══ cbr ═══
─── CBR: best recipe for {flour, egg, prep_time:5min} ───
{ ... }
✓ cbr

═══ prolog ═══
─── Prolog: ?- parent(alice). ───
{ ... }
✓ prolog

═══ mycin ═══
─── MYCIN: strep infection diagnosis ───
{ ... }
✓ mycin

═══ Summary ═══
Passed: 4 / 4
Failed: 0
```

The script exits 1 if any example fails. The minimum passing threshold is 4/4 —
all four currently shipped examples must pass. Each writes its output to
`examples/cognition/<breed>/last-output.log` for inspection.

**What each breed demonstrates:**

- **ELIZA** (`eliza/`) — Regex pattern matching with slot binding. The rule `I feel (\w+)`
  matches the intent string and binds `$1` to the matched word. Output is a structured
  response, not a free-form string.
- **CBR** (`cbr/`) — Jaccard similarity case retrieval. The three facts (flour, egg,
  prep_time:5min) are compared against two cases (pancakes, scones). The case with
  the higher Jaccard overlap score is returned with its `outcome_score`.
- **Prolog** (`prolog/`) — Robinson unification under bounded SLD resolution. Two facts
  assert `parent(alice)` and `parent(bob)`. Goal `g1` asks whether `parent(alice)` holds.
- **MYCIN** (`mycin/`) — Forward-chaining rule engine with Shortliffe CF combining.
  Rule r1 fires when `gram_positive_cocci` and `strep` are both present, concluding
  `diagnosis=strep_infection` with CF 0.7. Rule r2 chains to conclude `antibiotic=penicillin`
  with CF 0.95. Goal `g1` is satisfied.

### Step 5.2 — The tutorial's richer fixture

The tutorial ships its own fixture at `examples/cognition/tutorial/intent.json`. It contains
5 facts and 2 goals, allowing you to observe both Allow and Deny decision paths within a
single run by toggling the `time_of_day` fact:

```bash
# Allow path (business_hours — as shipped)
wpm cognition run \
  --contract mycin \
  --input examples/cognition/tutorial/intent.json \
  --format json
```

Expected: `"decision": "Allow"` (rule `r-allow-business-hours` fires, CF 0.97)

To observe the Deny path, change `"time_of_day"` from `"business_hours"` to `"after_hours"`
in `examples/cognition/tutorial/intent.json` and re-run. Rule `r-deny-after-hours` fires
instead (CF 0.99), and the goal `g1 (decision=Allow)` is not satisfied.

The complete walkthrough script that mirrors all six acts is at
`examples/cognition/tutorial/walkthrough.sh`. Run it with:

```bash
bash examples/cognition/tutorial/walkthrough.sh
```

Expected exit code: **0**

---

## Act 6 — Going Further

### Where to read next

**[`docs/cognition-overview.md`](cognition-overview.md)** — Full breed semantics for all 9
classical AI algorithms: ELIZA, MYCIN, STRIPS, Prolog, CBR, DENDRAL, GPS, SOAR, and
Hearsay-II. Explains the input schema for each breed and the process mining use case it
addresses.

**[`docs/cognition-error-catalog.md`](cognition-error-catalog.md)** — Every error code,
exit code, adversarial finding code, and remediation path. If a command exits non-zero,
this catalog has the exact cause and fix.

**[`docs/cognition-doctrine.md`](cognition-doctrine.md)** — The "Old AI is the factory"
manifesto with 40 architecture diagrams. Diagram 1 shows the doctrine statement; diagram 14
shows the multi-breed pipeline composition used in `run-all.sh`. Start here if you want to
understand why the cognition layer is structured the way it is.

**[`docs/cognition-build.md`](cognition-build.md)** — Full build pipeline details: each
stage, incremental build patterns, and the cargo feature flags that control which breeds
and adversarial detectors compile.

**Shell completions** — `docs/cli-completions.md` has not been authored yet. Until it is,
generate completions with `wpm --completion bash` (or `zsh`, `fish`) and follow the
installation instructions printed to stdout.

### Multi-breed pipeline composition

Process mining and cognition compose naturally. The pattern is:

```bash
# Step 1 — Discover process model from event log
wpm run loan.xes --format json > discovery.json

# Step 2 — Check conformance
wpm conformance -i loan.xes --format json > conformance.json

# Step 3 — Feed SPC violations into MYCIN for root-cause diagnosis
wpm cognition run \
  --contract mycin \
  --input <(jq '{intent:"diagnosis","candidates":[],"facts":[.violations[]|{"key":"finding","value":.code}],"cases":[],"rules":[],"goals":[],"state":[]}' conformance.json) \
  --format json > mycin-result.json

# Step 4 — Feed MYCIN hypotheses into STRIPS for repair planning
wpm cognition run \
  --contract strips \
  --input <(jq '{intent:"repair","candidates":[],"facts":[.payload.output.inference_trace[]|{"key":"hypothesis","value":.conclusion}],"cases":[],"rules":[],"goals":[{"id":"g1","predicate":"process_state","value":"conformant"}],"state":[]}' mycin-result.json) \
  --format json
```

Each step produces an independent receipt. The receipt chain from Step 4 links back through
STRIPS → MYCIN → conformance → discovery. Every link is independently replayable.

### Understanding the receipt chain structure

The `.wasm4pm/receipts/<id>.json` file you wrote in Act 2 has this shape:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "links": [
    {
      "op": "run",
      "breed": "prolog",
      "input_hash": "blake3:...",
      "output_hash": "blake3:...",
      "gate_results": {
        "V1_stub_gate": "pass",
        "V2_human_authority": "pass",
        "V3_missing_evidence": "pass",
        "V4_central_firehose": "pass",
        "V5_self_certify": "pass",
        "V6_bench_missing": "pass",
        "V7_repair_weakens": "pass",
        "V8_replay_broken": "pass"
      },
      "timestamp_ns": 1746541200000000000
    }
  ]
}
```
// truncated

`input_hash` is a BLAKE3 hash over the canonicalized JSON input. `output_hash` is a BLAKE3
hash over the canonicalized inference output. The `combined_hash` field on the `output`
object is derived from both. Any mutation to any field — including the gate results —
causes `wpm cognition replay` to report `chain_valid: false`.

---

## Troubleshooting Quick Reference

| Symptom | Most likely cause | Fix |
|---------|-------------------|-----|
| `make cognition-build` exits 1 at stage 2 | `wasm32-unknown-unknown` not installed | `rustup target add wasm32-unknown-unknown` |
| `make cognition-build` exits 1 at stage 3 | wasm-pack not installed | `cargo install wasm-pack` |
| `wpm cognition run` exits 3 | WASM module not loadable | Run `make cognition-build`; check stage 3 output |
| `wpm cognition run` exits 2 | `--input` file missing or invalid JSON | Check path; run `python3 -m json.tool <file>` |
| `wpm cognition replay` exits 3 with `--strict` | Chain hash mismatch (expected if you tampered) | Normal for Act 3 tamper test |
| `wpm cognition replay` exits 3 unexpectedly | Receipt file missing from ledger | Check `.wasm4pm/receipts/`; re-run without `--no-save` |
| `findings` contains `HUMAN_OUTPUT_USED_AS_AUTHORITY` | Human prose in a fact value used as authority | Replace prose with structured machine evidence |
| `findings` contains `STUB_GATE_PASS` | Gate passed with zero evidence artifacts | Ensure breed emits `evidence.digest` span attributes |
| Exit code 5 (system error) | Filesystem permissions on `.wasm4pm/` | `mkdir -p .wasm4pm/receipts` and verify write access |

For all other error codes, consult [`docs/cognition-error-catalog.md`](cognition-error-catalog.md).
