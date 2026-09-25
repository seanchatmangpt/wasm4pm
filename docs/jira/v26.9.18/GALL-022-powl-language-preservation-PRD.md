# PRD v26.9.18 — GALL-022: POWL Language Preservation

**Status:** FINAL_SPEC — closed for v26.9.24  
**Implementation standing:** OPEN in PR #627  
**Release:** v26.9.18  
**Repository:** `seanchatmangpt/wasm4pm`  
**Owner:** wasm4pm  
**Dependencies:** GALL-016 canonical POWL  
**Authority ceiling:** COMPILE/COMPUTE only

## Product outcome
wasm4pm compiles admitted POWL/POWL-v2 into portable executable process machinery while preserving the semantic relations that define sequence, partial order, choice, loop and hierarchy.

## Problem
Compiling POWL to WASM can accidentally flatten hierarchy, serialize one arbitrary topological order, or lose choice/loop semantics. Byte-valid WASM is insufficient if the process language changes.

## Functional requirements
1. Consume canonical GALL-016 POWL subject and preserve its exact digest/provenance.
2. Define explicit lowering for each supported POWL construct.
3. Represent partial order without collapsing to a single total order.
4. Preserve hierarchical parent/child boundaries and choice/loop conditions.
5. Provide a semantic probe/trace-set or equivalent bounded witness for language preservation.
6. Typed-refuse unsupported POWL constructs; never approximate silently.
7. Bind compiler/lowering version and WASM module digest to receipt.

## Acceptance criteria
1. Sequential/parallel/choice/loop/hierarchical GALL-015 fixtures compile and pass semantic probes.
2. Parallel fixture permits required interleavings rather than one hard-coded order.
3. Hierarchy fixture retains nested boundary identity.
4. Unsupported construct returns UNSUPPORTED.
5. Mutation that flattens partial order/hierarchy fails preservation court.
6. Recompilation from same POWL/compiler subject yields same module identity where deterministic build assumptions hold.

## Evidence product
Emit a content-addressed receipt binding exact source/query/process/module/runtime identities, positive witness, attempted falsifiers, outputs and evidence ceiling. Portability means semantic identity, not merely successful execution.

## Definition of done
wasm4pm compiles admitted POWL/POWL-v2 into portable executable process machinery while preserving the semantic relations that define sequence, partial order, choice, loop and hierarchy.
