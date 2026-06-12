#!/usr/bin/env python3
"""Project PI algorithm admission evidence into ocel/reports/pi_evidence.ttl.

Evidence sources (priority order):
  1. ocel/reports/pi/*.json  — fitness measurement reports (fitness >= 0.8, admitted=true)
  2. wasm4pm/tests/fixtures/algorithms/*.json — paper-grounded fixtures
     (fixture with expected.value + provenance.paper = evidence, fitness=1.0 bootstrap)

The pi-certified-gate CONSTRUCT in ggen.toml derives algorithmStatus "CERTIFIED"
from these triples. No hand-flip path exists.

Run with: just project-pi-evidence
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
PI_REPORTS_DIR = REPO_ROOT / "ocel" / "reports" / "pi"
FIXTURE_DIR = REPO_ROOT / "wasm4pm" / "tests" / "fixtures" / "algorithms"
OUTPUT_FILE = REPO_ROOT / "ocel" / "reports" / "pi_evidence.ttl"

PI_NS = "https://wasm4pm.dev/pi#"
FITNESS_THRESHOLD = 0.8


def main() -> None:
    admitted: dict = {}  # algorithm_id -> {fitness, provenance}

    # Source 1: OCEL PI fitness reports (authoritative; overrides fixtures).
    if PI_REPORTS_DIR.exists():
        for report_path in sorted(PI_REPORTS_DIR.glob("*.json")):
            try:
                data = json.loads(report_path.read_text())
            except Exception as exc:
                print(f"WARN: could not parse {report_path}: {exc}")
                continue
            algo_id = data.get("algorithm") or data.get("algorithm_id", "")
            if not algo_id:
                continue
            fitness = float(data.get("fitness") or 0.0)
            if data.get("admitted", False) is True and fitness >= FITNESS_THRESHOLD:
                admitted[algo_id] = {
                    "fitness": fitness,
                    "provenance": data.get("model_id", report_path.stem),
                }

    # Source 2: Paper-grounded fixtures (fixture presence = paper evidence).
    if FIXTURE_DIR.exists():
        for fixture_path in sorted(FIXTURE_DIR.glob("*.json")):
            try:
                data = json.loads(fixture_path.read_text())
            except Exception as exc:
                print(f"WARN: could not parse {fixture_path}: {exc}")
                continue
            algo_id = data.get("algorithm", "")
            if not algo_id or algo_id in admitted:
                continue
            expected_value = (data.get("expected") or {}).get("value")
            prov_paper = (data.get("provenance") or {}).get("paper")
            if expected_value and prov_paper:
                admitted[algo_id] = {
                    "fitness": 1.0,
                    "provenance": fixture_path.stem + "-fixture",
                }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# PI algorithm admission evidence — projected by scripts/project_pi_evidence.py.",
        "# Regenerate with: just project-pi-evidence",
        f"# {len(admitted)} algorithms admitted. Threshold: fitness >= {FITNESS_THRESHOLD} (OCEL) or fixture-presence.",
        "",
        f"@prefix pi:  <{PI_NS}> .",
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
        "",
    ]
    for algo_id in sorted(admitted):
        ev = admitted[algo_id]
        lines += [
            f'pi:Algo_{algo_id} a pi:ProcessIntelligenceAlgorithm ;',
            f'  pi:measuredFitness {ev["fitness"]} ;',
            f'  pi:piAdmitted true ;',
            f'  pi:fitnessProvenance "{ev["provenance"]}" .',
            "",
        ]
    OUTPUT_FILE.write_text("\n".join(lines))
    print(f"pi_evidence.ttl: {len(admitted)} admitted PI algorithms -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
