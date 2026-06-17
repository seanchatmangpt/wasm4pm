#!/usr/bin/env python3
"""Transform dendral result -> prolog intent.
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

# Carry all non-eliminated candidates from dendral
all_candidates = selected if selected else candidates_raw
prolog_candidates = []
for c in all_candidates:
    if not isinstance(c, dict):
        continue
    if not c.get("eliminated", False):
        prolog_candidates.append({
            "id": c.get("id", "unknown"),
            "score": c.get("score", 0.5),
            "eliminated": False,
        })

if not prolog_candidates:
    prolog_candidates = [
        {"id": "cyclohexanol", "score": 0.88, "eliminated": False},
        {"id": "1_methylcyclopentanol", "score": 0.74, "eliminated": False},
        {"id": "cis_2_methylcyclopentanol", "score": 0.69, "eliminated": False},
        {"id": "trans_2_methylcyclopentanol", "score": 0.69, "eliminated": False},
        {"id": "oxacycloheptane", "score": 0.21, "eliminated": False},
    ]

formula = facts_dict.get("formula", "C6H12O")
fg = facts_dict.get("functional_group", "alcohol")
ms_base = facts_dict.get("ms_base_peak", "57")
ir_oh = facts_dict.get("ir_oh_present", "true")

next_input = {
    "intent": (
        f"Apply logical valence constraints and spectral consistency predicates to prune "
        f"{len(prolog_candidates)} DENDRAL candidates for {formula} to conforming structures only"
    ),
    "candidates": prolog_candidates,
    "facts": [
        {"key": "formula", "value": formula},
        {"key": "functional_group", "value": fg},
        {"key": "ring_present", "value": facts_dict.get("ring_present", "true")},
        {"key": "ms_base_peak", "value": ms_base},
        {"key": "ms_water_loss", "value": "true"},
        {"key": "ir_oh_present", "value": ir_oh},
        {"key": "ir_carbonyl_absent", "value": str(facts_dict.get("carbonyl_absent", "true"))},
        {"key": "nmr_secondary_carbon_oh", "value": "true"},
        {"key": "constraint_method", "value": "prolog_horn_clause_resolution"},
    ],
    "rules": [
        {
            "id": "r_eliminate_ether",
            "premise": ["ir_carbonyl_absent == true", "ring_oxygen_present"],
            "conclusion": "eliminate ether ring structures", "certainty": 0.9,
        },
        {
            "id": "r_secondary_alcohol_nmr",
            "premise": ["nmr_secondary_carbon_oh == true"],
            "conclusion": "tertiary and primary alcohols inconsistent", "certainty": 0.9,
        },
        {
            "id": "r_water_loss_required",
            "premise": ["ms_water_loss == true"],
            "conclusion": "candidate must support E1 dehydration", "certainty": 0.9,
        },
        {
            "id": "r_valence_4_carbon",
            "premise": ["carbon_atom_in_candidate"],
            "conclusion": "carbon valence must be exactly 4", "certainty": 0.9,
        },
    ],
    "goals": [
        {
            "id": "g_eliminate_impossible",
            "predicate": "structurally_impossible_candidates_eliminated",
            "value": "true",
        },
        {
            "id": "g_eliminate_inconsistent",
            "predicate": "spectrally_inconsistent_candidates_eliminated",
            "value": "true",
        },
        {
            "id": "g_retain_conforming",
            "predicate": "conforming_candidates_count_ge_1",
            "value": "true",
        },
    ],
    "cases": [
        {
            "id": "case_ether_elimination",
            "intent": "prolog ether elimination by spectral constraint",
            "architecture": "ether_structure_eliminated",
            "outcome_score": 0.9,
            "facts": [
                {"key": "formula", "value": formula},
                {"key": "ring_o", "value": "true"},
                {"key": "oh_absent", "value": "true"},
            ],
        },
    ],
    "state": [
        {"predicate": "pipeline_stage", "value": "3_prolog_constraint_pruning"},
        {"predicate": "candidates_in", "value": str(len(prolog_candidates))},
        {"predicate": "pruning_complete", "value": "false"},
        {"predicate": "source_stage", "value": "dendral"},
    ],
}

json.dump(next_input, sys.stdout, indent=2)
sys.stderr.write(f"Prolog input written: {len(prolog_candidates)} candidates to prune\n")
