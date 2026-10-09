<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: artifacts/aloop-dogfood-001/lane-10/README.md; source-sha256: 6f4b085ed6ca4cc753f30352efaffd30a322d65210197c588fdcc86e676b4b8b; reason: path-local authority or entrypoint -->

# Lane-10 replay oracle

ALOOP replay oracle for episode `ALOOP-ZCODE-DOGFOOD-001` (source:
`crates/wasm4pm-testing/tests/aloop_replay_oracle.rs`; verdict:
`verdict.json` in this directory).

Refuses malformed manifests with typed `REFUSED:ALOOP_*` codes — a file the
scan cannot judge is never silently dropped and never vacuously conformant;
every skip carries its code:

- `REFUSED:ALOOP_MANIFEST_NOT_JSON`
- `REFUSED:ALOOP_MANIFEST_NDJSON_UNPARSED`
- `REFUSED:ALOOP_MANIFEST_ORACLE_SELF_VERDICT`
- `REFUSED:ALOOP_MANIFEST_NO_EXECUTED_CLAIMS`
- `REFUSED:ALOOP_MANIFEST_UNREADABLE`
- `REFUSED:ALOOP_MANIFEST_DIGEST_MISMATCH`

Era (post-epoch) timestamps must be monotone non-decreasing in sequence
order; a permuted or backdated era timestamp is evidence tampering
(`REFUSED:ALOOP_TS_NOT_MONOTONIC`, witnessed by mutant M12).

The scan verdict is computed only over JUDGED evidence (event-log corpora +
record manifests): a zero-judged-object scan is `UNKNOWN`, never vacuously
conformant.
