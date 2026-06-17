# Cognition Examples

Working `wpm cognition` examples for all 52 breeds — including 39 Admitted Periodic Table breeds and 13 Classic / Autoinstinct breeds. Each example is a self-contained directory with a JSON input file (`intent.json`), a shell runner (`run.sh`), a live `result.json`, and a `last-output.log`.

## Quickstart

```bash
# Run a single breed example
bash examples/cognition/mycin/run.sh

# Run all 52 breed examples sequentially
bash examples/cognition/run-all.sh

# Run the 52-stage factory-agent chain
bash examples/cognition/chains/factory-agent/chain.sh

# Run master verification runner
bash examples/cognition/verify-all.sh
```

## The 52 Cognition Breeds

Every breed has a verified working example that exits 0, produces `status: ok`, an OCEL conformance receipt (fitness=1.0), and a BLAKE3 output hash.

### Admitted Periodic Table Breeds (39)
1. **abductive_ibe**: Abductive Inference (medical diagnosis/competing illness hypotheses)
2. **abductive_lp**: Abductive Logic Programming (explanation of grass wetness)
3. **act_r**: Cognitive Architecture (memory retrieval/declarative chunk activation)
4. **allen_temporal**: Temporal Logic (transitive relations over events)
5. **analogy_sme**: Analogical Reasoning (Structure Mapping Engine over solar system / atom)
6. **asp**: Answer Set Programming (graph coloring stable models)
7. **bayesian_network**: Uncertain Reasoning (probabilistic belief propagation / burglar alarm)
8. **belief_merging**: Knowledge Representation (integrating conflicting expert facts)
9. **circumscription**: Non-monotonic Logic (minimization of predicates/abnormalities)
10. **clp**: Constraint Logic Programming (cryptarithmetic puzzle SEND + MORE = MONEY)
11. **construction_grammar**: Cognitive Linguistics (syntactic structure construction parsing)
12. **contingent_plan**: Planning (conditional plan execution under environment uncertainty)
13. **csp_ac3**: Constraint Satisfaction (AC-3 arc consistency for map coloring)
14. **ctl_check**: Model Checking (CTL formula progression over state transitions)
15. **default_logic**: Non-monotonic Logic (Reiter default extensions for bird/penguin flying)
16. **dempster_shafer**: Uncertain Reasoning (belief intervals combination for sensor fusion)
17. **description_logic**: Description Logic (subsumption checks over family ontology)
18. **ebl**: Machine Learning (Explanation-Based Generalization of cup concept)
19. **episodic_memory**: Cognitive Memory (Jaccard-based memory recall with temporal decay)
20. **event_calculus**: Temporal Reasoning (fluent activation/termination over time)
21. **frames_inheritance**: Knowledge Representation (frame slot inheritance with overrides)
22. **fuzzy_logic**: Uncertain Reasoning (Mamdani centroid defuzzification for ventilation control)
23. **htn_planning**: Planning (Hierarchical Task Network decomposition for manufacturing)
24. **ilp**: Inductive Logic Programming (inductive hypothesis learning from positive/negative examples)
25. **ltl_monitor**: Temporal Logic (LTL safety properties monitor)
26. **markov_logic**: Probabilistic Logic (first-order logic rules with weights)
27. **mdp**: Decision Theory (Value Iteration for Markov Decision Process gridworld)
28. **meta_reasoning**: Cognitive Systems (monitoring and adjusting reasoning strategies)
29. **naive_physics**: Qualitative Reasoning (qualitative state transitions of container liquid)
30. **partial_order_plan**: Planning (least-commitment partial-order plan scheduling)
31. **pomdp**: Decision Theory (Partially Observable MDP belief updates)
32. **problog**: Probabilistic Logic (probabilistic prolog query evaluation)
33. **qualitative_reason**: Qualitative Reasoning (qualitative simulation of clock pendulum)
34. **rl_symbolic**: Reinforcement Learning (Q-learning updates over symbolic state transitions)
35. **sat_cdcl**: Boolean Satisfiability (CDCL-style conflict analysis and backjumping)
36. **script_sam**: Knowledge Representation (script-based story schema instantiation)
37. **situation_calculus**: Temporal Reasoning (first-order action representation and regression)
38. **tableaux**: Theorem Proving (semantic tableaux path expansion for propositional logic)
39. **version_space**: Machine Learning (candidate elimination algorithm over hypothesis space)

### Classic / Autoinstinct Breeds (13)
40. **cbr**: Case-Based Reasoning (Retrieve, Reuse, Revise, Retain cycle)
41. **dendral**: Constrained structure enumeration
42. **eliza**: Keystack priority pattern matching Rogerian therapist
43. **gps**: Means-ends analysis with difference reduction
44. **hearsay**: Opportunistic scheduler blackboard
45. **mycin**: Shortliffe certainty factors combining for diagnoses
46. **prolog**: Robinson SLD resolution
47. **soar**: Preference resolution and impasse subgoaling
48. **strips**: Forward planning state search
49. **autoinstinct_learning**: Bits plan heuristics
50. **autoinstinct_neurosis**: Noisy-OR affect simulation under conflict
51. **autoinstinct_semantics**: Conceptual Dependency parsing
52. **autoinstinct_vision**: Blocks-world parsing

## Breed Chains

Chains wire multiple breeds end-to-end — each breed's output becomes the next breed's input. 

*   **[factory-agent](chains/factory-agent/)**: Executes all **52 breeds** sequentially in a single cryptographic chain (`00-abductive_ibe` to `51-version_space`). Each stage's output is cryptographically bound to the next stage by injecting the `prior_stage_hash` (formatted as `f"{prev_breed}:{prev_output_hash}"`) into the next breed's facts array.

## Live Output Hashes (v26.6.10)

These output hashes represent the bit-exact, deterministic results generated during validation of the individual examples:

| Breed | output_hash (first 16) |
|---|---|
| abductive_ibe | `03505d975e04bcd5` |
| abductive_lp | `1d2b00a9181d2b4f` |
| act_r | `55d3e70daddee091` |
| allen_temporal | `5857df023eaa19ce` |
| analogy_sme | `1c0c86192c1d10cc` |
| asp | `26bc8234a55d2cf3` |
| autoinstinct_learning | `9f1389b72fe6023c` |
| autoinstinct_neurosis | `d3e33c417e99da15` |
| autoinstinct_semantics | `936d32763f36fd87` |
| autoinstinct_vision | `59ffb7d74da33fe7` |
| bayesian_network | `73439e7ebb9120de` |
| belief_merging | `c3e82c3d29ade8c3` |
| cbr | `9d1996d75e81d7e5` |
| circumscription | `d43ab3c928ce1458` |
| clp | `515f57f16fb98af8` |
| construction_grammar | `391261ee6ea3b91f` |
| contingent_plan | `3467f6a0049cb801` |
| csp_ac3 | `85014b3e712b45b8` |
| ctl_check | `7c3d71e4256fff43` |
| default_logic | `a5497eeb4c461bbf` |
| dempster_shafer | `dd7ed98802b0cddd` |
| dendral | `e49b7fd1e3b9ba65` |
| description_logic | `0c7afe958ae08ff8` |
| ebl | `5d2b61fd7d0eac08` |
| eliza | `dd442150f3db7c73` |
| episodic_memory | `7fb9b952ce035224` |
| event_calculus | `6cc023f07186f504` |
| frames_inheritance | `579e9d61e73e92f0` |
| fuzzy_logic | `c1ca20d367d5f6de` |
| gps | `80fd9b7528bb883d` |
| hearsay | `91a01ff5a78eb057` |
| htn_planning | `b7a9d87615b02e34` |
| ilp | `340869bc3cd91796` |
| ltl_monitor | `91da8cfb05ecbc34` |
| markov_logic | `d82fb1a7318e1b4d` |
| mdp | `a233ae442bf64a09` |
| meta_reasoning | `ac2659a7f875be3e` |
| mycin | `700c805a262974ea` |
| naive_physics | `78a716dd643e607b` |
| partial_order_plan | `f5974881fde5e8af` |
| pomdp | `27b5b6976bac698a` |
| problog | `c2f11755fb85fa71` |
| prolog | `43d645c296cf7a9a` |
| qualitative_reason | `4d46336a65718384` |
| rl_symbolic | `c0ef95c1524fabab` |
| sat_cdcl | `fb70c79f8eb340a8` |
| script_sam | `0378f26b4fa05f23` |
| situation_calculus | `03acc09c9ae7eb0e` |
| soar | `40e44da0c464aed5` |
| strips | `5bd502b8a78c4ac5` |
| tableaux | `ba67019f66de0810` |
| version_space | `1dba3dc45e3818f5` |

## Verification & Trust Doctrine

Every cognition example run complies with the following trust boundaries:
1. **Inference Trace**: Pure non-empty logic matching the breed's execution.
2. **BLAKE3 hashes**: Deterministic cryptographic digests representing execution state.
3. **Replay Determinism**: Exiting cleanly and verifying bit-exact outputs twice under `NODE_NO_WARNINGS=1` environment.
4. **Receipt Doctor Integrity**: Cryptographic receipts audited successfully via Rust Receipt Doctor (`cargo run --bin wpm receipt doctor`).
