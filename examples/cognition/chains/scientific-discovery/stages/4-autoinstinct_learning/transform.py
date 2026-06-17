#!/usr/bin/env python3
"""Transform autoinstinct_vision result -> autoinstinct_learning intent.
Reads previous stage result JSON from stdin, writes next intent JSON to stdout.
"""
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}

output = prev.get("payload", {}).get("output", {})
facts_raw = output.get("facts", [])
candidates_raw = output.get("candidates", [])
selected = output.get("selected", [])

facts_dict = {}
for item in facts_raw:
    if isinstance(item, dict):
        facts_dict[item.get("key", "")] = item.get("value", "")

# Extract vision findings
top_structure = facts_dict.get(
    "top_structure",
    facts_dict.get("top_candidate_from_prolog", "cyclohexanol_chair_equatorial_OH"),
)
ring_topology = facts_dict.get("ring_topology", facts_dict.get("ring_bond_topology_detected", "true"))
oh_orient = facts_dict.get("oh_orientation", "equatorial")
conformation = facts_dict.get("conformation", "chair")

# Surviving candidates become experimental plans
surviving = [
    c for c in (selected or candidates_raw)
    if isinstance(c, dict) and not c.get("eliminated", False)
]

# Map structural candidates to experiment plans
experiment_plans = [
    {"id": "plan_NMR_COSY_then_GCMS", "score": 0.87, "eliminated": False},
    {"id": "plan_MSMS_fragmentation_then_NMR", "score": 0.79, "eliminated": False},
    {"id": "plan_GC_retention_index_first", "score": 0.71, "eliminated": False},
]
if len(surviving) > 2:
    experiment_plans.append({"id": "plan_optical_rotation_first", "score": 0.58, "eliminated": False})

ambiguity = (
    "stereoisomer_and_substitution_position"
    if len(surviving) > 2
    else "conformation_only"
)

next_input = {
    "intent": (
        f"Plan optimal experimental validation sequence for {top_structure} "
        f"— sequence experiments to maximally resolve {ambiguity} using STRIPS/HACKER bitwise heuristic"
    ),
    "candidates": experiment_plans,
    "facts": [
        {"key": "top_structure", "value": top_structure},
        {"key": "ring_topology_confirmed", "value": str(ring_topology).lower()},
        {"key": "oh_orientation", "value": oh_orient},
        {"key": "conformation", "value": conformation},
        {"key": "ambiguity_remaining", "value": ambiguity},
        {"key": "available_techniques", "value": "NMR_COSY,NMR_NOESY,GCMS,MSMS,optical_rotation"},
        {"key": "samples_available", "value": "3"},
        {"key": "experiment_budget_hours", "value": "8"},
        {"key": "learning_method", "value": "STRIPS_bitwise_HACKER_heuristic"},
        {"key": "structural_candidates_remaining", "value": str(len(surviving))},
    ],
    "rules": [
        {
            "id": "r_nmr_cosy_resolves_adjacent",
            "premise": ["stereoisomers_possible"],
            "conclusion": "NMR COSY resolves adjacent H-H coupling", "certainty": 0.9,
        },
        {
            "id": "r_gcms_retention_index",
            "premise": ["isomers_with_same_mass"],
            "conclusion": "GC retention index separates structural isomers", "certainty": 0.9,
        },
        {
            "id": "r_hacker_least_commitment",
            "premise": ["multiple_experiments_available"],
            "conclusion": "sequence by maximum ambiguity reduction per hour", "certainty": 0.9,
        },
    ],
    "goals": [
        {
            "id": "g_resolve_ambiguity",
            "predicate": f"{ambiguity}_resolved",
            "value": "true",
        },
        {
            "id": "g_plan_complete",
            "predicate": "experiment_sequence_fully_ordered",
            "value": "true",
        },
        {
            "id": "g_budget_constraint",
            "predicate": "total_experiment_hours_le_8",
            "value": "true",
        },
    ],
    "cases": [
        {
            "id": "case_experiment_sequencing",
            "intent": f"STRIPS experiment sequence planning for {top_structure}",
            "architecture": "optimal_experiment_sequence_planned",
            "outcome_score": 0.87,
            "facts": [
                {"key": "top_structure", "value": top_structure},
                {"key": "ambiguity", "value": ambiguity},
            ],
        },
    ],
    "state": [
        {"predicate": "pipeline_stage", "value": "5_autoinstinct_learning_experiment_planning"},
        {"predicate": "vision_conformation", "value": conformation},
        {"predicate": "strips_state_encoded", "value": "false"},
        {"predicate": "source_stage", "value": "autoinstinct_vision"},
        {"predicate": "candidates_from_vision", "value": str(len(surviving))},
    ],
}

json.dump(next_input, sys.stdout, indent=2)
sys.stderr.write(
    f"Learning input written: {len(experiment_plans)} experiment plans, ambiguity={ambiguity}\n"
)
