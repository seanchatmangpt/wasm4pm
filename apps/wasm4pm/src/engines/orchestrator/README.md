# Orchestrator proof capsule

The orchestrator converts a noun/verb DAG into a proof-carrying pipeline bundle.

Current invariants:

- `planHash` is derived from the canonical semantic plan; wall time does not determine identity.
- every step writes a pending receipt before dispatch;
- every completed dispatch requires an outcome receipt;
- each chain edge binds the plan, step identity, resolved arguments, previous edge, and result or error;
- checkpoints are written atomically after every transition;
- `pipeline resume` verifies the latest checkpoint and reruns only the failed or missing suffix;
- `ALIVE` requires every planned step to complete and the terminal bundle to verify.

The full audit and prioritization rationale is in
[`docs/explanation/innovation-80-20-proof-pipeline.md`](../../../../../docs/explanation/innovation-80-20-proof-pipeline.md).
