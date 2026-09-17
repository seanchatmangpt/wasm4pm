<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/checkpoints/PM4PY-LSP-001.md; source-sha256: 434f008997015a11f9c45223f98381a39a50bf4740e9df0bed26fb129e88a3d3; reason: tooling or agent control surface -->

# Checkpoint: PM4PY-LSP-001_ALIVE

## Status: PARTIAL_ALIVE (CORRECTED)

## Verdict: PARTIAL_ALIVE
This checkpoint was originally overclaimed as ALIVE. It is now corrected to PARTIAL_ALIVE because while detection and diagnostics were present, it lacked deterministic snapshots and physical artifact persistence.

## Evidence:
- **Detection**: `import pm4py` is detected in Python files.
- **Diagnostics**: `pm4py.py.unformatted_dataframe` is raised.
- **Repairs**: "Insert pm4py.format_dataframe" code action is offered.

## Non-Admitted Surfaces:
- Snapshot determinism (was using random UUIDs).
- Persisted fixtures (was in-memory only).
- Actual wasm4pm replay.
- Independent receipt verification.
