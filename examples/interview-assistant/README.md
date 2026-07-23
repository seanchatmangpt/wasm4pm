# Interview Answer Assistant

A Next.js lower-screen application for the deterministic `cognition_session_turn`, `cognition_session_verify`, and `cognition_session_code` kernels.

The left pane displays the current answer track, ranked alternatives, covered concepts, missing ontology guidance, and confirmation gates. The right pane is a read-only Monaco editor showing the canonical Python implementation selected by `wasm4pm-cognition`.

## Authority boundary

React does not map track identifiers to code and does not generate source. The code path is:

```text
replay-verified SessionState
        ↓
wasm4pm-cognition::project_python_code
        ↓
track-specific canonical .py artifact
        ↓
domain-separated BLAKE3 source hash
        ↓
cognition_session_code WASM response
        ↓
read-only Monaco projection
```

The four canonical Python files are first-class source under:

```text
crates/wasm4pm-cognition/examples/cognition/interview_session/python/
```

A leading hypothesis can select a provisional artifact. Human confirmation changes the projection status to `committed` without changing the source or source hash.

## Run

Install `wasm-pack`, make `pnpm` available through Corepack, then run from the repository root:

```bash
corepack enable
pnpm run interview:dev
```

The bootstrap command manufactures the Node and web WASM packages, installs the monorepo, builds `@wasm4pm/cognition`, and starts the Next.js application.

Production build and type checking:

```bash
pnpm run interview:build
pnpm run interview:typecheck
```

The application uses Next.js App Router and Monaco Editor. Monaco is browser-only and is loaded through `next/dynamic` with server-side rendering disabled.

## Full-hour Playwright visual interview

The browser-level acceptance suite follows classical Chicago TDD. It builds and serves the production Next.js application, initializes the real browser WASM package, drives the actual textarea and confirmation button, and renders the real Monaco editor. It does not mock routes, WASM exports, React state, persistence, or cognition state.

The only behavioral assertions are full-page screenshot comparisons. The shared 26-event fixture is driven from 9:00 AM through 10:00 AM using Playwright's browser clock. Nine visual checkpoints cover opening, clarification, approach detection, confirmation, implementation, complexity, completion, follow-up, and wrap-up.

```bash
pnpm run interview:test:visual:install
pnpm run interview:test:visual:update
pnpm run interview:test:visual
pnpm run interview:test:visual:ui
```

UUID generation remains real. Only the receipt-value region is masked because those hashes intentionally incorporate nonce-sensitive observation identities. Local snapshot authoring permits missing baselines; CI sets snapshot updates to `none`, so missing or changed screenshots fail.

See `tests/e2e/README.md` for the exact Chicago boundary and snapshot review workflow.

## Full-hour text-screen simulation

Run the deterministic hour-long Rust integration simulation with:

```bash
pnpm run interview:test:text
```

The fixture covers a realistic 9:00 AM to 10:00 AM senior-engineering interview with 26 ordered turns:

- introductions and problem presentation;
- clarification questions;
- ambiguous early evidence;
- coordinate-traversal detection and explicit confirmation;
- state invariant and transition discussion;
- implementation walkthrough;
- complexity analysis;
- test planning and production edge cases;
- a streaming and concurrency follow-up;
- final one-minute summary.

The integration test renders canonical text screens at nine checkpoints. The complete 60-minute ledger is replay-verified, and a second execution must produce bit-identical final state and text screens. Separate projection tests prove that the final coordinate-traversal state selects `coordinate_traversal.py` in Rust.

The timestamps are intentionally fictional. They model interview cadence and do not enter cognition scoring.

## Persistence and replay

Every observation and yes or no confirmation is serialized through one bounded canonical turn ledger. Observations use UUID identities rather than sequence numbers.

The browser persists the latest receipted state in `localStorage`, but schema shape does not grant standing. On reload, the application initializes WASM and invokes `verifySessionState`. Replay-invalid state is deleted before hypotheses, commitments, or Python source are rendered.

The **Reset** control clears the local state and begins a new interview.

## Boundary semantics

No LLM or vector database is involved. Phrase matching, target-conditioned certainty propagation, rule firing, track commitment, phase progression, replay verification, code selection, hashing, and receipt manufacture execute in Rust/WASM.

The optional Ed25519 value is explicitly a deterministic local self-signature. It is not remote actor authentication. BLAKE3 receipts remain the canonical tamper-evident computation commitments.
