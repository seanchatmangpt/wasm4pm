# Cognition Smoke Test

The cognition smoke test is a single bash script — `scripts/cognition-smoke.sh` — that verifies the entire cognition stack is healthy in under 10 seconds on a warm (already-built) workspace. It is the first thing to run after any commit that touches the cognition subsystem.

## The 6 Invariants

Each step is independently timed and prints `PASS` or `FAIL` on its own line. The script exits 0 only when all 6 pass.

| Step | Command | What it proves |
|------|---------|----------------|
| 1 | `cargo check -p wasm4pm-cognition` | The Rust cognition crate compiles — no type errors, no missing imports. |
| 2 | `cargo test -p wasm4pm-cognition --lib` | The Rust lib-level tests pass. These cover inference engine correctness, not integration. |
| 3 | `cargo test -p prolog8 --lib` | The Prolog resolution engine (prolog8 crate) passes its own unit tests. Prolog8 is the primary reasoning backend for the `prolog` contract. |
| 4 | `bash scripts/cognition-no-stub-scan.sh --quick` | No fraudulent patterns exist in the cognition source: no hardcoded fitness constants, no unconditional `Allow` returns, no dead inference engines. |
| 5 | `node -e "require('./packages/cognition/dist/index.js')"` | The TypeScript cognition facade is built and importable. This catches broken transpilation or missing dist artifacts. |
| 6 | `wpm cognition adversarial --format json \| jq '.payload.detectors \| length'` returns 8 | The adversarial prober reports all 8 detectors. A count below 8 means a detector was removed or its registration was broken. |

## When to Run

- After every commit that touches `crates/wasm4pm-cognition/`, `packages/cognition/`, `apps/wasm4pm/src/commands/cognition/`, or `scripts/cognition-*.sh`.
- Before pushing to any branch — catches regressions before CI picks them up.
- In CI as a fast pre-flight check (runs in under 10 seconds on warm cache, versus the full `make cognition-verify` which can take minutes).
- When diagnosing a failing `wpm cognition` command — run the smoke test first to localise which layer broke.

## Usage

```bash
# Standard run (ANSI color output)
bash scripts/cognition-smoke.sh

# Disable color (for CI or log files)
NO_COLOR=1 bash scripts/cognition-smoke.sh

# Via make
make cognition-smoke
```

Example output (all passing):

```
[   8 ms] PASS cargo check -p wasm4pm-cognition
[  42 ms] PASS cargo test -p wasm4pm-cognition --lib
[  38 ms] PASS cargo test -p prolog8 --lib
[   3 ms] PASS cognition-no-stub-scan.sh --quick
[  11 ms] PASS node -e require('./packages/cognition/dist/index.js')
[  19 ms] PASS wpm cognition adversarial --format json | jq detectors==8

cognition-smoke: 6 passed, 0 failed — 121 ms total
```

Example output (step 4 fails):

```
[   8 ms] PASS cargo check -p wasm4pm-cognition
[  42 ms] PASS cargo test -p wasm4pm-cognition --lib
[  38 ms] PASS cargo test -p prolog8 --lib
[   2 ms] FAIL cognition-no-stub-scan.sh --quick
[  11 ms] PASS node -e require('./packages/cognition/dist/index.js')
[  18 ms] PASS wpm cognition adversarial --format json | jq detectors==8

cognition-smoke: 5 passed, 1 failed — 119 ms total
```

## Watch-Mode Workflow

`wpm cognition watch` provides a tight feedback loop when iterating on a BreedInput fixture. Save the file, see the new receipt immediately:

```bash
# In one terminal: start the watcher
wpm cognition watch examples/cognition/prolog/intent.json

# In another terminal: edit the fixture
echo '{"breed_id":"test","activities":["register","decide"]}' > examples/cognition/prolog/intent.json
```

The watcher prints a receipt summary on every save:

```
[2026-05-06 14:22:01] decision=Allow hash=a1b2c3d4 findings=0
[2026-05-06 14:22:09] decision=Deny  hash=ff8a1234 findings=3
```

Pass `--verbose` to see the full `inference_trace` from the Prolog engine. Pass `--quiet` to see only the hash (useful when piped to another tool).

The watcher survives errors — if the contract run throws (e.g. because `@wasm4pm/cognition` is not yet installed), it logs the error and keeps watching. If the input file is deleted, it logs a warning and waits for the file to return.

Stop the watcher with Ctrl-C; it prints `stopped` to stderr and exits 0.

## Comparison with `make cognition-verify`

| | `cognition-smoke` | `make cognition-verify` |
|---|---|---|
| Speed | Under 10 s (warm cache) | Minutes (cold build + full integration suite) |
| Scope | 6 structural invariants | Full conformance, alignment, and adversarial suite |
| When | Before every push | Before every release |
| Failure signal | Which of 6 layers is broken | Precise test name and line |

Run the smoke test first. If it passes, run `make cognition-verify` for the full assurance picture.

## Fraud Prevention: cognition-no-stub-scan.sh

Step 4 invokes `scripts/cognition-no-stub-scan.sh --quick`, which scans the cognition source for patterns that indicate an implementation that only appears to work:

- **Hardcoded fitness constants** in production Rust code (e.g. `fitness = 1.0;` without surrounding computation).
- **Unconditional Allow returns** in TypeScript (e.g. `return { decision: 'Allow' }` with no inference body).

These patterns are defects, not warnings. Van der Aalst's first law applies here: if the code says it worked but the event log cannot prove a lawful process happened, then it did not work.
