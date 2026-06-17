#!/usr/bin/env python3
"""Transform prolog result -> autoinstinct_vision intent.
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

# Get surviving candidates from prolog pruning
surviving = [
    c for c in (selected or candidates_raw)
    if isinstance(c, dict) and not c.get("eliminated", False)
]

if not surviving:
    surviving = [
        {"id": "cyclohexanol", "score": 0.88, "eliminated": False},
        {"id": "1_methylcyclopentanol", "score": 0.74, "eliminated": False},
        {"id": "cis_2_methylcyclopentanol", "score": 0.69, "eliminated": False},
    ]

# Add conformation variants for top candidate
top = surviving[0].get("id", "cyclohexanol") if surviving else "cyclohexanol"
vision_candidates = []
if "cyclohexanol" in top or top == "cyclohexanol":
    vision_candidates.append({"id": "cyclohexanol_chair_equatorial_OH", "score": 0.91, "eliminated": False})
    vision_candidates.append({"id": "cyclohexanol_chair_axial_OH", "score": 0.76, "eliminated": False})
for c in surviving[1:4]:
    vision_candidates.append({"id": c.get("id"), "score": c.get("score", 0.6), "eliminated": False})

formula = facts_dict.get("formula", "C6H12O")
top_candidate = facts_dict.get("top_candidate", top)
ring_size = "6" if "cyclohex" in top_candidate else "5"

next_input = {
    "intent": (
        f"Parse X-ray crystallography electron density map for {top_candidate} candidate "
        f"— detect bond topology support graph and conformation geometry"
    ),
    "candidates": vision_candidates,
    "facts": [
        {"key": "scene_type", "value": "xray_crystallography_electron_density"},
        {"key": "resolution_angstrom", "value": "1.2"},
        {"key": "prolog_conforming_candidates", "value": str(len(surviving))},
        {"key": "top_candidate_from_prolog", "value": top_candidate},
        {"key": "expected_ring_size", "value": ring_size},
        {"key": "expected_bond_type", "value": "C-C_single_and_C-O_single"},
        {"key": "scene_parser", "value": "autoinstinct_vision_bond_topology_detector"},
        {"key": "electron_density_peaks", "value": f"{ring_size}_carbon_1_oxygen_detected"},
        {"key": "bond_length_C_O", "value": "1.43_angstrom"},
    ],
    "rules": [
        {
            "id": "r_ring_detection",
            "premise": [f"{ring_size}_carbon_peaks_detected", "ring_closure_bond_present"],
            "conclusion": f"{ring_size}-membered carbon ring confirmed",
            "certainty": 0.9,
        },
        {
            "id": "r_bond_length_co_alcohol",
            "premise": ["C_O_bond_length between 1.40_and_1.46_angstrom"],
            "conclusion": "single bond C-O consistent with alcohol", "certainty": 0.9,
        },
        {
            "id": "r_support_graph_closure",
            "premise": [f"all_{ring_size}_carbons_bonded_in_ring"],
            "conclusion": "ring topology confirmed", "certainty": 0.9,
        },
    ],
    "goals": [
        {"id": "g_detect_ring_topology", "predicate": "ring_bond_topology_detected", "value": "true"},
        {
            "id": "g_identify_oh_orientation",
            "predicate": "oh_orientation_assigned",
            "value": "equatorial_or_axial",
        },
        {
            "id": "g_support_graph_complete",
            "predicate": "support_graph_node_count_ge_7",
            "value": "true",
        },
    ],
    "cases": [
        {
            "id": f"case_xray_{top_candidate}",
            "intent": f"xray crystallography geometry assignment for {top_candidate}",
            "architecture": f"{top_candidate}_geometry_assigned",
            "outcome_score": 0.88,
            "facts": [
                {"key": "ring_size", "value": ring_size},
                {"key": "exo_oh", "value": "true"},
                {"key": "formula", "value": formula},
            ],
        },
    ],
    "state": [
        {"predicate": "pipeline_stage", "value": "4_autoinstinct_vision_scene_parse"},
        {"predicate": "scene_loaded", "value": "true"},
        {"predicate": "source_stage", "value": "prolog"},
        {"predicate": "candidates_from_prolog", "value": str(len(surviving))},
    ],
}

json.dump(next_input, sys.stdout, indent=2)
sys.stderr.write(
    f"Vision input written: {len(vision_candidates)} conformation candidates for {top_candidate}\n"
)
