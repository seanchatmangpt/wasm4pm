<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs_quarantine/ARCHIVE/unverified/reference/error_codes.md; source-sha256: 332d2e0df67e2145f80dbc30427b1a2f3b6060b8b7c24ca4e362781196c2c736; reason: tooling or agent control surface -->

# Reference: Error Codes

When `wpm` fails, it exits with a specific code and emits a typed error.

## Exit Codes
*   `0`: Success. Receipt generated.
*   `1`: General failure (I/O, parsing).
*   `2`: Config validation failure.
*   `3`: Algorithm failed to converge.
*   `4`: Adversarial gate rejected the run.
*   `5`: Receipt cryptographic verification failed.

## Common Typed Errors
*   `ERR_NON_DETERMINISTIC_REPLAY`: The byte-identical replay generated a different BLAKE3 hash than the original run.
*   `ERR_ADVERSARIAL_V3`: Missing runtime evidence (no OTEL span backs the output).
*   `ERR_UNSOUND_MODEL`: The generated Petri net contains deadlocks or unbounded places.
