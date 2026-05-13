---
name: wasm4pm Absolute Rules
description: 8 non-negotiable rules for wasm4pm development
type: rules
---

# Absolute Rules (Always-Loaded)

## 1. All Operations Parallel in ONE Message

When possible, batch related operations:
- Multiple file reads/writes in one Bash call
- Multiple agents spawned in one Agent call
- All related edits in one message

**Example:** Don't read 3 files sequentially; read them in parallel via Bash:
```bash
# Bad: 3 separate messages
cat file1.rs
cat file2.ts
cat file3.rs

# Good: 1 message
cat file1.rs file2.ts file3.rs
```

## 2. NEVER Save Files to Repo Root

- No `*.rs`, `*.toml`, `*.md`, `*.json`, `*.txt` at root level
- Use: `wasm4pm/src/`, `packages/*/src/`, `crates/*/src/`, `apps/wasm4pm/src/`, `.claude/`
- Root is reserved for config files only: `package.json`, `Cargo.toml`, `Makefile`, `ggen.toml`

## 3. ALWAYS Use `pnpm` — Never `npm` or `yarn`

- Build: `pnpm build`
- Test: `pnpm test`
- Install: `pnpm add` (never `npm install`)
- FORBIDDEN: direct `npm`, `npm-script`, `yarn` commands

**Why:** Workspace semantics. `pnpm` respects the monorepo `pnpm-workspace.yaml`.

## 4. ALWAYS Check WASM Binary Before Editing TS Consumers

Before editing TypeScript code that calls WASM:
1. Verify `wasm4pm/pkg/` directory exists
2. Verify the .wasm binary is present
3. If not, run: `pnpm build` first

**Why:** TS imports will fail silently if WASM is missing.

## 5. FM-5 Forbidden: No Mocking `init.js`

- FORBIDDEN: `jest.mock('./init.js')`
- FORBIDDEN: `vi.mock('./init.js')`
- FORBIDDEN: `sinon.stub(init)`
- Cognition tests MUST actually call real `init.js` for wasm initialization

**Why:** FM-5 (self-referential falsification). Mocking init masks setup failures.

## 6. BLAKE3 Receipt Chain is Mandatory — Never Skip

Every `wpm run` and `wpm cognition run` MUST emit a BLAKE3 receipt to `.wasm4pm/receipts/latest.json`.

- Forbidden: `--no-receipt` or `skipReceipt: true`
- Forbidden: empty `signature` field in receipt
- Forbidden: receipt missing `input_hashes` or `output_hashes`

**Why:** Receipt chain is proof of execution. Empty receipts are forgery.

## 7. OTEL 100% Coverage — Every Public Function Must Emit Spans

Every exported `cognition_run()`, `cognition_verify()`, `system_build()` must emit OTEL spans.

- Verify: `RUST_LOG=trace,wasm4pm_cognition=trace pnpm test 2>&1 | grep -E "llm\.|otel|span"`
- Forbidden: Success claimed without span evidence
- Forbidden: Skipping span emission for "performance"

**Why:** Spans are the only proof that real execution happened, not just test-doubling.

## 8. STOP THE LINE on Andon Signals

Immediately halt work and fix when you see:

- `error[E` — compiler error
- `test.*FAILED` — test failure
- `FM-5 violation` — self-referential falsification in cognition tests
- `panicked at` — runtime panic

**Do not:**
- Skip to the next feature
- Say "I'll fix it later"
- Mark as done despite the signal

**Do:**
- Stop immediately
- Read the error
- Apply targeted fix
- Re-run until the signal clears
- THEN continue

---

**The strongest rule:** If the code says it worked but the test doesn't prove it with OTEL spans, then it didn't work.
