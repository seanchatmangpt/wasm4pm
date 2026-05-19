# Cognition Error Catalog

Every error has: code, severity, cause, remediation, verification.

## CLI Exit Codes

From `apps/wasm4pm/src/exit-codes.ts`:

| Exit | Name | Meaning |
|------|------|---------|
| 0 | success | All gates passed, receipt emitted |
| 1 | config_error | `wasm4pm.toml` / `wasm4pm.json` missing or invalid |
| 2 | source_error | `--input` file unreadable, missing required arg |
| 3 | execution_error | WASM call threw, breed failed, post-condition failed |
| 4 | partial_failure | Some adversarial findings (warnings, errors) — receipt still emitted |
| 5 | system_error | I/O, permissions, file system |
| 6 | conformance_fail | Fitness below threshold |

## Adversarial Detector Findings

Each Finding has `code`, `severity`, `message`, `evidence`. Severity gates:

- **Info** — never fails CI.
- **Warning** — exits 4 (partial_failure); merges allowed.
- **Error** — exits 3; blocks `wpm cognition verify`.
- **Fatal** — exits 3; blocks `wpm cognition run` and `verify`.

### `STUB_GATE_PASS` (Fatal)

**Cause.** A gate was marked `passed: true` but `evidence_count(gate_id) == 0`.
The detector counts only artifacts whose `digest` field is non-empty —
caller-supplied padding strings (e.g. `evidence_items: ["fake1", "fake2"]`)
do NOT satisfy the count.

**Remediation.**
1. Verify the gate definition emits `evidence.digest` span attributes for each artifact.
2. Run `wpm cognition inspect --artifact-id <id>` to confirm artifacts have digests.
3. If your gate is purely heuristic, ensure `runtime_proof_artifacts(gate_id)` returns a non-empty `Vec<Artifact>` whose elements have BLAKE3-hex digests.

**Verification.** Re-run, observe `STUB_GATE_PASS` no longer in findings.

---

### `HUMAN_OUTPUT_USED_AS_AUTHORITY` (Error)

**Cause.** `AuthorityClassifier::classify(slot_text)` returned `HumanProse`,
`LlmProjection`, or `Mixed`. The classifier checks for first-person hedging
(`"I think"`, `"in my opinion"`), LLM stylometric markers (`"as an AI"`,
`"certainly!"`), and machine-evidence patterns (BLAKE3 hex, span IDs).

**Critical:** mixed text containing both human prose AND machine evidence is
classified as `Mixed`, NOT `MachineEvidence`. An attacker who appends a hex
digest to "I think alice should be admitted" cannot launder authority.

**Remediation.**
1. Replace human prose authority text with structured machine evidence: BLAKE3 hex, OTEL `trace_id`/`span_id`, `sha256:` prefixed hashes.
2. Avoid first-person hedging in any slot read by the AuthorityClassifier.
3. If a human signature is required, store it OUTSIDE the authority slot and reference its receipt by hash.

**Verification.** `wpm cognition verify --receipt-id <id>` reports zero `HUMAN_OUTPUT_USED_AS_AUTHORITY` findings.

---

### `MISSING_RUNTIME_EVIDENCE` (Fatal)

**Cause.** A gate `gate_passed(gate_id) == true` but `runtime_proof_artifacts(gate_id).is_empty()`.
The detector reads from the actual OTEL trace / filesystem, not from a caller flag.
Setting `has_runtime_proof: true` in JSON does NOT bypass this — the artifact
list is computed from observed evidence with digests.

**Remediation.**
1. Emit OTEL spans tagged with `evidence.digest = <BLAKE3-hex>` for every artifact your gate produces.
2. If using `FilesystemEvidenceSource`, ensure the result file at `.wasm4pm/results/<id>.json` exists and contains parseable artifact records.

**Verification.** Inspect the receipt's proof DAG — at least one `ProofKind::Fact` node must reference an `evidence.digest` span attribute.

---

### `CENTRAL_EVENT_FIREHOSE_REINTRODUCED` (Fatal)

**Cause.** The detector observed either:
- A span with `messaging.system` ∈ allowlist `{"nats","kafka","rabbitmq","redis","sqs","sns"}` AND `messaging.operation` = publish/receive over a publish-rate threshold, OR
- A span with `bus.kind = "central"` regardless of `messaging.system`.

**Remediation.**
1. Refactor away centralized event aggregation; use peer-to-peer or deltas-by-epoch.
2. If the central bus is intentional and audited, suppress the detector for that gate via a custom `EvidenceSource` that returns `central_bus_present() == false` ONLY after independently verifying the bus is local-first.

**Verification.** `wpm cognition adversarial --severity fatal --format json` lists the detector status.

---

### `AGENT_SELF_CERTIFIES` (Fatal)

**Cause.** One of:
- `executor_pubkey() == verifier_pubkey()` (byte-equal ed25519 keys), OR
- `signing_time_skew() < 5s` between executor and verifier signatures, OR
- The verifier's attestation chain descends from the executor (per `attestation_descends()`).

The detector cannot be bypassed by string spoofing because identity is
ed25519 public keys, not labels.

**Remediation.**
1. Issue distinct ed25519 keys to executor and verifier from independent root authorities.
2. Sequence verifier signing at least 5 seconds after executor signing, or run them in different sessions.
3. If using BLAKE3-keyed-MAC fallback, ensure executor and verifier hold cryptographically independent keys.

**Verification.** `wpm cognition receipt --receipt-id <id> --format json | jq .payload.receipt.executor_pubkey,.payload.receipt.verifier_pubkey` shows distinct hex.

---

### `BENCHMARK_EXPECTATION_MISSING` (Warning)

**Cause.** `benchmark_verdict(target).is_none()`. Either no benchmark file
exists for the target, or its `outcome` field cannot be parsed into
`Verdict { Pass | Fail | Skip }`.

**Remediation.**
1. Write a benchmark record to `.wasm4pm/results/<target>.json` with `outcome: "pass" | "fail" | "skip"`.
2. Reject any other string in `outcome` — the parser is strict by design.

**Verification.** Lower-severity warning; CI continues with exit 4.

---

### `REPAIR_WEAKENS_GATE` (Error)

**Cause.** Threshold history `[h_0, h_1, ..., h_n]` for a gate shows
`current = h_n < max(h_0..h_{n-1})`. A repair lowered the threshold below
its prior maximum — non-adjacent drops are still caught.

**Remediation.**
1. If the threshold relaxation is intentional and approved, document the rationale and bump the policy version (so the comparison is reset).
2. If unintentional, restore the previous max threshold.

**Verification.** `wpm cognition verify` after restoration.

---

### `REPLAY_BROKEN` (Fatal)

**Cause.** Either:
- `chain.verify_chain() == false` — local link hashes don't match, OR
- `external_chain_root() != chain.merkle_root_bytes()` — the chain verifies
  locally but diverges from the external trust anchor (Sigstore-Rekor-style
  transparency log).

**Remediation.**
1. Run `wpm cognition replay --receipt-id <id>` to re-derive the chain and compare hashes byte-by-byte.
2. If the local chain is corrupt, restore from the external anchor and re-execute.
3. If the external anchor is missing, the receipt cannot be admitted in a non-self-referential mode.

**Verification.** `wpm cognition replay --strict` exits 0 only when all hashes match.

## Prolog8 Rejection Codes

From `prolog8::admission::RejectionCode`:

| Code | Meaning |
|------|---------|
| `ArityCapExceeded` | Atom or rule head exceeds 8-argument cap. |
| `RuleBodyCapExceeded` | Rule body exceeds 8-atom cap. |
| `VariableCapExceeded` | Rule declares more than 8 variables. |
| `BindingMaskOutOfRange` | `binding_mask` references positions ≥ `arity`. |
| `PaddingNotSentinel` | Padding slot ≥ `arity` is not the sentinel TermId(0). |
| `BodyMaskMismatch` | `body_mask` ≠ `(1 << body_len) - 1`. |
| `NegationMaskOutOfRange` | `negation_mask` references positions ≥ `body_len`. |
| `BuiltinMaskOutOfRange` | `builtin_mask` references positions ≥ `body_len`. |
| `ProofMaskOutOfRange` | `proof_mask` references positions ≥ `body_len`. |
| `FeatureBitNotAdmitted` | `feature_mask` set bit not in admitted feature set. |
| `NegationRequiresFeature` | `negation_mask != 0` without `FeatureBit::StratifiedNegation`. |
| `PredicateNotInCatalog` | Predicate id not registered in catalog. |
| `ArityMismatch` | Atom arity ≠ catalog metadata. |
| `UninternedTerm` | Bound argument is the sentinel TermId(0). |
| `StringQueryNotAdmitted` | Kernel API given a string query. |
| `RuntimeParseRejected` | Kernel attempted to parse source text. |
| `UnstratifiedNegation` | Negation cycle detected. |
| `UnboundedRecursion` | Recursion not bounded or declared. |
| `CutNotAdmitted` | `!` (cut) is not admitted in MVP. |
| `DynamicMutationNotAdmitted` | `assert/retract` are not admitted. |
| `ForeignContractMissing` | Foreign predicate has no replay contract. |
| `NondeterministicForeignCall` | Foreign predicate is non-deterministic. |
| `SideEffectInKernel` | Side-effect detected inside the kernel boundary. |
| `ReplayContractMissing` | Replay contract is missing. |

For each rejection, run `prolog8 doctor` to receive a structured decomposition hint.

## Replay Status Codes

From `prolog8::replay::ReplayStatus`:

| Status | Meaning |
|--------|---------|
| `Verified` | All seven roots match (catalog, rule, fact, input, proof, output, decision). |
| `Mismatch` | At least one root differs. |
| `MissingArtifact` | A required artifact (catalog/rule/fact block) is missing. |
| `VersionIncompatible` | Engine version reported by the receipt is incompatible. |
| `ReceiptInvalid` | The receipt's own integrity hash does not validate. |

## Cross-Reference

- Adversarial gates: `crates/wasm4pm-cognition/src/autosystems/adversarial/*.rs`
- AuthorityClassifier: `crates/wasm4pm-cognition/src/authority.rs`
- EvidenceSource trait: `crates/wasm4pm-cognition/src/evidence.rs`
- Prolog8 admission: `crates/prolog8/src/admission.rs`
- Replay: `crates/prolog8/src/replay.rs`
