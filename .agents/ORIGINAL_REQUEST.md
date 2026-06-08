# Original User Request

## Initial Request — 2026-06-05T06:19:04Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Run implementation swarm using teamwork_preview

## Project Description
Implement pm4py-lsp as a Living LSP Gall checkpoint for wasm4pm parity, using max/tower-lsp-max only as the LSP 3.18 protocol substrate. Promote pm4py-lsp from PARTIAL_ALIVE to PM4PY-LSP-002_ALIVE.

Working directory: /Users/sac/wasm4pm
Integrity mode: benchmark

## Requirements

### R1. Boundary Law & Substrate Purity
- `max/tower-lsp-max` is protocol substrate only.
- `pm4py-lsp` owns PM4Py behavior.
- `wasm4pm` owns future Rust/WASM parity implementation.
- `wasm4pm-compat` owns typed evidence/admission substrate.
- DO NOT add PM4Py, XES, OCEL, BPMN, Petri net, POWL, fitness, precision, conformance, receipt semantics, or wasm4pm parity semantics to max/tower-lsp-max core.

### R2. Deterministic Snapshots & Reload Verification
- SnapshotId is deterministic from document state and relevant config.
- Parity fixtures and receipts must be persisted to disk under `fixtures/pm4py-parity/` and `receipts/pm4py-lsp/` respectively.
- Persisted fixtures and receipts must be reload-tested.

### R3. LSP Lifecycle Integration
- `didOpen` publishes diagnostics through the LSP service.
- `didChange` refreshes diagnostics through the LSP service.
- `codeAction` returns the expected PM4Py repair.
- `executeCommand` applies the edit and returns a receipt.
- Malformed command arguments refuse safely.

### R4. Equivalence and Conformance
- Conformance vector shifts from Refused to Admitted only after repair.
- PM4Py semantics remain strictly inside `crates/pm4py-lsp`.
- The wasm4pm parity fixture contract is defined in Rust with equivalence kinds and verdict classification.

### R5. Required File Tree Target
Aim for the following codebase layout:
```
crates/pm4py-lsp/
  Cargo.toml
  src/
    lib.rs
    analysis.rs
    diagnostics.rs
    server.rs
    actions.rs
    commands.rs
    receipts.rs
    fixtures.rs
    parity.rs
    pm4py_bridge.rs
  tests/
    static_analysis_test.rs
    diagnostics_test.rs
    lsp_lifecycle_test.rs
    actions_commands_test.rs
    receipts_fixtures_test.rs
    parity_contract_test.rs
    pm4py_bridge_test.rs

fixtures/
  pm4py-parity/
    .gitkeep

receipts/
  pm4py-lsp/
    .gitkeep

docs/
  checkpoints/
    PM4PY-LSP-001.md
    PM4PY-LSP-002.md
    WASM4PM-PARITY-001.md
    MAX-PURITY-FENCE.md
  reports/
    pm4py-lsp-agent-reports/
      CHECKLIST.md
      coordinator.md
      boundary.md
      static_analysis.md
      diagnostic.md
      lsp_lifecycle.md
      code_action_command.md
      receipt_fixture.md
      pm4py_runtime.md
      wasm4pm_parity.md
      VERIFICATION.md
```

## Agent Work Assignments & Roles

### AGENT 1 — coordinator_agent
- **Role:** Own mission coherence, checkpoint law, and final integration plan.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/coordinator.md`
  - `docs/checkpoints/PM4PY-LSP-002.md` (draft only until verifier finalizes)
- **Tasks:**
  1. Read current pm4py-lsp code, tests, Cargo.toml, and checkpoint docs.
  2. Build a surface map (current implemented surfaces, missing PM4PY-LSP-002 surfaces, risky overclaims, files to edit).
  3. Create a shared checklist in `docs/reports/pm4py-lsp-agent-reports/CHECKLIST.md`.
  4. Maintain PARTIAL_ALIVE discipline and record blockers.

### AGENT 2 — boundary_agent
- **Role:** Enforce max protocol purity and dependency discipline.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/boundary.md`
  - `docs/checkpoints/MAX-PURITY-FENCE.md`
- **Tasks:**
  1. Inspect workspace dependencies: `vendors/tower-lsp-max`, `crates/pm4py-lsp/Cargo.toml`, root `Cargo.toml`.
  2. Verify no PM4Py-specific code in max core.
  3. Propose durable vendor strategy.
  4. Add/maintain MAX-PURITY-FENCE doc.

### AGENT 3 — static_analysis_agent
- **Role:** Upgrade PM4Py/Python static detection without executing Python.
- **Owned files:**
  - `crates/pm4py-lsp/src/analysis.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/static_analysis_test.rs`
- **Tasks:**
  1. Extract current scan into analysis module.
  2. Support import forms (`import pm4py`, `import pm4py as pm`, `from pm4py import ...`).
  3. Support pandas aliases (`import pandas as pd`, `import pandas`, `pd.read_csv`, `pandas.read_csv`).
  4. Detect DataFrame variables loaded from CSV.
  5. Detect format_dataframe calls with aliases.
  6. Detect PM4Py discovery calls (inductive, dfg, etc.).
  7. Return a typed `PipelineFacts` struct containing facts and aliases.

### AGENT 4 — diagnostic_agent
- **Role:** Implement diagnostic families from static facts.
- **Owned files:**
  - `crates/pm4py-lsp/src/diagnostics.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/diagnostics_test.rs`
- **Tasks:**
  1. Implement diagnostics for: `pm4py.py.unformatted_dataframe`, `pm4py.py.missing_case_id_mapping`, `pm4py.py.missing_activity_mapping`, `pm4py.py.missing_timestamp_mapping`, `pm4py.py.discovery_before_formatting`, `pm4py.py.parity_fixture_missing`, `pm4py.py.unreceipted_output`.
  2. Ensure payload requirements: `source = "pm4py-lsp"`, exact diagnostic code, best known source range, actionable message, severity from law axis.

### AGENT 5 — lsp_lifecycle_agent
- **Role:** Validate real LSP lifecycle: initialize, didOpen, didChange, diagnostics refresh.
- **Owned files:**
  - `crates/pm4py-lsp/src/server.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/lsp_lifecycle_test.rs`
- **Tasks:**
  1. Ensure initialize advertises text document sync, code action provider, execute command provider, diagnostic support.
  2. Implement `didOpen` (store document, analyze, publish diagnostics).
  3. Implement `didChange` (update document, re-analyze, publish diagnostics).
  4. Implement `didClose` (clear tracked state, publish empty diagnostics).

### AGENT 6 — code_action_command_agent
- **Role:** Implement actual code actions and executeCommand repairs.
- **Owned files:**
  - `crates/pm4py-lsp/src/actions.rs`
  - `crates/pm4py-lsp/src/commands.rs`
  - `crates/pm4py-lsp/src/lib.rs` (module registration only)
  - `crates/pm4py-lsp/tests/actions_commands_test.rs`
- **Tasks:**
  1. Implement `codeAction` for `pm4py.py.unformatted_dataframe`.
  2. Implement commands: `pm4py-lsp.formatDataFrame`, `pm4py-lsp.createParityFixture`, `pm4py-lsp.generateReceipt`, `pm4py-lsp.explainPipelineState`.
  3. Ensure command validation, workspace edit application, and receipt persistence.

### AGENT 7 — receipt_fixture_agent
- **Role:** Deterministic snapshots, persisted parity fixtures, persisted receipts, reload verification.
- **Owned files:**
  - `crates/pm4py-lsp/src/receipts.rs`
  - `crates/pm4py-lsp/src/fixtures.rs`
  - `crates/pm4py-lsp/tests/receipts_fixtures_test.rs`
- **Tasks:**
  1. Replace UUID snapshot with deterministic snapshot hash (`pm4py-snap-<blake3>`).
  2. Persist parity fixture and receipt under JSON formats to disk.
  3. Implement reload tests for fixtures and receipts.
  4. Implement `verify_receipt_file` function.

### AGENT 8 — pm4py_runtime_agent
- **Role:** Optional gated PM4Py execution bridge.
- **Owned files:**
  - `crates/pm4py-lsp/src/pm4py_bridge.rs`
  - `crates/pm4py-lsp/tests/pm4py_bridge_test.rs`
  - `docs/reports/pm4py-lsp-agent-reports/pm4py_runtime.md`
- **Tasks:**
  1. Implement capability-gated bridge (static mode default, runtime mode explicit only).
  2. Safely handle Python/PM4Py import unavailability without panics (return Unknown/Refused).

### AGENT 9 — wasm4pm_parity_agent
- **Role:** Define parity fixture contract for wasm4pm without implementing crown engine.
- **Owned files:**
  - `crates/pm4py-lsp/src/parity.rs`
  - `crates/pm4py-lsp/tests/parity_contract_test.rs`
  - `docs/checkpoints/WASM4PM-PARITY-001.md`
  - `docs/reports/pm4py-lsp-agent-reports/wasm4pm_parity.md`
- **Tasks:**
  1. Define Rust models for equivalence contract (equivalence kinds: `exact_json`, `dfg_equivalence`, etc.; parity verdict enum).
  2. Implement `classify_parity_gap(pm4py_artifact, wasm4pm_artifact, equivalence_kind)`.
  3. Add parity contract tests.

### AGENT 10 — verifier_agent
- **Role:** Sole owner of cargo validation, final verdict, and checkpoint admission.
- **Owned files:**
  - `docs/reports/pm4py-lsp-agent-reports/VERIFICATION.md`
  - `docs/checkpoints/PM4PY-LSP-002.md` (final)
- **Tasks:**
  1. Perform `cargo fmt`, `cargo check`, and `cargo test` checks.
  2. Validate boundary and gates compliance.
  3. Emit final verdict: `PM4PY-LSP-002_ALIVE`, `PARTIAL`, `BLOCKED`, or `BUILD_BROKEN`.

## Global Swarm Rules
- Only `verifier_agent` may run workspace-wide cargo commands.
- Other agents may run file-local inspections, unit-test planning, grep, and targeted reads.
- No agent may run global cargo test/check except `verifier_agent`.
- No agent may modify max/tower-lsp-max core unless explicitly routed through `boundary_agent` and `verifier_agent`.
- No agent may claim ALIVE. Only `verifier_agent` may emit ALIVE/PARTIAL/BLOCKED verdict.
- All agents must leave receipts in `docs/reports/pm4py-lsp-agent-reports/`.
- Every changed surface must have a test or an explicit refusal note.
- Do not delete or weaken existing tests.
- Do not silently accept Unknown as Admitted. Unknown, Refused, and Admitted remain distinct.

## Combinatorial Maximalism Rule
Cross multiply:
Python source patterns
× PM4Py import patterns
× pandas aliases
× CSV/log loading patterns
× formatting/mapping patterns
× discovery calls
× conformance calls
× export calls
× LSP lifecycle events
× diagnostics
× code actions
× executeCommand
× persisted fixtures
× persisted receipts
× wasm4pm parity targets
× docs checkpoint claims
Then implement the smallest bounded working set that makes the cross-product visible, tested, and receipted.

## Acceptance Criteria
- [ ] G1. `cargo check -p pm4py-lsp` passes.
- [ ] G2. `cargo test -p pm4py-lsp` passes.
- [ ] G3. Snapshot is deterministic and covered by test.
- [ ] G4. Fixture is persisted and reload-tested.
- [ ] G5. Receipt is persisted and reload-tested.
- [ ] G6. didOpen/didChange LSP lifecycle is tested.
- [ ] G7. codeAction is tested through LSP-facing API.
- [ ] G8. executeCommand applies edit and returns receipt.
- [ ] G9. malformed command args refuse safely.
- [ ] G10. conformance vector distinguishes Admitted/Refused/Unknown.
- [ ] G11. PM4Py runtime is optional and safe if unavailable.
- [ ] G12. wasm4pm parity fixture contract exists.
- [ ] G13. max core remains PM4Py-free.
- [ ] G14. PM4PY-LSP-001 is corrected to PARTIAL_ALIVE if it currently overclaims.
- [ ] G15. PM4PY-LSP-002 doc states admitted and non-admitted surfaces exactly.

## Follow-up — 2026-06-05T06:52:02Z

MISSION
You are a 10-agent Definition-of-Done swarm operating inside ~/wasm4pm.

Your job is not merely to implement pm4py-lsp.
Your job is to prove whether pm4py-lsp is DONE.

Use combinatorial maximalism:
cross-multiply every already-present surface and force each one to produce evidence.

The governing doctrine is:
Old AI parses.
Process intelligence routes.
Law-state runtime admits or refuses.
LSP exposes diagnostics and repairs.
CLI/commands actuate.
Receipts preserve consequence.
Hooks create autonomic reflex.
The universal object is state under law.

PROJECT BOUNDARY
max / tower-lsp-max = pure LSP 3.18 substrate.
pm4py-lsp = Living LSP application project.
PM4Py = external reference engine.
wasm4pm = future Rust/WASM parity engine.
wasm4pm-compat = typed evidence/admission substrate.

DO NOT add PM4Py semantics to max.
DO NOT add process-mining law to max.
DO NOT call PARTIAL work ALIVE.
DO NOT collapse Unknown into Admitted.
DO NOT claim PM4Py runtime parity unless PM4Py actually executed and wasm4pm actually replayed.

PRIMARY CHECKPOINT
PM4PY-LSP-002_ALIVE

PM4PY-LSP-002_ALIVE is admitted only when every gate below is satisfied with test or receipt evidence.

GLOBAL DEFINITION OF DONE

DOD-G1. cargo check -p pm4py-lsp passes.
DOD-G2. cargo test -p pm4py-lsp passes.
DOD-G3. cargo fmt -p pm4py-lsp --check passes.
DOD-G4. SnapshotId is deterministic from project state, not UUID/randomness.
DOD-G5. Parity fixture is persisted to fixtures/pm4py-parity/<snapshot>.json.
DOD-G6. Receipt is persisted to receipts/pm4py-lsp/<snapshot>.json.
DOD-G7. Fixture reload verification exists and passes.
DOD-G8. Receipt reload verification exists and passes.
DOD-G9. didOpen analyzes document state and records/publishes diagnostics.
DOD-G10. didChange refreshes diagnostics.
DOD-G11. didClose clears or deactivates document diagnostics correctly.
DOD-G12. codeAction returns the PM4Py repair action through LSP-facing API.
DOD-G13. executeCommand applies the repair edit and returns a receipt.
DOD-G14. malformed command arguments refuse safely.
DOD-G15. conformance vector distinguishes Admitted, Refused, and Unknown.
DOD-G16. PM4Py runtime bridge is optional and safe when PM4Py is unavailable.
DOD-G17. wasm4pm parity fixture contract exists but does not overclaim parity.
DOD-G18. max core remains PM4Py-free.
DOD-G19. PM4PY-LSP-001 is corrected to PARTIAL_ALIVE if it currently overclaims.
DOD-G20. PM4PY-LSP-002.md contains exact admitted, refused, unknown, and future surfaces.

ONLY verifier_agent may emit the final verdict.

FINAL VERDICT OPTIONS
PM4PY-LSP-002_ALIVE
PM4PY-LSP-002_PARTIAL
PM4PY-LSP-002_BLOCKED
BUILD_BROKEN

ANTI-OVERCLAIM LAW
Forbidden final statements:
- “Every PM4Py workflow is now receipted.”
- “All PM4Py capabilities are validated.”
- “wasm4pm parity is complete.”
- “PM4Py runtime is proven” unless PM4Py actually executed in test.
- “max supports PM4Py.”
- “ALIVE” without the verifier gate table.

Allowed ALIVE statement:
“PM4PY-LSP-002_ALIVE: deterministic snapshot, persisted fixture, persisted receipt, LSP lifecycle, code action, command actuation, conformance shift, safe runtime boundary, and parity fixture contract are validated for the first bounded PM4Py Python workflow surface.”

WORKSPACE TARGET TREE

crates/pm4py-lsp/
  Cargo.toml
  src/
    lib.rs
    analysis.rs
    diagnostics.rs
    server.rs
    actions.rs
    commands.rs
    receipts.rs
    fixtures.rs
    parity.rs
    pm4py_bridge.rs
  tests/
    static_analysis_test.rs
    diagnostics_test.rs
    lsp_lifecycle_test.rs
    actions_commands_test.rs
    receipts_fixtures_test.rs
    parity_contract_test.rs
    pm4py_bridge_test.rs

fixtures/
  pm4py-parity/
    .gitkeep

receipts/
  pm4py-lsp/
    .gitkeep

docs/
  checkpoints/
    PM4PY-LSP-001.md
    PM4PY-LSP-002.md
    WASM4PM-PARITY-001.md
    MAX-PURITY-FENCE.md
  reports/
    pm4py-lsp-dod/
      CHECKLIST.md
      agent-01-coordinator.md
      agent-02-boundary.md
      agent-03-static-analysis.md
      agent-04-diagnostics.md
      agent-05-lsp-lifecycle.md
      agent-06-actions-commands.md
      agent-07-receipts-fixtures.md
      agent-08-runtime.md
      agent-09-parity.md
      agent-10-verifier.md
      FINAL-VERDICT.md

AGENT 01 — coordinator_agent

ROLE
Own global checklist, scope discipline, and checkpoint language.

DEFINITION OF DONE
1. Read pm4py-lsp source, tests, Cargo.toml, checkpoint docs, and max vendor boundary.
2. Produce docs/reports/pm4py-lsp-dod/CHECKLIST.md.
3. CHECKLIST.md contains every global DOD gate G1-G20.
4. Each gate has status:
   - PASS
   - FAIL
   - UNKNOWN
   - BLOCKED
5. Each gate links to responsible agent.
6. PM4PY-LSP-001 overclaims are identified.
7. PM4PY-LSP-002 target language is drafted but not admitted.
8. No ALIVE claim is made.

DONE EVIDENCE
- CHECKLIST.md exists.
- agent-01-coordinator.md exists.
- Every DOD gate is assigned.

AGENT 02 — boundary_agent

ROLE
Protect max protocol purity.

DEFINITION OF DONE
1. Inspect vendors/tower-lsp-max.
2. Inspect crates/pm4py-lsp dependencies.
3. Search max for PM4Py/process-mining terms:
   pm4py, XES, OCEL, BPMN, Petri, POWL, process mining, fitness, precision, parity.
4. Confirm no PM4Py semantics live in max.
5. Confirm pm4py-lsp uses max only as protocol substrate.
6. Document vendor status:
   - scratch copy
   - submodule
   - subtree
   - path dependency
   - unknown
7. Write docs/checkpoints/MAX-PURITY-FENCE.md.

DEFINITION OF DONE FAIL CONDITIONS
- Any PM4Py semantics in max core.
- Any max-core code changed to support PM4Py.
- Any process-mining type added to tower-lsp-max protocol core.

DONE EVIDENCE
- MAX-PURITY-FENCE.md exists.
- agent-02-boundary.md includes PASS/FAIL table.
- Boundary status appears in FINAL-VERDICT.md.

AGENT 03 — static_analysis_agent

ROLE
Make old-AI parsing explicit and testable.

DEFINITION OF DONE
1. Create or update src/analysis.rs.
2. Implement typed facts model:
   PipelineFacts
   CsvLoad
   FormatCall
   DiscoveryCall
   ConformanceCall
   ExportCall
   UnknownPattern
3. Detect PM4Py imports:
   import pm4py
   import pm4py as pm
   from pm4py import ...
4. Detect pandas imports:
   import pandas as pd
   import pandas
5. Detect CSV loads:
   df = pd.read_csv(...)
   df = pandas.read_csv(...)
6. Detect format_dataframe:
   pm4py.format_dataframe(df, ...)
   pm.format_dataframe(df, ...)
7. Detect discovery calls:
   discover_petri_net_inductive
   discover_bpmn_inductive
   discover_dfg
   discover_process_tree_inductive
8. Static analysis never executes Python.
9. Unknowns are recorded, not admitted.
10. Add tests for each detection category.

DEFINITION OF DONE FAIL CONDITIONS
- Regex panic on malformed Python.
- PM4Py absent file produces PM4Py diagnostics.
- Alias forms are ignored without UNKNOWN record.
- Static analysis executes Python.

DONE EVIDENCE
- src/analysis.rs exists.
- tests/static_analysis_test.rs passes.
- agent-03-static-analysis.md lists detected and unsupported patterns.

AGENT 04 — diagnostic_agent

ROLE
Convert PipelineFacts into Living LSP diagnostics.

DEFINITION OF DONE
Implement diagnostics:

1. pm4py.py.unformatted_dataframe
2. pm4py.py.missing_case_id_mapping
3. pm4py.py.missing_activity_mapping
4. pm4py.py.missing_timestamp_mapping
5. pm4py.py.discovery_before_formatting
6. pm4py.py.parity_fixture_missing
7. pm4py.py.unreceipted_output

Each diagnostic must include:
- source = "pm4py-lsp"
- exact code
- severity
- range
- actionable message
- law axis when possible
- residual-clear behavior documented

Tests must prove:
1. Positive case for each diagnostic.
2. Negative case for each diagnostic.
3. Multiple diagnostics can coexist.
4. Repair of one diagnostic does not erase unrelated diagnostics.
5. Unknown state remains Unknown, not Admitted.

DEFINITION OF DONE FAIL CONDITIONS
- Diagnostic disappears without lifecycle reason.
- Missing mapping is treated as admitted.
- Diagnostic has no code.
- Diagnostic has no actionable repair or explicit terminality.

DONE EVIDENCE
- src/diagnostics.rs exists.
- tests/diagnostics_test.rs passes.
- agent-04-diagnostics.md lists diagnostic matrix.

AGENT 05 — lsp_lifecycle_agent

ROLE
Prove real LSP lifecycle, not just helper functions.

DEFINITION OF DONE
1. initialize advertises:
   - text document sync
   - code action provider
   - execute command provider
   - relevant diagnostic support if substrate supports it
2. didOpen:
   - stores document
   - analyzes document
   - records/publishes diagnostics
3. didChange:
   - updates document
   - re-analyzes
   - refreshes diagnostics
4. didClose:
   - removes or deactivates document state
   - clears diagnostics correctly
5. Tests use LSP-facing service harness where available.
6. If publishDiagnostics cannot be inspected directly, a diagnostic cache is exposed only for test and documented.

DEFINITION OF DONE FAIL CONDITIONS
- Tests only call diagnose_text directly.
- didChange does not alter conformance state.
- didClose leaves stale active diagnostics.
- initialize omits required capabilities.

DONE EVIDENCE
- src/server.rs exists or lifecycle implemented cleanly.
- tests/lsp_lifecycle_test.rs passes.
- agent-05-lsp-lifecycle.md explains harness limitations.

AGENT 06 — actions_commands_agent

ROLE
Prove repair actions and command actuation.

DEFINITION OF DONE
1. codeAction exists for pm4py.py.unformatted_dataframe.
2. codeAction title is bounded and specific.
3. codeAction includes either WorkspaceEdit or command.
4. executeCommand implements:
   pm4py-lsp.formatDataFrame
5. executeCommand validates:
   - URI
   - variable name
   - insertion position
   - optional mapping parameters
6. executeCommand applies edit.
7. executeCommand returns receipt.
8. executeCommand preserves residual diagnostics.
9. malformed args produce safe refusal/error.
10. Additional commands exist or are explicitly future:
   - pm4py-lsp.createParityFixture
   - pm4py-lsp.generateReceipt
   - pm4py-lsp.explainPipelineState

DEFINITION OF DONE FAIL CONDITIONS
- Code action exists but cannot actuate.
- Command applies edit but emits no receipt.
- Malformed command panics.
- Repair clears all diagnostics indiscriminately.

DONE EVIDENCE
- src/actions.rs exists.
- src/commands.rs exists.
- tests/actions_commands_test.rs passes.
- agent-06-actions-commands.md lists command contracts.

AGENT 07 — receipts_fixtures_agent

ROLE
Turn preliminary receipts into persisted replayable evidence.

DEFINITION OF DONE
1. SnapshotId is deterministic.
2. SnapshotId input includes:
   - URI
   - document text hash
   - pm4py-lsp version
   - config hash
   - PipelineFacts hash
3. SnapshotId format:
   pm4py-snap-<blake3>
4. Fixture path:
   fixtures/pm4py-parity/<snapshot>.json
5. Receipt path:
   receipts/pm4py-lsp/<snapshot>.json
6. Fixture schema includes:
   - schema_version
   - snapshot_id
   - source_uri
   - source_hash
   - csv_path
   - pandas_alias
   - pm4py_alias
   - discovery_calls
   - mapping_parameters
   - expected_artifact_class
   - unknowns
7. Receipt schema includes:
   - receipt_id
   - snapshot_id
   - law_axis
   - action
   - input_hash
   - output_hash
   - tool_version
   - optional timestamp
8. Tests write fixture and reload it.
9. Tests write receipt and reload it.
10. Tests verify receipt hash.
11. Random UUID is not used for snapshot identity.

DEFINITION OF DONE FAIL CONDITIONS
- Fixture only logged, not written.
- Receipt only logged, not written.
- Snapshot changes between identical inputs.
- Receipt cannot be verified after reload.

DONE EVIDENCE
- src/receipts.rs exists.
- src/fixtures.rs exists.
- tests/receipts_fixtures_test.rs passes.
- agent-07-receipts-fixtures.md lists persisted files and schemas.

AGENT 08 — runtime_agent

ROLE
Keep PM4Py runtime optional, explicit, and safe.

DEFINITION OF DONE
1. src/pm4py_bridge.rs exists.
2. Static mode is default.
3. Runtime mode is explicit command only.
4. didOpen/didChange never execute Python.
5. Bridge can check whether Python/PM4Py is available.
6. If PM4Py unavailable:
   - return Unknown or Refused
   - do not panic
   - do not fail cargo test
7. Optional ignored/manual test may execute actual PM4Py if installed.
8. Runtime proof is not claimed unless the manual/runtime test actually runs.

DEFINITION OF DONE FAIL CONDITIONS
- PM4Py installation required for normal tests.
- Arbitrary Python executes automatically.
- Runtime unavailable gets marked Admitted.
- Agent claims PM4Py execution without evidence.

DONE EVIDENCE
- src/pm4py_bridge.rs exists.
- tests/pm4py_bridge_test.rs passes without PM4Py.
- agent-08-runtime.md states runtime status.

AGENT 09 — parity_agent

ROLE
Define wasm4pm parity bridge without pretending parity is done.

DEFINITION OF DONE
1. src/parity.rs exists.
2. ParityFixture contract exists.
3. EquivalenceKind enum exists:
   - ExactJson
   - DfgEquivalence
   - PetriNetIsomorphismPlaceholder
   - BpmnSemanticPlaceholder
   - ConformanceMetricTolerance
   - Unsupported
4. ParityVerdict enum exists:
   - NotChecked
   - Admitted
   - Refused
   - Unknown
   - Unsupported
5. classify_parity_gap supports:
   - ExactJson admitted/refused
   - Unsupported returns Unsupported
   - Unknown remains Unknown
6. tests/parity_contract_test.rs proves:
   - equal exact JSON admitted
   - mismatch refused
   - unsupported is not refused
   - not checked is not admitted
7. docs/checkpoints/WASM4PM-PARITY-001.md exists and is FUTURE / NOT_YET_ALIVE.

DEFINITION OF DONE FAIL CONDITIONS
- wasm4pm parity claimed complete.
- Unsupported algorithm becomes Refused without distinction.
- NotChecked becomes Admitted.
- Full process-mining equivalence is faked.

DONE EVIDENCE
- src/parity.rs exists.
- tests/parity_contract_test.rs passes.
- WASM4PM-PARITY-001.md states future gate.
- agent-09-parity.md lists parity limits.

AGENT 10 — verifier_agent

ROLE
Only verifier may admit or refuse the checkpoint.

DEFINITION OF DONE
1. Read every agent report.
2. Confirm required files exist.
3. Run:
   cd /Users/sac/wasm4pm && cargo fmt -p pm4py-lsp --check
   cd /Users/sac/wasm4pm && cargo check -p pm4py-lsp
   cd /Users/sac/wasm4pm && cargo test -p pm4py-lsp
4. Optionally run cargo check --workspace only if workspace is stable.
5. Build final DOD table:
   Gate | Evidence | Verdict
6. Confirm boundary:
   - max core PM4Py-free
   - PM4Py behavior in pm4py-lsp
7. Confirm PM4PY-LSP-001 is not overclaimed.
8. Finalize PM4PY-LSP-002.md.
9. Write FINAL-VERDICT.md.
10. Verdict must be exactly one:
    - PM4PY-LSP-002_ALIVE
    - PM4PY-LSP-002_PARTIAL
    - PM4PY-LSP-002_BLOCKED
    - BUILD_BROKEN

DEFINITION OF DONE FAIL CONDITIONS
- Any cargo command fails.
- Any global DOD gate unknown.
- Any ALIVE claim lacks evidence.
- Any PM4Py semantics leak into max core.
- Any random snapshot identity remains.
- Any fixture/receipt persistence is fake.

DONE EVIDENCE
- agent-10-verifier.md exists.
- FINAL-VERDICT.md exists.
- PM4PY-LSP-002.md finalized.
- Exact cargo output summarized.
- Final verdict is bounded.

FINAL REPORT TEMPLATE

VERDICT:
PM4PY-LSP-002_ALIVE | PM4PY-LSP-002_PARTIAL | PM4PY-LSP-002_BLOCKED | BUILD_BROKEN

SUMMARY:
- What changed.
- What is admitted.
- What is refused.
- What remains unknown.
- What tests ran.
- Boundary status.
- Next checkpoint.

DOD TABLE:
Gate | Evidence | Verdict

BOUNDARY:
max/tower-lsp-max purity = PASS | FAIL

CARGO:
fmt = PASS | FAIL
check = PASS | FAIL
test = PASS | FAIL

NEXT CHECKPOINT:
PM4PY-LSP-003_ALIVE =
actual PM4Py runtime receipt on a sample event log,
persisted as reference behavior,
then consumed by wasm4pm replay contract.

COMMIT RULE
Do not commit unless verifier verdict is PM4PY-LSP-002_ALIVE or user explicitly accepts PARTIAL.

Preferred commit message:
pm4py-lsp: promote Gall bridge to deterministic fixture checkpoint

## Follow-up — 2026-06-05T07:48:39Z

Finalize PM4PY-LSP-002 verifier reconciliation.

Do not implement new features.

Produce docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md with:

1. exact cargo fmt/check/clippy/test results
2. exact commit hash
3. admitted surfaces
4. non-admitted surfaces
5. receipt taxonomy:
   - command receipts
   - fixture receipts
   - behavior receipts
   - release certificates
6. whether persisted fixtures/receipts are committed artifacts or test-generated artifacts
7. boundary status proving max remains PM4Py-free

If all gates are evidenced, mark PM4PY-LSP-002_ALIVE.
If receipt taxonomy remains ambiguous, mark PM4PY-LSP-002_ALIVE_WITH_RECEIPT_TAXONOMY_GAP.
Do not claim wasm4pm parity.
Do not claim all PM4Py workflows.

## Follow-up — 2026-06-05T07:50:55Z

MISSION
You are a 10-agent Definition-of-Done swarm operating inside ~/wasm4pm.

Your job is not merely to implement pm4py-lsp.
Your job is to prove whether pm4py-lsp is DONE.

Use combinatorial maximalism:
cross-multiply every already-present surface and force each one to produce evidence.

PM4PY-LSP-003 Test Doctrine:
PM4PY-LSP-003_ALIVE = pm4py-lsp is validated across unit, integration, e2e, chaos, stress, and benchmark gates for the first bounded PM4Py workflow surface.

The bounded surface is:
Python PM4Py workflow:
  import pm4py
  pandas read_csv
  format_dataframe requirement
  discovery call
  fixture generation
  receipt generation
  conformance-vector shift

## 1. Unit tests
Unit tests prove local functions are correct without LSP transport.
Scope:
analysis.rs, diagnostics.rs, fixtures.rs, receipts.rs, parity.rs, pm4py_bridge.rs
Required unit gates:
U1. detect import pm4py
U2. detect import pm4py as pm
U3. detect from pm4py import ...
U4. detect pandas aliases
U5. detect read_csv variables
U6. detect format_dataframe variables
U7. detect discovery calls
U8. detect missing mappings
U9. generate deterministic snapshot from identical input
U10. snapshot changes when document changes
U11. generate fixture payload
U12. persist/reload fixture
U13. persist/reload receipt
U14. corrupt receipt refuses
U15. parity exact match admits
U16. parity mismatch refuses
U17. unsupported parity is Unsupported, not Refused
U18. PM4Py unavailable returns Unknown/Refused, not panic

Command:
cargo test -p pm4py-lsp --test static_analysis_test
cargo test -p pm4py-lsp --test diagnostics_test
cargo test -p pm4py-lsp --test receipts_fixtures_test
cargo test -p pm4py-lsp --test parity_contract_test
cargo test -p pm4py-lsp --test pm4py_bridge_test

## 2. Integration tests
Integration tests prove internal modules work together.
Scope:
analysis → diagnostics
diagnostics → code actions
code actions → commands
commands → receipts
commands → fixtures
snapshot → conformance vector

Required integration gates:
I1. unformatted DataFrame produces diagnostic
I2. format_dataframe repair clears only related diagnostic
I3. missing mapping diagnostics remain after formatting
I4. createParityFixture writes fixture
I5. generateReceipt writes receipt
I6. command receipt hash verifies
I7. conformance vector moves Refused → Admitted after repair
I8. Unknown law axis remains Unknown
I9. malformed command args refuse safely
I10. repeated command is idempotent or safely refused

Command:
cargo test -p pm4py-lsp --test capability_test
cargo test -p pm4py-lsp --test actions_commands_test

## 3. E2E tests
E2E tests prove real LSP behavior, not helper calls.
Scope:
initialize, didOpen, publish diagnostics / diagnostic cache, codeAction, executeCommand, didChange, conformance vector, receipt lookup, didClose
Required E2E scenario:
1. Start pm4py-lsp through max service harness.
2. initialize.
3. didOpen Python file with PM4Py + unformatted read_csv.
4. Verify diagnostic appears.
5. Request codeAction.
6. Execute formatDataFrame command.
7. Verify WorkspaceEdit applied.
8. Verify receipt returned and persisted.
9. didChange with repaired content.
10. Verify diagnostic clears through lifecycle.
11. Verify conformance vector is Admitted for formatting law.
12. didClose.
13. Verify document state clears/deactivates.

Command:
cargo test -p pm4py-lsp --test lsp_lifecycle_test
cargo test -p pm4py-lsp --test e2e_lsp_test
Add: crates/pm4py-lsp/tests/e2e_lsp_test.rs

## 4. Chaos tests
Chaos tests prove refusal discipline under malformed, adversarial, partial, and corrupted state.
Scope:
bad Python text, partial edits, malformed JSON-RPC, missing command args, corrupted fixture, corrupted receipt, unknown PM4Py alias, file deleted mid-command, duplicate document open, concurrent didChange, receipt tampering
Required chaos gates:
C1. malformed Python never panics
C2. malformed command args return error/refusal
C3. corrupted receipt refuses
C4. corrupted fixture refuses
C5. missing fixture produces diagnostic, not panic
C6. unknown import alias records Unknown
C7. concurrent didChange does not poison state
C8. didClose during command does not panic
C9. duplicate command does not double-admit
C10. PM4Py runtime unavailable does not fail tests
C11. invalid URI refuses safely
C12. invalid JSON-RPC request produces protocol error

Command:
cargo test -p pm4py-lsp --test chaos_test
Add: crates/pm4py-lsp/tests/chaos_test.rs

## 5. Stress tests
Stress tests prove the system holds under scale and repetition.
Scope:
many documents, large Python files, many diagnostics, many receipts, many fixtures, repeated didChange, parallel requests, long-running runtime bridge refusal
Required stress gates:
S1. 1,000 PM4Py-like files analyzed without panic
S2. 10,000 read_csv lines analyzed within bounded time
S3. 1,000 receipts generated and verified
S4. 1,000 fixtures generated and reloaded
S5. 100 concurrent didChange events stabilize
S6. repeated conformance queries are stable
S7. memory does not grow unbounded after didClose
S8. no deadlock under parallel codeAction + executeCommand

Command:
cargo test -p pm4py-lsp --test stress_test -- --ignored
Mark expensive tests as ignored by default: #[ignore = "stress gate"]

## 6. Benchmarks
Benchmarks prove performance class.
Benchmark dimensions:
B1. static analysis throughput
B2. diagnostic generation latency
B3. snapshot hash latency
B4. fixture write latency
B5. receipt verify latency
B6. codeAction latency
B7. conformance vector latency
B8. E2E didOpen → diagnostics latency

Crate: criterion = "0.5" in dev-dependencies.
Bench files:
crates/pm4py-lsp/benches/analysis_bench.rs, diagnostics_bench.rs, receipts_bench.rs, lsp_flow_bench.rs
Commands:
cargo bench -p pm4py-lsp
Initial targets:
analysis small file: < 1 ms
analysis 10k-line file: < 50 ms
diagnostics small file: < 1 ms
snapshot generation: < 5 ms
receipt verify: < 5 ms
codeAction generation: < 5 ms

## 7. Final verifier gate
The verifier must produce docs/reports/pm4py-lsp-dod/FINAL-VERDICT.md with:
Gate | Command / Evidence | Verdict
Clippy, Fmt, Boundary, Unit, Integration, E2E, Chaos, Stress, Bench.

## 10-agent hyperprompt addendum
Agent 01 — unit_test_agent
Agent 02 — integration_test_agent
Agent 03 — e2e_lsp_agent
Agent 04 — chaos_agent
Agent 05 — stress_agent
Agent 06 — benchmark_agent
Agent 07 — boundary_agent
Agent 08 — receipt_evidence_agent
Agent 09 — docs_checkpoint_agent
Agent 10 — verifier_agent

Definition of Done Checklist:
- cargo fmt --check -p pm4py-lsp PASS
- cargo clippy -p pm4py-lsp --all-targets -- -D warnings PASS
- cargo test -p pm4py-lsp PASS
- cargo test -p pm4py-lsp --test chaos_test PASS
- cargo test -p pm4py-lsp --test e2e_lsp_test PASS
- stress tests either PASS or explicitly SKIPPED with reason
- cargo bench -p pm4py-lsp either PASS or explicitly SKIPPED with reason
- max purity scan PASS
- FINAL-VERDICT.md written

## Follow-up — 2026-06-05T17:54:23Z

Discover all outdated documentation/reports across the monorepo and decide how to update them to accurately reflect the latest system state, verifications, and release certificate status.

Working directory: /Users/sac/wasm4pm
Integrity mode: benchmark

## Requirements

### R1. Documentation Discovery
Search the monorepo (including root files, `docs/`, `.agents/`, and packages/crates) to identify all outdated documentation, release changelogs, handoff notes, or status reports that do not match the current commit state and verdict (`PM4PY-LSP-003_ALIVE`).

### R2. Documentation and Status Realignment
Update all identified files (e.g., handoffs, progress files, final verdicts, check-in reports, etc.) to capture the exact, actual system state, including latest commit hash, verification results (e.g., unit/integration/E2E test counts), and release status.

### R3. Release Certificate Verification
Ensure that release certificates or related documentation are fully consistent with the version in `package.json` (version `26.5.29`) and that no discrepancies exist between the actual artifacts and their described statuses.

## Acceptance Criteria

### Completeness and Accuracy
- [ ] Every updated document or status report lists the correct commit hash (`ca8b6e1de68a1cf474445f1ec1008c524e778e66` or latest HEAD) and version (`26.5.29`).
- [ ] Test status numbers in updated reports exactly match the output of running verification commands (e.g., 52 non-stress tests passing).
- [ ] No placeholder terms, stubs, or "TODO" items exist in the updated files.
- [ ] Updated documents contain no broken internal/external file links.



## Follow-up — 2026-06-05T18:40:23Z

Perform a complete version bump to 26.6.5 across all package.json files, Cargo.toml files, rebuild the WASM bundle, re-run tests/verification gates, and generate all required release certificates.

Working directory: /Users/sac/wasm4pm
Integrity mode: benchmark

## Requirements

### R1. Version Bump Realignment
Update all version strings from `26.5.29` to `26.6.5` across all package.json files, Cargo.toml files, lock files, and documentation across the monorepo.

### R2. WASM Rebuild and Cargo Check
Rebuild the WASM bundle and verify that all crates compile successfully under the new version.

### R3. Release verification and Evidence Generation
Run the full verification suite (`npm run release:full`) to generate `RELEASE_CERTIFICATE.v26.6.5.json`, algorithm behavior/reachability evidence, and example receipts matching version `26.6.5`.

## Acceptance Criteria

### Verification and Consistency
- [ ] Every package.json and Cargo.toml file in the monorepo is updated to version `26.6.5`.
- [ ] All validation, proof, and release checks run and pass successfully for version `26.6.5`.
- [ ] The generated `RELEASE_CERTIFICATE.v26.6.5.json` and evidence files exist on disk with correct hashes binding to the latest git HEAD commit.

## 2026-06-08T04:08:45Z

Implement all 13 Quality-of-Life (QoL) and Developer Experience (DX) gaps identified in the audit report `wasm4pm-qol-audit-2026-05-18.json` inside the `wasm4pm` repository.

Working directory: `/Users/sac/wasm4pm`
Integrity mode: benchmark

## Requirements

### R1. Implement QoL Gaps QoL-001 through QoL-013
Ensure that the CLI outputs, error messages, and parameters are enhanced to resolve all 13 audited issues:
- **QoL-001 (Algorithm rationale)**: Add per-tier rationale in `wpm algorithms` output, and a `--recommend-for <size|time>` flag.
- **QoL-002 (Fitness thresholds)**: Provide clear explanations of default (0.80) vs. academic (0.85) thresholds in conformance outputs, plus a `--explain-fitness` option.
- **QoL-003 (Next step hints)**: Automatically emit contextual next steps (e.g. suggesting conformance commands) after successful runs, add a `--guide-next-steps` flag, and implement the `wpm workflow` command.
- **QoL-004 (CLI aliases & error clarity)**: Show exact naming suggestion (e.g. underscores vs. dashes) and CLI aliases in case of unknown algorithms.
- **QoL-005 (Confidence Intervals explanation)**: Output diagnostic interpretation lines for statistical confidence intervals and add `--explain-ci`.
- **QoL-006 (Parameters CLI help)**: Integrate parameter ranges and defaults help into the `wpm run` command and validate parameters.
- **QoL-007 (Output format differences)**: Add help text comparing `json` and `human` formats, and implement `csv` export.
- **QoL-008 (Van der Aalst quality tradeoffs)**: Highlight relative metric importance and tradeoffs, plus add `--explain-quality-dims`.
- **QoL-009 (Conformance deviations diagnostics)**: Provide remediation/diagnosis hints when deviations are detected, plus add `--diagnose-deviations`.
- **QoL-010 (Algorithm time budgets)**: Check timeout configurations against estimated time requirements based on log size and warn users.
- **QoL-011 (Algorithm recommendation wizard)**: Implement `wpm select-algorithm` interactive command and `--auto-select` flag.
- **QoL-012 (Exit code 4 explanation)**: Cleanly output failure summaries and success status when exit code 4 (partial success) occurs in batch comparisons.
- **QoL-013 (Color/emoji flags)**: Expose `--no-color` and `--no-emoji` flags, and automatically disable color/emoji when running in CI environments.

### R2. Core CLI & App Command Integration
Ensure all improvements are fully wired into the target CLI commands (`wpm run`, `wpm algorithms`, `wpm conformance`, `wpm quality`, `wpm compare`, `wpm predict`, `wpm ml`, `wpm doctor`).

### R3. Test Coverage & CI Checks
Add robust test cases for all QoL improvements to verify outputs, parameters validation, and new CLI flags. Ensure all workspace checks and tests pass.

## Acceptance Criteria

### In-CLI Quality and Behavior
- [ ] Every implemented QoL command option (`--recommend-for`, `--explain-fitness`, `--guide-next-steps`, `--explain-ci`, `--explain-quality-dims`, `--diagnose-deviations`, `wpm select-algorithm`, `wpm workflow`, `--no-color`, `--no-emoji`) outputs clear, helpful, and correct guidance text.
- [ ] The CLI validates algorithm parameters before calling WASM libraries, preventing cryptic errors.
- [ ] No hardcoded bypasses, placeholders, or unimplemented stubs are present.

### Verification and CI Compliance
- [ ] Running `npm run build:cli` compiles the CLI app successfully with zero errors.
- [ ] Running `npm test` (or the workspace test suite) executes and passes all new and existing tests cleanly.
- [ ] Running `npm run lint` and `npm run check` results in zero style or syntax warnings.
