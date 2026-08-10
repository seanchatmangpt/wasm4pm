"""DSPy SELECT-stage program for wasm4pm-cognition benchmark manufacture.

This program may propose benchmark-contract candidates. It never writes executable Rust,
never invokes ggen, and never runs benchmarks. Candidate output must pass deterministic
admission before it can replace O.star.toml.

Usage (with a configured DSPy LM):
    uv run python benchmark-manufacturing/dspy_program.py --inventory inventory.json

The output is JSON on stdout. Review/admission is intentionally a separate transition.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import dspy

EXPECTED_BREEDS = 55
ALLOWED_SURFACES = {"kernel_only", "full_lifecycle", "context_pressure"}


class DesignAntiHidingMatrix(dspy.Signature):
    """Design a falsifiable benchmark matrix that makes weak cognition implementations visible.

    Preserve all canonical cognition identities. Prefer geometric scale ladders, independent
    kernel/lifecycle measurement, adversarial irrelevant-context pressure, allocation/throughput
    observation, grounded fixtures, and explicit falsifiers. Do not grant execution authority.
    """

    inventory_json: str = dspy.InputField(desc="Canonical cognition inventory and fixture metadata")
    current_contract_json: str = dspy.InputField(desc="Current admitted benchmark contract")
    benchmark_contract_json: str = dspy.OutputField(
        desc="JSON object containing breeds, batch_sizes, context_sizes, surfaces, falsifiers, rationale"
    )


class BenchmarkDesigner(dspy.Module):
    def __init__(self) -> None:
        super().__init__()
        self.design = dspy.ChainOfThought(DesignAntiHidingMatrix)

    def forward(self, inventory_json: str, current_contract_json: str):
        return self.design(
            inventory_json=inventory_json,
            current_contract_json=current_contract_json,
        )


def admit_candidate(candidate: dict[str, Any], inventory: list[str]) -> dict[str, Any]:
    """Deterministic SELECT→ADMIT membrane. Raises on any weakening/drift."""
    if len(inventory) != EXPECTED_BREEDS or len(set(inventory)) != EXPECTED_BREEDS:
        raise ValueError("REFUSED:CANONICAL_INVENTORY_NOT_EXACTLY_55")

    breeds = candidate.get("breeds")
    if breeds != inventory:
        raise ValueError("REFUSED:DSPY_CANNOT_CHANGE_CANONICAL_BREED_INVENTORY")

    batch_sizes = candidate.get("batch_sizes")
    if not isinstance(batch_sizes, list) or len(batch_sizes) < 4:
        raise ValueError("REFUSED:INSUFFICIENT_BATCH_SCALING")
    if batch_sizes != sorted(set(batch_sizes)) or batch_sizes[0] != 1:
        raise ValueError("REFUSED:NON_MONOTONIC_BATCH_SCALING")
    if max(batch_sizes) < 64:
        raise ValueError("REFUSED:BATCH_SCALE_TOO_SMALL_TO_EXPOSE_PATHOLOGY")

    context_sizes = candidate.get("context_sizes")
    if not isinstance(context_sizes, list) or len(context_sizes) < 4:
        raise ValueError("REFUSED:INSUFFICIENT_CONTEXT_SCALING")
    if context_sizes != sorted(set(context_sizes)) or context_sizes[0] != 0:
        raise ValueError("REFUSED:NON_MONOTONIC_CONTEXT_SCALING")
    if max(context_sizes) < 4096:
        raise ValueError("REFUSED:CONTEXT_SCALE_TOO_SMALL_TO_EXPOSE_SCANS")

    surfaces = set(candidate.get("surfaces", []))
    if surfaces != ALLOWED_SURFACES:
        raise ValueError("REFUSED:MISSING_OR_UNKNOWN_MEASUREMENT_SURFACE")

    falsifiers = candidate.get("falsifiers", [])
    if not isinstance(falsifiers, list) or len(falsifiers) < 8:
        raise ValueError("REFUSED:ANTI_HIDING_FALSIFIERS_TOO_WEAK")
    if any(not isinstance(x, str) or not x.strip() for x in falsifiers):
        raise ValueError("REFUSED:EMPTY_FALSIFIER")

    # DSPy output is a candidate specification only. Explicitly bind authority.
    admitted = dict(candidate)
    admitted["expected_breeds"] = EXPECTED_BREEDS
    admitted["expected_measurements"] = EXPECTED_BREEDS * (
        len(batch_sizes) * 2 + len(context_sizes)
    )
    admitted["authority"] = "SELECT_ONLY"
    admitted["actuation"] = "REFUSED"
    return admitted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--contract", type=Path, default=Path("benchmark-manufacturing/O.star.toml"))
    args = parser.parse_args()

    inventory_doc = json.loads(args.inventory.read_text())
    inventory = inventory_doc["breeds"]
    if not isinstance(inventory, list) or not all(isinstance(x, str) for x in inventory):
        raise SystemExit("REFUSED:INVALID_INVENTORY_DOCUMENT")

    program = BenchmarkDesigner()
    prediction = program(
        inventory_json=json.dumps(inventory_doc, sort_keys=True),
        current_contract_json=json.dumps({"source": str(args.contract)}, sort_keys=True),
    )
    try:
        candidate = json.loads(prediction.benchmark_contract_json)
        admitted = admit_candidate(candidate, inventory)
    except (json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc

    print(json.dumps(admitted, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
