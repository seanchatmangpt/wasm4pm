# Sequence: sandbox execution and capability catalog

**Re-verified:** 2026-07-24.

## Source commands executed

```text
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/page.tsx ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/api/run/route.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/api/test/route.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/app/api/sandbox/[capability]/route.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/sandbox-executor.ts ref=docs/v26.7.24-planning-diagramming
GitHub.fetch_file repository_full_name=seanchatmangpt/wasm4pm path=examples/interview-assist/lib/adapters/policy-check-adapter.ts ref=docs/v26.7.24-planning-diagramming
```

## Real execution path

```mermaid
sequenceDiagram
    actor Candidate
    participant Page as app/page.tsx
    participant Route as /api/run or /api/test
    participant Exec as sandbox-executor.ts
    participant Policy as policy-check-adapter.ts
    participant Proc as OS subprocess
    participant Receipt as receipt-emitter.ts

    Candidate->>Page: Run code or tests
    Page->>Route: POST request
    Route->>Exec: execute(request)
    Exec->>Policy: checkPolicy(capability, mode)

    alt policy denied
        Policy-->>Exec: denied
        Exec-->>Route: policy_denied refusal
        Note over Exec,Proc: No subprocess and no transition receipt
    else files empty
        Exec-->>Route: no_source_provided refusal
        Note over Exec,Proc: No subprocess and no transition receipt
    else admitted for execution
        Policy-->>Exec: allowed
        Exec->>Exec: create temp workspace and write bounded paths
        Exec->>Proc: spawn detached process group

        alt timeout or output cap reached
            Exec->>Proc: SIGKILL process group
            Proc-->>Exec: close resolves with exitCode -1
            Exec->>Receipt: emit sandbox-execution or test-result receipt
            Receipt-->>Exec: TransitionReceipt
            Exec-->>Route: ExecutionReceipt with exitCode -1
        else process closes normally
            Proc-->>Exec: exitCode, stdout, stderr
            Exec->>Receipt: emit sandbox-execution or test-result receipt
            Receipt-->>Exec: TransitionReceipt
            Exec-->>Route: ExecutionReceipt
        end
    end

    Route-->>Page: JSON refusal or receipt
    Page-->>Candidate: coherent result / diagnostics
```

## Static capability-catalog path

```mermaid
sequenceDiagram
    participant Caller
    participant Catalog as /api/sandbox/[capability]
    participant Ops as static OPERATIONS table

    Caller->>Catalog: GET or POST capability id
    Catalog->>Ops: findOperation(capability)
    alt unknown capability
        Catalog-->>Caller: 404 unknown capability
    else wrong method
        Catalog-->>Caller: 405 method not allowed
    else known capability and method
        Catalog-->>Caller: status = accepted
        Note over Catalog: No sandbox-executor call and no subprocess
    end
```

## Current behavior and exclusions

- `/api/run` and `/api/test` are the real execution routes.
- `/api/sandbox/[capability]` is a static catalog/validation endpoint. Calling it is not evidence that code executed.
- Policy denial and empty-file input return typed refusals before process creation.
- The `ExecutionRefusal` type declares `timeout` and `payload_too_large`, but the current `runCommand()` implementation does not return those variants. It kills the process and resolves an execution result with `exitCode: -1`; `execute()` then emits a transition receipt because a real process ran.
- `run_pytest` and `run_cargo_test` emit step `test-result`; other real capabilities emit `sandbox-execution`.
- `runCode()` currently omits `prevReceipt`, so its emitted receipt is a chain head even when cognition already emitted a receipt. This is part of TICKET-056's confirmed integration break.

## See also

- [C4 container](c4-container.md)
- [Receipt and replay sequence](sequence-receipt-replay.md)
- [Unfinished work](unfinished-work.md)
