import json

with open("crates/wasm4pm-cognition/breeds/registry.json", "r") as f:
    registry = json.load(f)

# Rename the 9 existing UNSUPPORTED placeholders
renames = {
    "bayesian": "bayesian_network",
    "fuzzy": "fuzzy_logic",
    "constraint": "csp_ac3",
    "temporal": "allen_temporal",
    "abductive": "abductive_lp",
    "inductive": "ilp",
    "ontological": "description_logic",
    "analogical": "analogy_sme",
    "dempster_shafer": "dempster_shafer"
}

existing_ids = set()

for item in registry:
    old_id = item["breed_id"]
    if old_id in renames:
        item["breed_id"] = renames[old_id]
        item["historical_ancestor"] = item["historical_ancestor"] + f" ({old_id})"
    existing_ids.add(item["breed_id"])

# 42 new breeds from PRD
p1 = ["ltl_monitor", "allen_temporal", "fuzzy_logic", "bayesian_network", "csp_ac3", "default_logic", "htn_planning", "dempster_shafer", "frames_inheritance", "ebl"]
p2 = ["asp", "description_logic", "abductive_lp", "abductive_ibe", "partial_order_plan", "event_calculus", "mdp", "version_space", "belief_merging", "qualitative_reason", "script_sam", "clp"]
p3 = ["situation_calculus", "circumscription", "analogy_sme", "act_r", "prolog", "sat_cdcl", "episodic_memory", "rl_symbolic", "ctl_check", "ilp", "naive_physics"]
p4 = ["pomdp", "markov_logic", "meta_reasoning", "construction_grammar", "contingent_plan", "tableaux"]

# remove problog from p3 if prolog is there but wait, the plan has problog, not prolog!
# Wait! "prolog" is already in PARTIAL_ALIVE (13 breeds). The plan has "prolog" in P3? No, let me re-read P3.
# The plan says "problog". "prolog" is already existing.
p3 = ["situation_calculus", "circumscription", "analogy_sme", "act_r", "problog", "sat_cdcl", "episodic_memory", "rl_symbolic", "ctl_check", "ilp", "naive_physics"]

all_new_breeds = p1 + p2 + p3 + p4

for b in all_new_breeds:
    if b not in existing_ids:
        registry.append({
            "breed_id": b,
            "breed_name": b.replace("_", " ").title(),
            "historical_ancestor": "TBD",
            "generalized_family": "TBD",
            "input_schema": f"{b}_input_v1",
            "output_schema": f"{b}_output_v1",
            "specification_relation": "TBD",
            "oracle_suite_id": "none",
            "ocel_model_id": "none",
            "receipt_schema_id": "none",
            "wasm_export_name": "none",
            "status": "UNSUPPORTED"
        })
        existing_ids.add(b)

with open("crates/wasm4pm-cognition/breeds/registry.json", "w") as f:
    json.dump(registry, f, indent=2)

print(f"Total breeds in registry: {len(registry)}")

