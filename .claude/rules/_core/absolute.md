---
name: wasm4pm Absolute Rules
description: Non-negotiable rules for wasm4pm development (gotchas live in CLAUDE.md)
type: rules
---

<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/.claude/rules/_core/absolute.md; source-sha256: c9b4716ab6f531ce3e97ba263db061ae866f30cbed74bb61c5b97f46a550b72c; reason: tooling or agent control surface -->


# Absolute Rules

1. **Batch independent operations** in one message (parallel tool calls / one Bash call).
2. **Never save files to repo root** — only config (package.json, Cargo.toml, Makefile, ggen.toml) lives there. Use `wasm4pm/src/`, `packages/*/src/`, `crates/*/src/`, `apps/wasm4pm/src/`, `.claude/`.
3. **pnpm only** — never npm or yarn (workspace semantics).
4. **Check WASM binary before editing TS consumers** — `wasm4pm/pkg/` must exist; if not, `pnpm build` first.
5. **FM-5 forbidden**: never mock `init.js` in cognition tests (vi.mock/jest.mock/sinon.stub). At least one integration test must use real WASM.
6. **BLAKE3 receipt chain mandatory** — every `wpm run`/`wpm cognition run` emits a receipt to `.wasm4pm/receipts/latest.json` with non-empty `input_hash` and `output_hash`. No `--no-receipt`.
7. **OTEL 100% coverage** — every public op emits spans with `service_name` + `status` ("ok"|"error"). No success claims without span evidence.
8. **Andon: STOP THE LINE** on `error[E`, `test.*FAILED`, `FM-5 violation`, `panicked at`, or `<new-diagnostics>`. Fix before continuing — never defer.

**Doctrine:** If the code says it worked but the test doesn't prove it with OTEL spans, it didn't work. (Full Chicago TDD / van der Aalst constitution: `~/.claude/rules/process-mining-chicago-tdd.md`.)

Gotchas live in `CLAUDE.md` (single source of truth — do not duplicate here).
