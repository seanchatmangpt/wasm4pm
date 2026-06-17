#!/usr/bin/env python3
"""Transform autoinstinct_learning result -> soar intent.
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

# Extract learning plan output
top_structure = facts_dict.get("top_structure", "cyclohexanol_chair_equatorial_OH")
ambiguity = facts_dict.get("ambiguity_remaining", "stereoisomer_and_substitution_position")
plan = facts_dict.get(
    "experiment_plan",
    facts_dict.get("learning_plan", "NMR_COSY_then_GCMS_then_MSMS"),
)
budget = facts_dict.get("experiment_budget_hours", facts_dict.get("budget_hours_remaining", "8"))

# Convert experiment plan candidates to competing approach operators for SOAR
plan_candidates = [
    c for c in (selected or candidates_raw)
    if isinstance(c, dict) and not c.get("eliminated", False)
]

soar_operators = []
for c in plan_candidates[:5]:
    cid = c.get("id", "unknown")
    # Remap plan IDs to approach IDs
    approach_id = cid.replace("plan_", "approach_")
    soar_operators.append({"id": approach_id, "score": c.get("score", 0.6), "eliminated": False})

if not soar_operators:
    soar_operators = [
        {"id": "approach_NMR_COSY_first", "score": 0.87, "eliminated": False},
        {"id": "approach_GCMS_first", "score": 0.79, "eliminated": False},
        {"id": "approach_MSMS_first", "score": 0.74, "eliminated": False},
    ]

next_input = {
    "intent": (
        f"Resolve competing experimental approach preferences for {top_structure} validation "
        f"via SOAR preference resolution — select canonical experiment sequence and emit "
        f"justified operator preference trace"
    ),
    "candidates": soar_operators,
    "facts": [
        {"key": "experiment_plan_from_learning", "value": plan},
        {"key": "top_structure", "value": top_structure},
        {"key": "ambiguity_remaining", "value": ambiguity},
        {"key": "budget_hours_remaining", "value": budget},
        {"key": "sample_quantity_limited", "value": "true"},
        {"key": "lab_availability_NMR", "value": "immediately"},
        {"key": "lab_availability_GCMS", "value": "2_hour_wait"},
        {"key": "lab_availability_MSMS", "value": "next_day"},
        {"key": "soar_architecture", "value": "preference_resolution_tie_impasse"},
        {"key": "decision_cycle_count", "value": "0"},
        {"key": "impasse_type_expected", "value": "tie_between_NMR_and_GCMS"},
    ],
    "rules": [
        {
            "id": "r_prefer_immediate_availability",
            "premise": ["lab_available_now"],
            "conclusion": "best preference: prefer immediately available technique", "certainty": 0.9,
        },
        {
            "id": "r_prefer_nondestructive",
            "premise": ["sample_quantity_limited == true"],
            "conclusion": "better preference: prefer non-destructive technique first", "certainty": 0.9,
        },
        {
            "id": "r_tie_impasse_subgoal",
            "premise": ["two_operators_tied_in_preference"],
            "conclusion": "create subgoal to evaluate secondary criterion", "certainty": 0.9,
        },
        {
            "id": "r_reject_destructive_first",
            "premise": ["sample_limited", "technique_is_destructive"],
            "conclusion": "reject operator: destructive before NMR", "certainty": 0.9,
        },
        {
            "id": "r_soar_learning_chunk",
            "premise": ["subgoal_resolved_successfully"],
            "conclusion": f"chunk: IF {ambiguity} AND NMR_available THEN prefer_NMR_first",
            "certainty": 0.9,
        },
    ],
    "goals": [
        {"id": "g_resolve_tie_impasse", "predicate": "tie_impasse_resolved", "value": "true"},
        {
            "id": "g_select_final_approach",
            "predicate": "canonical_experiment_sequence_selected",
            "value": "true",
        },
        {
            "id": "g_emit_preference_trace",
            "predicate": "operator_preference_trace_emitted",
            "value": "true",
        },
        {"id": "g_chunk_learned", "predicate": "soar_chunk_acquired", "value": "true"},
    ],
    "cases": [
        {
            "id": "case_soar_lab_scheduling",
            "intent": f"SOAR preference resolution for {top_structure} lab scheduling",
            "architecture": "NMR_COSY_selected_as_first_step",
            "outcome_score": 0.91,
            "facts": [
                {"key": "ambiguity", "value": ambiguity},
                {"key": "top_structure", "value": top_structure},
                {"key": "constraint", "value": "availability_and_nondestructive"},
            ],
        },
    ],
    "state": [
        {"predicate": "pipeline_stage", "value": "6_soar_preference_resolution"},
        {"predicate": "learning_plan", "value": plan},
        {"predicate": "soar_decision_cycle", "value": "0"},
        {"predicate": "impasse_active", "value": "false"},
        {"predicate": "chunk_memory_size", "value": "0"},
        {"predicate": "source_stage", "value": "autoinstinct_learning"},
        {"predicate": "final_decision_emitted", "value": "false"},
    ],
}

json.dump(next_input, sys.stdout, indent=2)
sys.stderr.write(
    f"SOAR input written: {len(soar_operators)} competing approaches for {top_structure}\n"
)
