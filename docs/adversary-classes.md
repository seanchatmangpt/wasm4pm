# Adversary Classes — Oracle Adequacy Theorem

**Document:** Oracle Adequacy Theorem — Adversary Class Definitions  
**Version:** 2026-06-09  
**Scope:** wasm4pm test oracle hierarchy; feeds the oracle adequacy proof obligation in TESTING.md

---

## Purpose

The oracle adequacy theorem asks: *For a given test suite T, what class of impostor implementation can pass all tests in T while being semantically wrong?*

Adversary classes A0–A7 enumerate the threat surface. Each class is a family of implementations that may satisfy surface-level assertions while violating correctness in a specific way. The theorem holds only if every class is DEFEATED — meaning no member of that class can pass the full suite.

---

## A0 — Fixed-Output Mock

**Description:**  
Returns a constant, pre-baked output regardless of input. The implementation ignores all arguments and emits the same artifact every time.

**Example:**  
`discover_alpha_miner(handle, key) → always returns the same Petri net JSON`

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | DEFEATS | Diverse input fixtures produce structurally different expected outputs; A0 fails on mismatched structure |
| T_generated | DEFEATS | Randomized inputs break any fixed-output assumption |
| T_hidden | DEFEATS | Hidden corpus inputs were not known at mock construction time |
| T_negative | DEFEATS | Negative inputs must produce error/empty output, not the fixed positive output |
| T_replay | DEFEATS | Replaying a different trace yields a different conformance value |
| T_trace | PARTIAL | Trace assertions may not check output variance |
| T_receipt | PARTIAL | output_hash would be identical for all runs, detectable if inputs differ |

**Current detection status:** DETECTABLE  
**What is missing:** Receipt-level variance assertion (`assert output_hash differs across distinct inputs`) is not enforced uniformly; add an anti-idempotency receipt check.

---

## A1 — Finite Lookup Table Over Known Tests

**Description:**  
Memorizes published input/output pairs from the visible test corpus. For any known input, returns the memorized output. For unknown inputs, behavior is undefined (may crash, return null, or return a plausible-looking artifact).

**Example:**  
An implementation that hard-codes the 47 inputs in `bench_data/` and their expected outputs.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | MISS | Lookup table was constructed from T_static fixtures |
| T_generated | PARTIAL | Random inputs not in the table — but only if generators are not seeded from the published test suite |
| T_hidden | DEFEATS | Hidden corpus was not available at table construction time |
| T_negative | PARTIAL | Negative paths not in the table trigger undefined behavior |
| T_replay | PARTIAL | Replay inputs may coincide with table entries |
| T_trace | MISS | Trace assertions apply to known runs |
| T_receipt | PARTIAL | Receipt hashes for known inputs match; unknown inputs would produce wrong hashes |

**Current detection status:** PARTIAL  
**What is missing:** Hidden test corpus (`T_hidden`) is absent. The oracle adequacy theorem cannot close A1 without it. Required: a sealed, non-public fixture set exercised only at gate time.

---

## A2 — Memoized Dictionary Without Hidden-Test Access

**Description:**  
Functionally identical to A1, but constructed lazily: the adversary runs the canonical implementation once on every reachable input, stores the result, and serves from cache thereafter. Distinguished from A1 only by construction method.

**Example:**  
An adversary that front-runs CI on the published test suite, records all (input, output) pairs, and substitutes the real implementation with a dictionary lookup.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | MISS | All known inputs are cached |
| T_generated | PARTIAL | Depends on whether the generator seed space was exhausted |
| T_hidden | DEFEATS | Hidden inputs were not front-run |
| T_negative | PARTIAL | Same gap as A1 |
| T_replay | PARTIAL | Cached replays match; new traces do not |
| T_trace | MISS | Trace-level assertions apply to known runs |
| T_receipt | PARTIAL | Receipt hashes would match cached runs; diverge on novel inputs |

**Current detection status:** PARTIAL  
**What is missing:** Same as A1 — hidden corpus. Additionally: a proof that the generator seed space is not exhausted by the visible suite (i.e., generators must sample from a space larger than what A2 can pre-cache).

---

## A3 — Algorithmic Simplification With Bounded Description Length

**Description:**  
Replaces a complex algorithm with a simpler one that happens to agree on all visible tests. The simplification is not a lookup table — it is a genuinely shorter program — but it is incorrect for inputs outside the test distribution.

**Example:**  
Replacing `discover_heuristic_miner` (complexity: O(n^2 dependency graph)) with a trivial direct-succession counter that produces the same Petri net on the 47 known logs but fails on logs with long-distance dependencies.

**Formal link:** Kolmogorov complexity K(adversary) << K(correct implementation). If K can be bounded, the adversary is detectable by a minimum description length (MDL) test.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | PARTIAL | Structural assertions (e.g., arc count, fitness threshold) catch some simplifications |
| T_generated | PARTIAL | Randomized inputs exercise edge cases the simplification fails on |
| T_hidden | PARTIAL | Hidden corpus may not cover the full long-distance dependency space |
| T_negative | PARTIAL | Negative inputs may expose the simplification's failure modes |
| T_replay | PARTIAL | Conformance replays may not distinguish the simplified model |
| T_trace | PARTIAL | Structural trace assertions help if they check algorithm-specific invariants |
| T_receipt | MISS | Receipt hashes do not encode algorithmic complexity |

**Current detection status:** PARTIAL  
**What is missing:** Kolmogorov/MDL test not implemented. Required: a complexity oracle or at minimum a per-algorithm structural invariant checklist that is only satisfiable by the correct algorithm class (e.g., "heuristic miner output must contain at least one AND-split for logs with parallel activities").

---

## A4 — Conforming Wrapper With Nonconforming Internal Inference

**Description:**  
The most dangerous class. The output is structurally correct, passes all receipt checks, and produces conformance scores above threshold. However, the internal inference path does not follow the declared manufacturing pipeline. The adversary implements a different algorithm that happens to produce conforming-looking artifacts on the test distribution.

**Example:**  
An adversary that replaces `conformance_token_replay` with `conformance_alignments` (a different algorithm) and obtains fitness scores that pass the >0.85 threshold on all known logs — but diverges on adversarial logs.

**Why it is the most dangerous:** The artifact is not forged. The receipt is honest. The process output looks correct. Only a model-vs-log comparison at L1 (object-centric Petri net replay) would reveal the substitution.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | MISS | Output is structurally correct |
| T_generated | MISS | Output conforms on generated inputs |
| T_hidden | PARTIAL | May diverge on adversarial hidden inputs, but not guaranteed |
| T_negative | PARTIAL | Negative paths may expose divergence if negative corpus is adversarially constructed |
| T_replay | PARTIAL | Token replay may agree with alignment-based adversary on non-degenerate nets |
| T_trace | MISS | Trace is structurally sound |
| T_receipt | MISS | Receipt hashes are honest |

**Current detection status:** UNDETECTABLE  
**What is missing:** L1 conformance checking is not implemented. Required:
1. Object-centric Petri net (OCPN) models for each algorithm's declared manufacturing pipeline.
2. OTel trace → OCEL event log derivation (Chicago TDD law, step 1).
3. Model-vs-log comparison via pm4py (Chicago TDD law, step 2).
4. Fitness/precision gates on the internal execution path, not just the output artifact.

This is the primary open obligation of the oracle adequacy theorem.

---

## A5 — Receipt-Forging Implementation

**Description:**  
Produces correct-looking output but forges receipt fields. Specifically: the adversary computes `input_hash` and `output_hash` from scratch using arbitrary data, not from the actual BLAKE3 hash of the true input and output. The receipt chain appears valid but does not bind to the real computation.

**Example:**  
An adversary that computes `output_hash = BLAKE3("constant")` and returns a plausible artifact, or that reuses a previously seen `(input_hash, output_hash)` pair for a different input.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | MISS | Output looks correct |
| T_generated | MISS | Output looks correct |
| T_hidden | PARTIAL | Hash mismatch may appear if the adversary cannot forge a novel hash for a hidden input |
| T_negative | PARTIAL | Negative inputs may produce a receipt hash that does not correspond to the negative output |
| T_replay | PARTIAL | Replay checks output_hash against re-derived hash; forged hash would fail |
| T_trace | MISS | Trace does not verify receipt |
| T_receipt | PARTIAL | input_hash + output_hash exist and are checked; but ocel_hash and wasm_hash are missing |

**Current detection status:** PARTIAL  
**What is missing:**
- `ocel_hash`: a BLAKE3 hash of the OCEL event log derived from the OTel trace. An adversary cannot forge this without executing the real pipeline.
- `wasm_hash`: a hash of the WASM binary at execution time. Binds the receipt to a specific compiled artifact, not just input/output.
- Cross-run receipt chain linkage: the chain must be verified monotonically — a forged receipt cannot be inserted without breaking the chain.

---

## A6 — Nondeterministic Implementation

**Description:**  
An implementation that produces different outputs on identical inputs across runs. May be caused by unseeded RNG, HashMap iteration order, thread scheduling, or timestamp-dependent branching.

**Example:**  
`discover_alpha_miner` that produces a different arc ordering on each run due to `HashMap` iteration without sorting.

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | PARTIAL | Single-run static tests do not catch nondeterminism |
| T_generated | PARTIAL | Single-run generated tests do not catch nondeterminism |
| T_hidden | PARTIAL | Not specifically targeted at nondeterminism |
| T_negative | MISS | Negative tests check error paths, not determinism |
| T_replay | DEFEATS | Replay re-executes and compares; nondeterminism produces divergence |
| T_trace | PARTIAL | Trace assertions check structure, not bit-exact reproducibility |
| T_receipt | DEFEATS | output_hash must be bit-exact across runs; nondeterminism produces different hashes |

**Current detection status:** DETECTABLE  
**What is missing:** Determinism tests exist (`@wasm4pm/testing` parity harness). Merge gate enforcement is documented. However, the parity harness must be run on every algorithm with at least 3 independent re-executions (not just 2) to bound probabilistic nondeterminism.

---

## A7 — Process-Conforming but Semantically Invalid Breed

**Description:**  
An implementation that satisfies all structural and receipt-level checks but produces a breed output that is semantically wrong for the declared breed type. The artifact is syntactically valid, the receipt is honest, the pipeline executed, but the semantic content does not correspond to the breed's declared contract.

**Example:**  
A `classification` breed that returns a syntactically valid `ClassificationOutput` but derives its labels from a random assignment that happens to have 80% accuracy on the test set — satisfying the accuracy threshold without implementing any real classifier.

**Why it is dangerous:** It passes all current tests because no test validates the semantic relationship between input features and output labels (i.e., that the classifier learned the correct decision boundary, not a spurious correlation).

**Test types that defeat it:**

| Test Type | Verdict | Mechanism |
|-----------|---------|-----------|
| T_static | MISS | Accuracy threshold is met |
| T_generated | MISS | Accuracy threshold is met on generated inputs |
| T_hidden | PARTIAL | Out-of-distribution inputs may expose the spurious correlation |
| T_negative | PARTIAL | Adversarially constructed negative inputs may expose semantic invalidity |
| T_replay | MISS | Replay checks conformance, not semantic validity |
| T_trace | MISS | Trace is structurally sound |
| T_receipt | MISS | Receipt is honest |

**Current detection status:** UNDETECTABLE  
**What is missing:**
- OCPN L1 models do not exist yet. Without them, there is no formal specification of what a breed is *supposed to compute* — only what it *is allowed to output*.
- Semantic invariants per breed type (e.g., "classification must partition the input space into monotonically ordered decision regions for ordinal labels").
- Adversarial semantic probes: inputs specifically designed to distinguish a semantically valid model from a spurious one.

---

## Survival Matrix

Rows = adversary class. Columns = test type. Cell = whether the test type DEFEATS the adversary, provides PARTIAL protection, or MISSES entirely.

| Adversary | T_static | T_generated | T_hidden | T_negative | T_replay | T_trace | T_receipt | **Overall** |
|-----------|----------|-------------|----------|------------|----------|---------|-----------|-------------|
| **A0** Fixed-output mock | DEFEATS | DEFEATS | DEFEATS | DEFEATS | DEFEATS | PARTIAL | PARTIAL | **DETECTABLE** |
| **A1** Finite lookup table | MISS | PARTIAL | DEFEATS | PARTIAL | PARTIAL | MISS | PARTIAL | **PARTIAL** |
| **A2** Memoized dictionary | MISS | PARTIAL | DEFEATS | PARTIAL | PARTIAL | MISS | PARTIAL | **PARTIAL** |
| **A3** Algorithmic simplification | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | MISS | **PARTIAL** |
| **A4** Conforming wrapper / wrong inference | MISS | MISS | PARTIAL | PARTIAL | PARTIAL | MISS | MISS | **UNDETECTABLE** |
| **A5** Receipt-forging | MISS | MISS | PARTIAL | PARTIAL | PARTIAL | MISS | PARTIAL | **PARTIAL** |
| **A6** Nondeterministic | PARTIAL | PARTIAL | PARTIAL | MISS | DEFEATS | PARTIAL | DEFEATS | **DETECTABLE** |
| **A7** Semantically invalid breed | MISS | MISS | PARTIAL | PARTIAL | MISS | MISS | MISS | **UNDETECTABLE** |

---

## Oracle Adequacy Gap Summary

The theorem **does not hold** for A4 and A7. The following work items are required to close the gap:

| Priority | Gap | Required Artifact |
|----------|-----|-------------------|
| P0 | A4: L1 conformance not implemented | OCPN models per algorithm + OTel→OCEL derivation + pm4py model-vs-log gate |
| P0 | A7: No semantic breed invariants | Per-breed semantic invariant specifications + adversarial semantic probes |
| P1 | A1/A2: Hidden corpus absent | Sealed fixture set, not derivable from published test suite |
| P1 | A5: ocel_hash and wasm_hash missing | Extend receipt schema; add to BLAKE3 chain |
| P2 | A3: No MDL/Kolmogorov test | Per-algorithm structural invariant checklist (algorithm-class-specific) |

Until P0 items are resolved, the oracle adequacy theorem is open. Any implementation passing the current suite may belong to A4 or A7.

---

*This document is the adversary class register for the wasm4pm oracle adequacy theorem. Update when new test types are added or gap status changes.*
