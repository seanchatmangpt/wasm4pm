#!/usr/bin/env python3
"""Transform hearsay result -> dendral intent.
Reads previous stage result JSON from stdin, writes next intent JSON to stdout.
"""
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}

output = prev.get("payload", {}).get("output", {})
facts_raw = output.get("facts", [])
selected = output.get("selected", [])
candidates_raw = output.get("candidates", [])

# Extract key hearsay findings
facts_dict = {}
for item in facts_raw:
    if isinstance(item, dict):
        facts_dict[item.get("key", "")] = item.get("value", "")

formula = facts_dict.get("formula", "C6H12O")
functional_group = facts_dict.get("functional_group", "alcohol")
ring_present = facts_dict.get("ring_structure", facts_dict.get("ring_present", "true"))
carbonyl = facts_dict.get("carbonyl_present", "false")
dou = facts_dict.get("degree_of_unsaturation", "1")

# Carry top hearsay candidates forward as scored seeds
seeds = []
for c in (selected or candidates_raw)[:4]:
    cid = c.get("id", "unknown") if isinstance(c, dict) else str(c)
    seeds.append({
        "id": cid,
        "score": c.get("score", 0.5) if isinstance(c, dict) else 0.5,
        "eliminated": False,
    })

# Ensure minimum candidate set
default_ids = [
    "cyclohexanol",
    "1_methylcyclopentanol",
    "cis_2_methylcyclopentanol",
    "trans_2_methylcyclopentanol",
]
for did in default_ids:
    if not any(s["id"] == did for s in seeds):
        seeds.append({"id": did, "score": 0.55, "eliminated": False})

top_candidate = (
    selected[0].get("id")
    if selected and isinstance(selected[0], dict)
    else seeds[0]["id"] if seeds else "cyclohexanol"
)

next_input = {
    "intent": (
        f"Enumerate all chemically plausible molecular structures consistent with formula "
        f"{formula} and functional-group constraints ({functional_group}, ring={ring_present}, "
        f"carbonyl={carbonyl}) derived from hearsay hypothesis"
    ),
    "candidates": seeds,
    "facts": [
        {"key": "formula", "value": formula},
        {"key": "functional_group", "value": functional_group},
        {"key": "ring_present", "value": ring_present},
        {"key": "degree_of_unsaturation", "value": dou},
        {"key": "carbonyl_absent", "value": str(carbonyl == "false").lower()},
        {"key": "hearsay_top_candidate", "value": top_candidate},
        {"key": "hearsay_confidence", "value": facts_dict.get("hypothesis_confidence", "0.72")},
        {"key": "enumeration_method", "value": "DENDRAL_graph_generator"},
    ],
    "rules": [
        {"id": "r_valence_carbon", "premise": ["atom is carbon"], "conclusion": "valence must equal 4", "certainty": 0.9},
        {
            "id": "r_valence_oxygen",
            "premise": ["atom is oxygen", f"functional_group is {functional_group}"],
            "conclusion": "valence must equal 2", "certainty": 0.9,
        },
        {
            "id": "r_ring_closure",
            "premise": [f"degree_of_unsaturation == {dou}", "no_double_bond"],
            "conclusion": "exactly one ring must close", "certainty": 0.9,
        },
        {
            "id": "r_symmetry_pruning",
            "premise": ["two structures are graph_isomorphic"],
            "conclusion": "retain only canonical form", "certainty": 0.9,
        },
    ],
    "goals": [
        {
            "id": "g_enumerate_all_isomers",
            "predicate": f"all_{formula}_ring_alcohol_isomers_generated",
            "value": "true",
        },
        {
            "id": "g_score_by_hearsay_fit",
            "predicate": "candidates_scored_against_hearsay_facts",
            "value": "true",
        },
    ],
    "cases": [
        {
            "id": "case_dendral_ring_alcohol",
            "intent": "dendral ring alcohol enumeration",
            "architecture": "ring_alcohol_isomers_enumerated",
            "outcome_score": 0.85,
            "facts": [
                {"key": "formula", "value": formula},
                {"key": "ring", "value": ring_present},
                {"key": "oh_groups", "value": "1"},
            ],
        },
    ],
    "state": [
        {"predicate": "pipeline_stage", "value": "2_dendral_enumeration"},
        {"predicate": "hearsay_hypothesis", "value": f"cyclic_{functional_group}"},
        {"predicate": "enumeration_complete", "value": "false"},
        {"predicate": "source_stage", "value": "hearsay"},
    ],
}

json.dump(next_input, sys.stdout, indent=2)
sys.stderr.write(f"Dendral input written: {len(seeds)} seed candidates for formula {formula}\n")
