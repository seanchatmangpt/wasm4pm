# Plan — Populate Cognition Examples

## Architecture
- CLI entrypoint: `wpm cognition run`
- Targets: 52 cognition breeds (13 classic/autoinstinct, 39 new periodic table breeds)
- Examples layout: `examples/cognition/<breed>/`
  - `intent.json`
  - `run.sh`
  - `result.json`
  - `last-output.log`
- Master chain: `examples/cognition/chains/factory-agent/` linking all 52 breeds sequentially.
- Verification runner: Asserting replay determinism, non-empty BLAKE3 receipts, and valid signatures.

## Subagent Allocations
- **Worker 1**: `mycin`, `hearsay`, `soar`, `cbr`, `prolog`, `strips`
- **Worker 2**: `gps`, `dendral`, `eliza`, `autoinstinct_learning`, `autoinstinct_neurosis`, `autoinstinct_semantics`
- **Worker 3**: `autoinstinct_vision`, `ltl_monitor`, `allen_temporal`, `fuzzy_logic`, `bayesian_network`, `csp_ac3`
- **Worker 4**: `default_logic`, `htn_planning`, `dempster_shafer`, `frames_inheritance`, `ebl`, `asp`
- **Worker 5**: `description_logic`, `abductive_lp`, `abductive_ibe`, `partial_order_plan`, `event_calculus`, `mdp`
- **Worker 6**: `version_space`, `belief_merging`, `qualitative_reason`, `script_sam`, `clp`, `situation_calculus`
- **Worker 7**: `circumscription`, `analogy_sme`, `act_r`, `problog`, `sat_cdcl`, `episodic_memory`
- **Worker 8**: `rl_symbolic`, `ctl_check`, `ilp`, `naive_physics`, `tableaux`
- **Worker 9**: `construction_grammar`, `markov_logic`, `pomdp`, `contingent_plan`, `meta_reasoning`
- **Worker 10**: Master Chain & Master Verification Runner

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Setup & Planning | Decompose task and initialize plans | None | DONE |
| 2 | Team Dispatch | Spawn exactly 10 subagents and report to parent | 1 | PLANNED |
| 3 | Verification & Integration | Run master verification runner and check receipts | 2 | PLANNED |
| 4 | Final Report | Write final handoff and close | 3 | PLANNED |
