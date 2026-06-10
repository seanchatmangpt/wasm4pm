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
