# Interview Answer Assistant

A browser-first reference UI for `cognition_session_turn`.

The shared upper monitor remains the interview workspace. This lower-screen UI runs the bounded interview domain entirely in browser WASM and displays ranked tracks, covered concepts, missing concepts, confirmation gates, inference traces, and receipt pointers.

## Run

After building both cognition WASM targets and the TypeScript package, serve this directory through a Vite-compatible dev server:

```bash
pnpm run build --workspace @wasm4pm/cognition
pnpm dlx vite examples/interview-assistant
```

The browser Web Speech API is used when available. Manual transcript entry is always available. No LLM or vector database is involved.

Session state is persisted in `localStorage`, then returned to WASM on every turn. The kernel recomputes and verifies the state hash before accepting a transition.
