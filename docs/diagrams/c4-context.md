# C4: System Context

Source: `examples/interview-assist/app/api/` (5 real routes), `lib/adapters/` (real external
integrations: `cognition-adapter.ts` → wasm4pm-cognition WASM, `sandbox-executor.ts` → local
subprocess, `ollama-adapter.ts` → local Ollama, `persistence-adapter.ts` → browser storage).

```mermaid
flowchart TB
    Candidate(["Candidate<br/>(person)"])

    subgraph System["InterviewAssist (Next.js app)"]
        App["InterviewAssist Session App"]
    end

    Cognition[["wasm4pm-cognition WASM module<br/>(wasm-pack --target nodejs build,<br/>Eliza breed, real Ed25519-signed output)"]]
    Sandbox[["Local subprocess sandbox<br/>(python3 / rustc / pytest / cargo test)"]]
    Ollama[["Local Ollama<br/>(self-play worker only,<br/>outside the live session critical path)"]]
    Storage[["Browser storage<br/>(localStorage / IndexedDB<br/>via persistence-adapter.ts)"]]

    Candidate -->|"submits utterances,<br/>writes/runs code,<br/>confirms tracks"| App
    App -->|"real cognition_run call<br/>(intent + rule catalog)"| Cognition
    Cognition -->|"selected + explanation<br/>+ Ed25519 signature"| App
    App -->|"real compile/execute/test<br/>via child_process.spawn"| Sandbox
    Sandbox -->|"stdout/stderr/exitCode"| App
    App -->|"self-play delta generation<br/>(outside critical path)"| Ollama
    App -->|"persist/replay session event log"| Storage
```

## See Also

- [c4-container.md](c4-container.md) — one level down
- [sequence-cognition.md](sequence-cognition.md) — the cognition boundary crossing in detail
- [sequence-sandbox-execution.md](sequence-sandbox-execution.md) — the sandbox boundary crossing
