# Falsifiers — Periodic Table of Reason

These eight conditions are the self-falsifying core of the thesis. Each one, if it fires, obligates either a corrected implementation or a retracted claim. No third option exists.

---

## F1 — BVC Gate Bypass

**Condition:** A nonconforming breed passes all claimed BVC gates.

**Status:** PARTIAL

**Infrastructure:** L0 structural validation passes via `cognition_verify` (VerifyResult findings array). L1 conformance against an OCPN model is not checked — no L1 BVC gate exists in the current pipeline.

---

## F2 — Receipt Tamper Blindness

**Condition:** A receipt verifies after input/output/trace/model/WASM tampering.

**Status:** PARTIAL

**Infrastructure:** `input_hash` and `output_hash` are present in every receipt (`.wasm4pm/receipts/latest.json`). `ocel_hash`, `model_hash`, and `wasm_hash` are absent — tampering of the event log, the declared OCPN model, or the WASM binary is undetectable by the receipt chain.

---

## F3 — Nondeterminism Under Identical Boundary

**Condition:** A breed produces nondeterministic output under identical input and runtime boundary.

**Status:** DETECTABLE

**Infrastructure:** Determinism tests exist in `@wasm4pm/testing` (parity and determinism harnesses). Same-seed, same-input runs are compared bit-exactly. This is a merge gate: nondeterminism blocks merge.

---

## F4 — L1 Trace Deviation Without Rejection

**Condition:** An L1 inference trace deviates from the declared breed OCPN while still admitted.

**Status:** UNDETECTABLE

**Infrastructure:** No OCPN L1 models exist for any breed. The cognition layer has no L1 replay path. Trace conformance against a declared process model is not computed anywhere in the current pipeline.

---

## F5 — Uncertified Breed Claims Certified Status

**Condition:** Manuscript claims certified status for a breed absent from the canonical registry.

**Status:** PARTIAL

**Infrastructure:** The breed dispatcher exists and routes by breed name. No `registry.json` with a canonical certified-breed list exists. No CI check enforces that a breed named in the manuscript is present and certified in the registry.

---

## F6 — Internal Assertion Substituting First-Principles Law

**Condition:** A theorem depends on an internal assertion where an imported first-principles law is required.

**Status:** UNDETECTABLE

**Infrastructure:** No axiom dependency tracking exists. Theorems in the manuscript are not linked to external law provenance. Internal assertions are indistinguishable from cited first-principles in the current proof structure.

---

## F7 — Benchmark Claim Not Reproducible from Proof Pack

**Condition:** A benchmark claim cannot be reproduced from the proof pack.

**Status:** UNDETECTABLE

**Infrastructure:** No `proof-pack/` directory exists in the repository. Benchmark claims in the manuscript have no associated reproducibility artifact — no seed, no dataset pin, no script, no expected output hash.

---

## F8 — Regulatory Claim Stated as Automatic Compliance

**Condition:** A legal/regulatory claim is stated as automatic compliance rather than evidentiary support.

**Status:** PARTIAL

**Infrastructure:** Chapter 10 (Fortune-5 readiness) requires review. BUSL-1.1 license terms, OTLP export capability, and semconv alignment are present as implementation facts. Whether the manuscript converts these facts into compliance assertions (rather than evidentiary support statements) has not been audited.

---

This list is the self-falsifying core of the thesis. If any condition fires, the paper must either correct the implementation or retract the claim.
