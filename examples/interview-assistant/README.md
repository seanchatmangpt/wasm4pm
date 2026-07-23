# Interview Answer Assistant

A lower-screen browser application for the deterministic `cognition_session_turn` kernel.

The shared upper monitor remains the interview workspace. The laptop screen displays the current answer track, ranked alternatives, covered concepts, remaining ontology-level guidance, exact matched phrases, confirmation gates, inference traces, and receipt identifiers. It does not generate code or prose answers.

## Run

Install `wasm-pack`, make `pnpm` available through Corepack, then run the canonical command from the repository root:

```bash
corepack enable
pnpm run interview:dev
```

A clean checkout does not contain `packages/cognition/pkg` or `packages/cognition/pkg-web`. The command therefore manufactures both WASM package projections before `pnpm install` resolves the cognition package's local `file:` dependencies. It then starts Vite with this directory as the application root.

A production bundle can be manufactured with:

```bash
pnpm run interview:build
```

## Operation

The Web Speech API supplies final transcript fragments when the browser supports it. Manual transcript entry remains available on every supported browser.

Every observation and yes or no confirmation is serialized through one bounded canonical turn ledger. The browser persists the latest receipted state in `localStorage`; on reload, the state is schema-checked before use, and the Rust kernel replays the complete ledger to reconstruct observations, retractions, evidence, rejections, commitments, rankings, and phases before admitting the next transition. Invalid local state is refused rather than silently trusted.

The **Reset session** control clears the local state and begins a new interview. This is also the lawful recovery path after switching ontology versions or intentionally abandoning a rejected track.

## Boundary semantics

No LLM or vector database is involved. Phrase matching, evidence fusion, rule firing, track commitment, phase progression, refusals, hashing, and receipt manufacture execute in Rust/WASM.

The optional Ed25519 value is explicitly a deterministic local self-signature. It supports replay verification but is not represented as remote actor authentication. The BLAKE3 receipt is the canonical tamper-evident computation commitment.
