# C4: System Context

**Re-verified:** 2026-07-24.

## Source commands executed

```text
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/page.tsx ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/cognition-adapter.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/sandbox-executor.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/ollama-adapter.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/persistence-adapter.ts ref=docs/v26.7.24-planning-diagramming
```

```mermaid
flowchart TB
    Candidate(["Candidate<br/>(person)"])

    subgraph System["InterviewAssist — Next.js application"]
        App["Candidate-facing session UI<br/>plus server route handlers"]
    end

    Cognition[["wasm4pm-cognition Node/WASM package<br/>Eliza currently wired"]]
    Sandbox[["Local OS subprocesses<br/>python3 / rustc / pytest / cargo"]]
    Ollama[["Local Ollama service<br/>self-play only; outside live-session critical path"]]
    NodeFs[["Local filesystem JSON store<br/>Node/Vitest persistence substitute"]]

    Candidate -->|"utterance, track confirmation,<br/>code, run/test actions"| App
    App -->|"server-side cognition_run"| Cognition
    Cognition -->|"selected + explanation + signature<br/>or typed refusal/unavailable outcome"| App
    App -->|"authorized compile/execute/test"| Sandbox
    Sandbox -->|"stdout / stderr / exit code"| App
    App -.->|"offline self-play scenarios"| Ollama
    App -.->|"scenario/test persistence only"| NodeFs
```

## Boundary corrections

- The persistence adapter is explicitly implemented with Node filesystem I/O as a stand-in. It is **not** current `localStorage` or IndexedDB integration.
- The live page does not call the persistence adapter. Filesystem persistence is exercised by scenario tests.
- The cognition adapter requires the bare package name `wasm4pm-cognition`. This diagram treats it as a runtime dependency, not a proven tracked in-repository artifact; the previously cited materialization script/package paths were absent from this branch when fetched.
- Ollama remains outside the candidate-facing request path. The self-play scenario conditionally calls it when the local service is reachable.

## See also

- [C4 container](c4-container.md)
- [Cognition sequence](sequence-cognition.md)
- [Sandbox sequence](sequence-sandbox-execution.md)
- [Unfinished work](unfinished-work.md)
