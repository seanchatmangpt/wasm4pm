#!/usr/bin/env python3
"""Fail-closed verifier for the process-science benchmark log."""

from __future__ import annotations

import csv
import hashlib
import re
import sys
from pathlib import Path

EXPECTED = {
    "descriptive_statistics": ("latent_process_hypothesis_generation", 6, 1, 1, 2),
    "classification": ("trajectory_state_inference", 8, 2, 1, 2),
    "regression": ("transition_dynamics_estimation", 8, 4, 1, 2),
    "clustering": ("process_family_inference", 12, 2, 1, 2),
    "forecasting": ("forward_process_inference", 8, 8, 1, 2),
    "survival_analysis": ("terminal_path_hazard_inference", 6, 8, 1, 2),
    "anomaly_detection": ("transition_law_violation_detection", 4, 2, 1, 3),
    "causal_inference": ("intervention_reachability_discrimination", 12, 8, 4, 4),
    "feature_engineering": ("process_projection_retention", 6, 4, 1, 3),
    "etl": ("evidence_reconstruction_and_provenance", 4, 2, 1, 6),
    "bayesian_inference": ("process_hypothesis_discrimination", 16, 4, 1, 4),
    "reinforcement_learning": ("governed_policy_trajectory_search", 12, 8, 6, 4),
    "process_science_end_to_end": (
        "observe_admit_infer_discriminate_simulate_construct_govern_receipt",
        16,
        8,
        6,
        6,
    ),
}


def refuse(code: str) -> None:
    raise SystemExit(f"REFUSED:{code}")


def fields(line: str) -> dict[str, str]:
    try:
        return dict(part.split("=", 1) for part in line.split("\t")[1:])
    except ValueError:
        refuse("PROCESS_SCIENCE_MALFORMED_ROW")
        raise AssertionError("unreachable")


def main() -> None:
    log_path = Path(sys.argv[1] if len(sys.argv) > 1 else "process-science.log")
    if not log_path.is_file():
        refuse("PROCESS_SCIENCE_LOG_MISSING")

    log = log_path.read_text()
    lines = log.splitlines()
    subjects = [line for line in lines if line.startswith("PROCESS_SCIENCE_SUBJECT\t")]
    results = [line for line in lines if line.startswith("PROCESS_SCIENCE_RESULT\t")]
    completes = [line for line in lines if line.startswith("PROCESS_SCIENCE_COMPLETE\t")]

    if len(subjects) != 1 or len(completes) != 1:
        refuse("PROCESS_SCIENCE_IDENTITY_MISSING")
    if len(results) != 39:
        refuse(f"PROCESS_SCIENCE_ROW_COUNT:{len(results)}")

    subject = fields(subjects[0])
    completion = fields(completes[0])
    rows = [fields(line) for line in results]

    if subject.get("actuation") != "REFUSED" or completion.get("actuation") != "REFUSED":
        refuse("PROCESS_SCIENCE_ACTUATION_AUTHORITY_LEAK")
    if completion.get("status") != "ALIVE_CANDIDATE":
        refuse("PROCESS_SCIENCE_COMPLETION_STANDING")
    if int(subject["families"]) != 13 or int(completion["families"]) != 13:
        refuse("PROCESS_SCIENCE_FAMILY_COUNT")

    planned_observations = int(subject["planned_observations"])
    planned_transitions = int(subject["planned_transition_evaluations"])
    if planned_observations < 24_000_000:
        refuse("PROCESS_SCIENCE_SCALE_TOO_SMALL")
    if planned_transitions < 144_000_000:
        refuse("PROCESS_SCIENCE_TRANSITION_SCALE_TOO_SMALL")
    if int(subject["flagship_observations"]) != 10_000_000:
        refuse("PROCESS_SCIENCE_FLAGSHIP_MISSING")
    if completion["planned_observations"] != subject["planned_observations"]:
        refuse("PROCESS_SCIENCE_PLAN_DRIFT")
    if completion["planned_transition_evaluations"] != subject["planned_transition_evaluations"]:
        refuse("PROCESS_SCIENCE_TRANSITION_PLAN_DRIFT")

    seen: set[str] = set()
    total_observations = 0
    total_transitions = 0
    total_hypotheses = 0
    total_futures = 0
    total_interventions = 0
    total_receipts = 0

    for row in rows:
        family = row["family"]
        if family not in EXPECTED:
            refuse(f"PROCESS_SCIENCE_UNKNOWN_FAMILY:{family}")
        operator, hypothesis_width, future_width, intervention_width, evidence_width = EXPECTED[family]
        if row["operator"] != operator:
            refuse(f"PROCESS_SCIENCE_OPERATOR_DRIFT:{family}")

        scale = int(row["scale"])
        observations = int(row["observations"])
        hypotheses = int(row["hypotheses"])
        transitions = int(row["transition_evaluations"])
        futures = int(row["candidate_futures"])
        interventions = int(row["interventions"])
        evidence_links = int(row["evidence_links"])
        admitted = int(row["admitted"])
        refused = int(row["refused"])
        receipts = int(row["receipts"])
        elapsed_ns = int(row["elapsed_ns"])
        receipt = row["final_receipt"]

        if observations != scale or receipts != scale:
            refuse(f"PROCESS_SCIENCE_OBSERVATION_RECEIPT_STANDING:{family}@{scale}")
        if admitted + refused != scale:
            refuse(f"PROCESS_SCIENCE_ADMISSION_STANDING:{family}@{scale}")
        if transitions != scale * 6:
            refuse(f"PROCESS_SCIENCE_TRANSITIONS:{family}@{scale}")
        if hypotheses != scale * hypothesis_width:
            refuse(f"PROCESS_SCIENCE_HYPOTHESES:{family}@{scale}")
        if futures != scale * future_width:
            refuse(f"PROCESS_SCIENCE_FUTURES:{family}@{scale}")
        if interventions != scale * intervention_width:
            refuse(f"PROCESS_SCIENCE_INTERVENTIONS:{family}@{scale}")
        if evidence_links != scale * evidence_width:
            refuse(f"PROCESS_SCIENCE_EVIDENCE_LINKS:{family}@{scale}")
        if elapsed_ns <= 0:
            refuse(f"PROCESS_SCIENCE_CLOCK:{family}@{scale}")
        if not re.fullmatch(r"[0-9a-f]{64}", receipt):
            refuse(f"PROCESS_SCIENCE_RECEIPT:{family}@{scale}")

        seconds = elapsed_ns / 1e9
        rates = {
            "observations_per_second": observations / seconds,
            "hypotheses_per_second": hypotheses / seconds,
            "transitions_per_second": transitions / seconds,
        }
        for key, expected_rate in rates.items():
            logged = float(row[key])
            if logged <= 0 or abs(expected_rate - logged) / expected_rate > 1e-6:
                refuse(f"PROCESS_SCIENCE_ARITHMETIC_DRIFT:{family}:{key}")

        seen.add(family)
        total_observations += observations
        total_transitions += transitions
        total_hypotheses += hypotheses
        total_futures += futures
        total_interventions += interventions
        total_receipts += receipts

    if seen != set(EXPECTED):
        refuse("PROCESS_SCIENCE_FAMILY_COVERAGE")
    if total_observations != planned_observations:
        refuse(f"PROCESS_SCIENCE_EXECUTION_TOTAL:{total_observations}!={planned_observations}")
    if total_transitions != planned_transitions:
        refuse(f"PROCESS_SCIENCE_TRANSITION_TOTAL:{total_transitions}!={planned_transitions}")

    flagship = next(
        row
        for row in rows
        if row["family"] == "process_science_end_to_end" and int(row["scale"]) == 10_000_000
    )

    with Path("process-science-results.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    log_sha = hashlib.sha256(log.encode()).hexdigest()
    summary = f"""# Process Science Benchmark Receipt

## Directly observed synthetic execution

- Process-science families: **{len(seen)}**
- Observations executed: **{total_observations:,}**
- Process hypotheses evaluated: **{total_hypotheses:,}**
- Transition evaluations: **{total_transitions:,}**
- Candidate futures evaluated: **{total_futures:,}**
- Candidate interventions constructed: **{total_interventions:,}**
- Receipts emitted: **{total_receipts:,}**
- Largest end-to-end row: **10,000,000 observations**
- Flagship observations/second: **{float(flagship['observations_per_second']):,.0f}**
- Flagship hypotheses/second: **{float(flagship['hypotheses_per_second']):,.0f}**
- Flagship transitions/second: **{float(flagship['transitions_per_second']):,.0f}**
- Benchmark log SHA-256: `{log_sha}`

## Claim boundary

These are directly executed deterministic synthetic process-science episodes seeded by the checked-in XES evidence identity. They measure bounded candidate evaluation, governance, and receipt manufacture. They do not establish causal truth, human/LLM cognition rates, equivalence to an enterprise workload, or external actuation. All candidate interventions retain `actuation=REFUSED`.
"""
    Path("process-science-summary.md").write_text(summary)
    print(summary)


if __name__ == "__main__":
    main()
