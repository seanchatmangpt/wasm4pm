#!/usr/bin/env python3
"""Fail-closed validator for the SREGym-derived compiled troubleshooting benchmark."""
from __future__ import annotations

import csv
import hashlib
import re
import sys
from pathlib import Path

REVISION = "ba07faf1a322f9b6d4a279643bb796aa2f36f64b"
BLOB = "41f9e5d96c14be808a863cca4842cb3479863300"


def fields(line: str) -> dict[str, str]:
    return dict(part.split("=", 1) for part in line.split("\t")[1:])


def refuse(reason: str) -> None:
    raise SystemExit(f"REFUSED:{reason}")


def main() -> None:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "sregym-reasoning.log")
    log = path.read_text()
    lines = log.splitlines()
    subjects = [x for x in lines if x.startswith("SREGYM_REASONING_SUBJECT\t")]
    results = [x for x in lines if x.startswith("SREGYM_REASONING_RESULT\t")]
    completes = [x for x in lines if x.startswith("SREGYM_REASONING_COMPLETE\t")]
    if len(subjects) != 1 or len(completes) != 1:
        refuse("SREGYM_IDENTITY_MISSING")
    if len(results) != 15:
        refuse(f"SREGYM_ROW_COUNT:{len(results)}")

    subject, complete = fields(subjects[0]), fields(completes[0])
    rows = [fields(x) for x in results]
    if subject.get("upstream_revision") != REVISION:
        refuse("SREGYM_UPSTREAM_REVISION_DRIFT")
    if subject.get("problem_list_blob") != BLOB:
        refuse("SREGYM_TAXONOMY_DRIFT")
    if subject.get("actuation") != "REFUSED" or complete.get("actuation") != "REFUSED":
        refuse("SREGYM_ACTUATION_AUTHORITY_LEAK")
    if complete.get("status") != "ALIVE_CANDIDATE":
        refuse("SREGYM_COMPLETION_STANDING")

    planned = int(subject["planned_episodes"])
    planned_transitions = int(subject["planned_transitions"])
    if planned < 30_000_000 or planned_transitions < 240_000_000:
        refuse("SREGYM_SCALE_TOO_SMALL")
    if int(complete["planned_episodes"]) != planned or int(complete["planned_transitions"]) != planned_transitions:
        refuse("SREGYM_PLAN_DRIFT")
    if int(complete["flagship_scale"]) != 10_000_000:
        refuse("SREGYM_FLAGSHIP_MISSING")

    total = transitions = eliminated = 0
    for row in rows:
        scale = int(row["scale"])
        admitted, refused, fallback = int(row["admitted"]), int(row["refused"]), int(row["fallback"])
        compiled, elim, trans = int(row["compiled"]), int(row["hypotheses_eliminated"]), int(row["transitions"])
        elapsed_ns, receipt = int(row["elapsed_ns"]), row["final_receipt"]
        if admitted + refused + fallback != scale:
            refuse(f"SREGYM_STANDING:{row['family']}@{scale}")
        if compiled > scale or elim < scale or trans != scale * 8:
            refuse(f"SREGYM_WORK_ACCOUNTING:{row['family']}@{scale}")
        if row.get("actuation") != "REFUSED":
            refuse("SREGYM_RESULT_AUTHORITY_LEAK")
        if elapsed_ns <= 0 or not re.fullmatch(r"[0-9a-f]{64}", receipt):
            refuse(f"SREGYM_RECEIPT:{row['family']}@{scale}")
        seconds = elapsed_ns / 1e9
        expected = {
            "episodes_per_second": scale / seconds,
            "hypotheses_eliminated_per_second": elim / seconds,
            "transitions_per_second": trans / seconds,
        }
        for key, raw in expected.items():
            logged = float(row[key])
            if logged <= 0 or abs(raw - logged) / raw > 1e-6:
                refuse(f"SREGYM_ARITHMETIC_DRIFT:{row['family']}:{key}")
        total += scale
        transitions += trans
        eliminated += elim

    if total != planned or transitions != planned_transitions:
        refuse("SREGYM_EXECUTION_TOTAL_DRIFT")

    flagship = next(r for r in rows if r["family"] == "symptom_to_diagnostic_route" and int(r["scale"]) == 10_000_000)
    compiled_row = next(r for r in rows if r["family"] == "compiled_known_troubleshooting" and int(r["scale"]) == 5_000_000)
    end_to_end = next(r for r in rows if r["family"] == "issue_reasoning_end_to_end" and int(r["scale"]) == 5_000_000)

    with Path("sregym-results.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    compiled_episodes = sum(int(r["compiled"]) for r in rows)
    fallback_episodes = sum(int(r["fallback"]) for r in rows)
    coverage = compiled_episodes / total
    log_sha = hashlib.sha256(log.encode()).hexdigest()
    summary = f"""# SREGym Compiled Troubleshooting Benchmark Receipt

## Directly observed execution

- Troubleshooting episodes: **{total:,}**
- Diagnostic transitions: **{transitions:,}**
- Hypotheses eliminated: **{eliminated:,}**
- Compiled-path episode observations: **{compiled_episodes:,}**
- Fallback observations: **{fallback_episodes:,}**
- Aggregate compiled-path share across measured rows: **{coverage:.2%}**
- 10M routing row: **{float(flagship['episodes_per_second']):,.0f} episodes/s**
- 5M compiled troubleshooting row: **{float(compiled_row['episodes_per_second']):,.0f} episodes/s**
- 5M end-to-end issue reasoning row: **{float(end_to_end['episodes_per_second']):,.0f} episodes/s**
- Log SHA-256: `{log_sha}`

## Claim boundary

Deterministic diagnostic-graph simulation derived from pinned SREGym taxonomy identity. Not a SREGym live solve-rate result, LLM baseline, or production repair. `actuation=REFUSED` is invariant.
"""
    Path("sregym-summary.md").write_text(summary)
    print(summary)


if __name__ == "__main__":
    main()
