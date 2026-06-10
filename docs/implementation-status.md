# Implementation Status — PRD Gates and Workstreams

**Date:** 2026-06-10
**Auditor:** codebase inspection
**Doctrine:** Audit records decay in both directions. Verify on disk before citing this document.

---

## 1. Status Vocabulary

| Status | Meaning |
|--------|---------|
| **ADMITTED** | Evidence exists on disk, CI enforces it, and the claim survives adversarial inspection. No material gaps. |
| **PARTIAL_ALIVE** | Core implementation present and running. One or more structural gaps prevent the full claim from being made. Named gaps are listed. |
| **UNSUPPORTED** | The claim appears in prose or in a comment. No implementation artifact found on disk. |
| **UNKNOWN** | Insufficient evidence to classify. Requires targeted audit before any claim is made. |

**Forbidden vocabulary** (not used in this document): complete, done, fully proven, universal, regulatorily sufficient, unfakeable without boundary, production ready, civilizationally guaranteed.

---

## 2. Gate Status Table

| Gate | Name | Status | Evidence Present | Named Gaps |
|------|------|--------|-----------------|------------|
| G1 | Registry Gate | PARTIAL_ALIVE | `wasm4pm/src/registry.rs` dispatcher exists; 60 algorithms registered in Rust; `registry.json` and `check_registry.sh` created | No CI check yet enforces registry completeness at build time; schema validation at boundary absent |
| G2 | Theorem Gate | PARTIAL_ALIVE | Theorem files present in codebase; theorem structure exists | Not all theorems cite imported axioms by reference; oracle theorem overclaims scope beyond what axioms support |
| G3 | Receipt Gate | ADMITTED | `input_hash`, `output_hash`, `ocel_hash`, `model_hash`, `wasm_hash`, `signature`, `public_key_id`, `signature_algorithm` all emitted by `cognition_run()` (bc998553) | Production deployment requires replacing default actor with institutionally managed keypair for legal non-repudiation |
| G4 | OCEL Gate | ADMITTED | L0 + L1 spans in all 13 breeds; 13 OCPN models in `ocel/models/l1/`; `validate_ocel_alignment()` native DFA replay at fitness=1.0 for all 13 breeds (bc998553) | None |
| G5 | Defense Gate | PARTIAL_ALIVE | Defensible on breed implementations and core algorithm behavior | 5 proof vulnerabilities identified and unpatched; defense is partial, not adversarially closed |

---

## 3. Workstream Status Table

| WS | Name | Status | Evidence Present | Named Gaps |
|----|------|--------|-----------------|------------|
| A | Registry | PARTIAL_ALIVE | `registry.rs` dispatcher; 60 algorithms in Rust kernel; `registry.json` and `check_registry.sh` created | No CI enforcement at build time; no schema validation at boundary |
| B | Axioms | UNSUPPORTED | References to axioms appear in theorem files | Chapter 0 (axiom foundation document) does not exist on disk; no imported axiom set that theorems can cite |
| C | Adversary | PARTIAL_ALIVE | `adversarial-catalogue.test.ts` exists and runs; `oracle_hidden.rs` provides T_hidden corpus (19 hidden tests across all 13 breeds, cf6256a1) | Adversary classes not formally defined; catalogue is a list of cases, not a typed threat model; no boundary between adversary class and mitigation |
| D | OCEL L1 | ADMITTED | L0 + L1 spans in all 13 breeds; 13 OCPN models in `ocel/models/l1/`; native DFA replay fitness=1.0 for all 13 breeds (bc998553) | None |
| E | Receipts | ADMITTED | All receipt fields present: `input_hash`, `output_hash`, `ocel_hash`, `model_hash`, `wasm_hash`, `signature`, `public_key_id` (bc998553) | Default actor is compile-time seed; production non-repudiation requires institutionally managed keypair |
| F | Geometry | UNSUPPORTED | R8 independence claim present in documentation | No geometric grounding implementation found; claim is asserted, not derived |
| G | Category | UNSUPPORTED | Category theory terminology appears in comments and docs | No category-theoretic construction implemented; decorative use only |
| H | Speed | PARTIAL_ALIVE | Benchmarks exist and run | Queueing-theoretic grounding absent; throughput claims lack Little's Law or M/M/c derivation |
| I | Regulatory | PARTIAL_ALIVE | Regulatory language present in documentation | Language requires a fence distinguishing what the system supports from what regulatory sufficiency requires; current phrasing overstates |
| J | Proof-Pack | UNSUPPORTED | References to proof-pack in design documents | `proof-pack/` directory does not exist; no portable proof artifact can be generated or shipped |

---

## 4. Next Actions

| ID | Action | Unblocks |
|----|--------|---------|
| M1 | Generate `registry.json` from `registry.rs` at build time and add CI check that counts equal 60 | G1 → ADMITTED, WS-A → ADMITTED |
| M2 | Create `docs/axioms/chapter-0.md` with a machine-checkable axiom set; update theorem files to cite axioms by ID | G2 → ADMITTED, WS-B → ADMITTED |
| M3 | ~~Add `ocel_hash`, `model_hash`, `wasm_hash`, and `signature` to receipt schema~~ DONE (bc998553) | G3 → ADMITTED ✓, WS-E → ADMITTED ✓ |
| M4 | ~~Implement L1 breed inference trace spans; derive OCEL log from spans; add replay test~~ DONE (cf6256a1 + bc998553) | G4 → ADMITTED ✓, WS-D → ADMITTED ✓ |
| M5 | Document the 5 proof vulnerabilities as named issues; implement patches or explicit mitigations with evidence | G5 → ADMITTED |
| M6 | Define adversary class taxonomy (type, capability, entry point, mitigation); bind `adversarial-catalogue.test.ts` entries to classes | WS-C → ADMITTED |
| M7 | Add queueing-theoretic derivation (Little's Law or M/M/c) to benchmark output or a companion doc | WS-H → ADMITTED |
| M8 | Create `proof-pack/` directory with generation script; output must include registry snapshot, receipt schema, theorem citations, and OCEL log sample | WS-J → ADMITTED |
