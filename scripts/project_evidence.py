#!/usr/bin/env python3
"""Project ocel/reports/*.json admission evidence into ocel/reports/evidence.ttl.

Deterministic (sorted by breed_id). A breed appears iff its report carries
admitted=true and fitness == 1.0 — the alive-gate CONSTRUCT in ggen.toml
derives breedStatus "PARTIAL_ALIVE" only from these triples.
"""
import os, json, glob

REPORTS = os.path.join(os.path.dirname(__file__), "..", "ocel", "reports")
OUT = os.path.join(REPORTS, "evidence.ttl")

lines = [
    "@prefix rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .",
    "@prefix xsd:    <http://www.w3.org/2001/XMLSchema#> .",
    "@prefix compat: <https://wasm4pm.dev/ns#> .",
    "",
    "# Evidence bridge: projected from ocel/reports/*.json by scripts/project_evidence.py.",
    "# Regenerate with: just project-evidence",
    "",
]

entries = []
for path in sorted(glob.glob(os.path.join(REPORTS, "*.json"))):
    try:
        with open(path) as f:
            d = json.load(f)
    except Exception:
        continue
    breed_id = d.get("breed_id", "")
    if breed_id and d.get("admitted") is True and d.get("fitness") == 1:
        entries.append((breed_id, d.get("model_id", os.path.basename(path).replace(".json", ""))))

for breed_id, prov in sorted(entries):
    lines.append(f"compat:Breed_{breed_id} a compat:CognitionBreed ;")
    lines.append("  compat:measuredFitness 1.0 ;")
    lines.append("  compat:ocelAdmitted true ;")
    lines.append(f'  compat:fitnessProvenance "{prov}" .')
    lines.append("")

with open(OUT, "w") as f:
    f.write("\n".join(lines))
print(f"evidence.ttl: {len(entries)} admitted breeds")
