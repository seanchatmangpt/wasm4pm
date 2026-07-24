# C4: Container

Source: `ls examples/interview-assist/app/api/` → `cognition`, `receipt`, `run`, `sandbox`, `test`
(5 real route directories, confirmed this session); `lib/wasm/wasm4pm-cognition/` (materialized
WASM package, per `scripts/materialize-wasm-cognition.mjs`); `lib/domain/` (reducer + receipt +
state-projection layer, all real generated/hand-authored TS).

```mermaid
flowchart TB
    Candidate(["Candidate<br/>(browser)"])

    subgraph NextApp["Next.js App Router application"]
        Client["Client components<br/>(\"use client\")<br/>page.tsx, SessionHeader,<br/>SessionWorkspace, CognitionPanel, EditorShell"]

        subgraph APIRoutes["API routes (server-only)"]
            R_COG["app/api/cognition/route.ts"]
            R_RUN["app/api/run/route.ts"]
            R_SANDBOX["app/api/sandbox/[capability]/route.ts"]
            R_TEST["app/api/test/route.ts"]
            R_RECEIPT["app/api/receipt/route.ts"]
        end

        Domain["Domain layer<br/>reducer.ts, phase-transitions.ts,<br/>receipt-emitter.ts, replay.ts,<br/>policy-check.ts (server-only, non-client-bundled)"]
    end

    WasmPkg[["lib/wasm/wasm4pm-cognition<br/>(materialized wasm-pack --target nodejs<br/>package, required() by cognition-adapter.ts)"]]
    SandboxProc[["Subprocess<br/>python3 / rustc / pytest / cargo,<br/>spawned by sandbox-executor.ts"]]
    OllamaSvc[["Local Ollama service<br/>(ollama-adapter.ts)"]]
    BrowserStore[["Browser storage<br/>(persistence-adapter.ts)"]]

    Candidate <--> Client
    Client -->|"POST /api/cognition"| R_COG
    Client -->|"POST /api/run, /api/sandbox/*, /api/test"| R_RUN
    Client -->|""| R_SANDBOX
    Client -->|""| R_TEST
    Client -->|"GET/POST /api/receipt"| R_RECEIPT

    R_COG --> Domain
    R_RUN --> Domain
    R_SANDBOX --> Domain
    R_TEST --> Domain
    R_RECEIPT --> Domain

    R_COG -->|"require('wasm4pm-cognition')"| WasmPkg
    R_RUN --> SandboxProc
    R_SANDBOX --> SandboxProc
    R_TEST --> SandboxProc
    Domain -.->|"self-play, outside session critical path"| OllamaSvc
    Client -->|"replay / persist"| BrowserStore
```

Note (grounded, from `cognition-adapter.ts`'s own module doc, read this session): the WASM package
is required by its real `node_modules` package name (`"wasm4pm-cognition"`), not a relative path —
a real Turbopack bundling bug was found and fixed live when a relative `require()` broke the
package's internal `__dirname`-relative `.wasm` asset load. `next.config.ts`'s
`serverExternalPackages` depends on that package-name resolution to keep this module out of the
client bundle.

## See Also

- [c4-context.md](c4-context.md) — one level up
- [c4-component.md](c4-component.md) — one level down, inside the Next.js app
