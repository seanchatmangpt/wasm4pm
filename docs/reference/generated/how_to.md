<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/generated/how_to.md; source-sha256: 1d4beb77b42ee22aca8a5ec2a4d63c6e29ec50fc7009d78398f03c3994270b7f; reason: canonical Diátaxis or ADR surface -->

# How to: Using crate

## Prerequisites


- @wasm4pm/agents::build (script)

- @wasm4pm/agents::clean (script)

- @wasm4pm/agents::lint (script)

- @wasm4pm/agents::test (script)

- @wasm4pm/agents::test:coverage (script)

- @wasm4pm/agents::test:watch (script)

- @wasm4pm/cli::bench (script)

- @wasm4pm/cli::build (script)

- @wasm4pm/cli::clean (script)

- @wasm4pm/cli::dev (script)

- @wasm4pm/cli::gen:docs (script)

- @wasm4pm/cli::lint (script)

- @wasm4pm/cli::pretest (script)

- @wasm4pm/cli::test (script)

- @wasm4pm/cli::test:combinatorial (script)

- @wasm4pm/cli::test:watch (script)

- @wasm4pm/cli::typecheck:scripts (script)

- @wasm4pm/cli::typecheck:tests (script)

- @wasm4pm/cli::wpm (bin)

- @wasm4pm/cognition::build (script)

- @wasm4pm/cognition::build (script)

- @wasm4pm/cognition::build:all (script)

- @wasm4pm/cognition::build:nodejs (script)

- @wasm4pm/cognition::build:web (script)

- @wasm4pm/cognition::clean (script)

- @wasm4pm/cognition::lint (script)

- @wasm4pm/cognition::test (script)

- @wasm4pm/cognition::test (script)

- @wasm4pm/cognition::test:coverage (script)

- @wasm4pm/cognition::test:watch (script)

- @wasm4pm/config::build (script)

- @wasm4pm/config::clean (script)

- @wasm4pm/config::format (script)

- @wasm4pm/config::lint (script)

- @wasm4pm/config::test (script)

- @wasm4pm/config::test:coverage (script)

- @wasm4pm/config::test:watch (script)

- @wasm4pm/contracts::build (script)

- @wasm4pm/contracts::clean (script)

- @wasm4pm/contracts::lint (script)


## Steps


1. Use `build` from `@wasm4pm/agents`.

2. Use `clean` from `@wasm4pm/agents`.

3. Use `lint` from `@wasm4pm/agents`.

4. Use `test` from `@wasm4pm/agents`.

5. Use `test:coverage` from `@wasm4pm/agents`.

6. Use `test:watch` from `@wasm4pm/agents`.

7. Use `wpm` from `@wasm4pm/cli`.

8. Use `bench` from `@wasm4pm/cli`.

9. Use `build` from `@wasm4pm/cli`.

10. Use `clean` from `@wasm4pm/cli`.

11. Use `dev` from `@wasm4pm/cli`.

12. Use `gen:docs` from `@wasm4pm/cli`.


## Verified snippet

<!-- The snippet slot carries code copied from the extracted code surface -->
<!-- (doc:Claim rows whose doc:attribute is "snippet"), never agent prose. -->

```rust
// crates/eu_gate/src/lib.rs :: as_str
as_str(self) -> &'static str
```

<!-- AGENT-COMMENTARY-BEGIN -->
<!-- The ONLY region an agent may write into. Bounds: <= 12 lines,    -->
<!-- <= 100 chars/line, no new code facts (any new symbol mentioned   -->
<!-- must exist in queries/ast_extract.rq output; the doc_quality     -->
<!-- court fails Phi_halluc > 0.001 otherwise). No tables, no         -->
<!-- signatures, no parameters, no error lists — AGENT-FORBIDDEN      -->
<!-- everywhere.                                                      -->
<!-- AGENT-COMMENTARY-END -->
