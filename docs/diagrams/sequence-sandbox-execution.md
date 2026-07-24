# Sequence: sandbox code execution flow

Source: `examples/interview-assist/lib/adapters/sandbox-executor.ts`, read directly this session.
Patterns reused verbatim (per that file's own module doc) from `examples/interview-sandbox/lib/
executor-contract.ts`: workspace-escape prevention, output-size capping, process-group cleanup.

```mermaid
sequenceDiagram
    actor Candidate
    participant Page as page.tsx / EditorShell (client)
    participant Route as POST /api/run, /api/sandbox/[capability], /api/test
    participant Policy as policy-check-adapter.ts
    participant Exec as sandbox-executor.ts
    participant Proc as subprocess (python3 / rustc / pytest / cargo test)
    participant Receipt as receipt-emitter.ts

    Candidate->>Page: click Run / Test
    Page->>Route: POST { capability, files, timeoutMs, prevReceipt? }
    Route->>Exec: execute(request)
    Exec->>Policy: checkPolicy(capability, activeMode)

    alt policy denies
        Policy-->>Exec: denied
        Exec-->>Route: ExecutionRefusal { kind: "policy_denied", reason }
        Note over Exec,Proc: subprocess never spawned — real action must never<br/>happen before the policy check (TICKET-035 falsifier)
    else no source provided
        Exec-->>Route: ExecutionRefusal { kind: "no_source_provided" }
    else policy allows
        Policy-->>Exec: allowed
        Exec->>Exec: mkdtemp + write files (workspace-escape checked via path.resolve)
        Exec->>Proc: spawn(detached, own process group)
        Proc-->>Exec: stdout/stderr (capped at MAX_OUTPUT_BYTES, kills proc if exceeded)

        alt exceeds timeoutMs
            Exec->>Proc: SIGKILL (negative PID — full process-group tree)
            Exec-->>Route: ExecutionRefusal { kind: "timeout" }
        else exits (any exit code, 0 or non-zero)
            Proc-->>Exec: exitCode
            Exec->>Receipt: emitReceipt(step, {generated: exitCode/stdout, prevReceipt})
            Note over Exec,Receipt: step = "test-result" for run_pytest/run_cargo_test,<br/>else "sandbox-execution" — fixed by the ontology
            Receipt-->>Exec: TransitionReceipt
            Exec-->>Route: ExecutionReceipt { exitCode, stdout, stderr, transitionReceipt }
        end
    end

    Route-->>Page: JSON result
    Page->>Candidate: render ExecutionResultCard / TestResultView
```

Notes (grounded, not inferred):
- The policy check happens **before** any subprocess spawns — the real action (spawning) must
  never occur before authorization, per TICKET-035's own stated falsifier.
- A `TransitionReceipt` is attached on **any** real completed execution — success (exit 0) and
  real failure (non-zero exit, e.g. a syntax error) both count as a real action that occurred, so
  both get receipted. Only `ExecutionRefusal` (no real action ran: policy denial, no source,
  timeout) never carries one.
- The manufacturing-chain step name is fixed by the capability, not chosen ad hoc:
  `run_pytest`/`run_cargo_test` → `"test-result"`; every other capability → `"sandbox-execution"`.

## See Also

- [c4-component.md](c4-component.md) — where `sandbox-executor.ts` sits in the component graph
- [sequence-receipt-replay.md](sequence-receipt-replay.md) — how this step's receipt chains with
  the others
