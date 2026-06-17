# plan.md — Cognition Breeds Examples & E2E Verification Plan

## Mission
Populate examples for all 52 cognition breeds under `examples/cognition/`, construct an E2E cryptographically bound receipt chain, and verify replay determinism and receipt authenticity.

## Architecture
- `examples/cognition/<breed>/`: Contains `intent.json`, `run.sh`, `result.json`, and `last-output.log`.
- `examples/cognition/chains/factory-agent/`: Chained execution of all 52 breeds sequentially.
- Verification script: Verifies all receipts using `wpm truex` (or equivalent), asserts bit-exact replay determinism, and checks for fake receipt hashes.

## Swarm Topology (10 Subagents)
We spawn exactly 10 subagents to parallelize the breed example population. The 52 breeds are partitioned as follows:

- **Subagent 1**: `worker_breed_group_1`
  - Breeds (5): `eliza`, `cbr`, `dendral`, `strips`, `prolog`
- **Subagent 2**: `worker_breed_group_2`
  - Breeds (5): `mycin`, `gps`, `soar`, `hearsay`, `autoinstinct_neurosis`
- **Subagent 3**: `worker_breed_group_3`
  - Breeds (5): `autoinstinct_semantics`, `autoinstinct_vision`, `autoinstinct_learning`, `ltl_monitor`, `allen_temporal`
- **Subagent 4**: `worker_breed_group_4`
  - Breeds (5): `fuzzy_logic`, `bayesian_network`, `csp_ac3`, `default_logic`, `htn_planning`
- **Subagent 5**: `worker_breed_group_5`
  - Breeds (5): `dempster_shafer`, `frames_inheritance`, `ebl`, `asp`, `description_logic`
- **Subagent 6**: `worker_breed_group_6`
  - Breeds (5): `abductive_lp`, `abductive_ibe`, `partial_order_plan`, `event_calculus`, `mdp`
- **Subagent 7**: `worker_breed_group_7`
  - Breeds (5): `version_space`, `belief_merging`, `qualitative_reason`, `script_sam`, `clp`
- **Subagent 8**: `worker_breed_group_8`
  - Breeds (5): `situation_calculus`, `circumscription`, `analogy_sme`, `act_r`, `problog`
- **Subagent 9**: `worker_breed_group_9`
  - Breeds (6): `sat_cdcl`, `episodic_memory`, `rl_symbolic`, `ctl_check`, `ilp`, `naive_physics`
- **Subagent 10**: `worker_breed_group_10`
  - Breeds (6): `tableaux`, `construction_grammar`, `markov_logic`, `pomdp`, `contingent_plan`, `meta_reasoning`

## Milestones

### Milestone 1: Swarm Initialization & Validation
- Validate build and CLI functionality of the workspace.
- Initialize breed configuration mapping using paper fixtures.
- Dispatch exactly 10 subagents with clear breed assignments.

### Milestone 2: Breed Examples Generation (Parallel)
- Monitor the 10 subagents as they generate:
  - `intent.json` (extracted from paper fixtures)
  - `run.sh` (standard runner executing `wpm cognition run`)
  - `result.json` (raw JSON output from running)
  - `last-output.log` (stdout/stderr log of the run)
- Track completion of all 52 breed directories.

### Milestone 3: E2E Cryptographic Chain Building
- Build/extend the sequential chain `examples/cognition/chains/factory-agent/` (or similar).
- Chain the output state/facts of the preceding breed into the input goals/facts of the succeeding breed for all 52 breeds.
- Verify each stage produces a valid BLAKE3 receipt.

### Milestone 4: Cryptographic Verification & Replay Determinism
- Write a master verification runner script that:
  - Runs all 52 examples and the chain.
  - Verifies that execution results contain valid, non-empty BLAKE3 output hashes and signatures.
  - Asserts bit-exact output equality (replay determinism) by running each twice with identical inputs.
  - Verifies that all receipt hashes link correctly.
  - Ensures no fake/stubbed receipt hashes.

### Milestone 5: Final Auditing & Checkpoint Verification
- Run a Forensic Auditor on the codebase to verify integrity.
- Check that all verifications pass and final receipts are committed.
