# Interview Answer Assistant

A lower-screen browser application for the deterministic `cognition_session_turn` and `cognition_session_verify` kernels.

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

Every observation and yes or no confirmation is serialized through one bounded canonical turn ledger. Observations use UUID identities rather than sequence numbers, so failed turns, confirmation-only turns, and reloads cannot reuse an admitted observation identity.

The browser persists the latest receipted state in `localStorage`, but schema shape does not grant standing. On reload, the application initializes WASM and invokes `verifySessionState`. Rust replays the complete ledger and reconstructs observations, retractions, evidence, rejections, commitments, rankings, coverage, and phases. Replay-invalid state is deleted before hypotheses or commitments are rendered.

The **Reset session** control clears the local state and begins a new interview. This is also the lawful recovery path after switching ontology versions or intentionally abandoning a rejected track.

## Boundary semantics

No LLM or vector database is involved. Phrase matching, target-conditioned certainty propagation, rule firing, track commitment, phase progression, replay verification, refusals, hashing, and receipt manufacture execute in Rust/WASM.

A rule contribution is bounded by its weakest target-supporting premise. Weak or target-contradicting evidence cannot manufacture a full-certainty rule conclusion.

The optional Ed25519 value is explicitly a deterministic local self-signature. It supports replay comparison but is not represented as remote actor authentication. The BLAKE3 receipt is the canonical tamper-evident computation commitment.
