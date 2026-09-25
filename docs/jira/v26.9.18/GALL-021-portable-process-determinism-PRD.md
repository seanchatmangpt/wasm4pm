# PRD v26.9.18 — GALL-021: Portable Process Determinism

**Status:** FINAL_SPEC — closed for v26.9.24  
**Implementation standing:** OPEN in PR #627  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-015 corpus, GALL-020 typed process compute  
**Authority ceiling:** COMPUTE only; no external DO

## Product outcome
The same admitted process computation and exact WASM artifact produce the same canonical semantic result across qualified hosts/runtimes, with nondeterministic host inputs either fenced or explicitly bound.

## Problem
A process algorithm compiled to WASM is not portable evidence if host/runtime differences, clocks, random sources or unordered maps change semantic results.

## Functional requirements
1. Content-address process input, algorithm/module bytes, runtime/host identity and parameters.
2. Define canonical result serialization independent of map/event input iteration order.
3. Fence clock, randomness, filesystem/network and host imports unless explicitly part of the subject.
4. Run at least two supported WASM execution environments where available and compare canonical results.
5. Separate semantic-result identity from performance measurements.
6. Typed-refuse unsupported host capabilities instead of silently changing algorithm behavior.
7. Emit portable process execution receipt.

## Acceptance criteria
1. Same module/input produces identical canonical semantic result across qualified runtimes.
2. Input order permutation preserves result where semantics are order-insensitive.
3. Unbound time/random import is rejected by deterministic court.
4. Changing module bytes or runtime-significant parameter changes subject identity.
5. Performance can differ without changing semantic result digest.
6. No external consequence capability exists in the qualification module.

## Evidence product
Emit a content-addressed receipt binding exact source/query/process/module/runtime identities, positive witness, attempted falsifiers, outputs and evidence ceiling. Portability means semantic identity, not merely successful execution.

## Definition of done
The same admitted process computation and exact WASM artifact produce the same canonical semantic result across qualified hosts/runtimes, with nondeterministic host inputs either fenced or explicitly bound.
