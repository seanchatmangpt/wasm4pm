# InterviewAssist diagrams

Architecture and UX diagrams for `examples/interview-assist/`.

**Re-verified:** 2026-07-24 against branch `docs/v26.7.24-planning-diagramming`.

The local shell could not obtain a repository checkout (`~/wasm4pm` was absent and `git clone` failed with `Could not resolve host: github.com`). Source verification therefore used the connected GitHub app's `GitHub.fetch_file` action against the exact branch. Runtime-only claims remain BLOCKED unless backed by a command that actually executed.

## Contents

- [Design for Combinatorial Maximalism using all Mermaid](combinatorial-maximalism/SUMMARY.md) — compact Alexander-style pattern atlas with 34 standalone wasm4pm case-study diagrams covering all 30 Mermaid 11.16 families and all five C4 variants.
- [Full DCM mdBook and 121-page PDF](combinatorial-maximalism/PUBLICATION.md) — complete pattern-language publication, deterministic build sources, validation receipt, and PDF export.
- [ui-ux-redesign.md](ui-ux-redesign.md) — canonical interaction and layout specification, plus the source-grounded correction to the ranked cognition design.
- [unfinished-work.md](unfinished-work.md) — current law-state map: DONE, PARTIAL, BLOCKED, and BUILD_BROKEN.
- [c4-context.md](c4-context.md) — system context and real external boundaries.
- [c4-container.md](c4-container.md) — Next.js client, route, adapter, and subprocess boundaries.
- [c4-component.md](c4-component.md) — verified UI/domain/adapter composition and the receipt integration gaps.
- [sequence-cognition.md](sequence-cognition.md) — current Eliza request/response branches and ADR handoff.
- [sequence-sandbox-execution.md](sequence-sandbox-execution.md) — real execution routes, static capability-catalog route, and current timeout behavior.
- [sequence-receipt-replay.md](sequence-receipt-replay.md) — receipt primitives, the broken live five-step chain, and actual replay/tamper hashing.

## Decisions and backlog

- [ADR-001: TypeScript scoring → Dendral elimination → Eliza question](../jira/v26.7.24/DECISIONS.md)
- [InterviewAssist v26.7.24 priority matrix](../jira/v26.7.24/README.md)

## Verification command pattern

Every source-grounded diagram names the exact repository files re-read. The command form executed was:

```text
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=<repository-root path> ref=docs/v26.7.24-planning-diagramming
```

No diagram should be read as proof that a runtime path passes. Runtime standing is tracked in [unfinished-work.md](unfinished-work.md) and the Jira README.

The all-Mermaid atlas targets Mermaid 11.16.0. Source coverage is documented, but parser and renderer compatibility remain `UNKNOWN` until CI validates every `.mmd` against the pinned renderer. Beta and experimental families are explicitly quarantined in the atlas summary.
