"""Compatibility CLI for the DSPy-native cognition benchmark program.

Canonical DSPy surfaces now live in:
- signatures.py   — dspy.Signature declarations
- program.py      — composed dspy.Module
- examples.py     — dspy.Example dataset
- metric.py       — DSPy optimization/evaluation metric
- compile.py      — Evaluate + MIPROv2.compile entrypoint
- admission.py    — deterministic SELECT→ADMIT membrane

This file remains only as the model-optional CI admission adapter.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from admission import admit_candidate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    args = parser.parse_args()

    inventory_doc = json.loads(args.inventory.read_text())
    inventory = inventory_doc.get("breeds")
    if not isinstance(inventory, list) or not all(isinstance(x, str) for x in inventory):
        raise SystemExit("REFUSED:INVALID_INVENTORY_DOCUMENT")

    try:
        candidate = json.loads(args.candidate.read_text())
        admitted = admit_candidate(candidate, inventory)
    except (json.JSONDecodeError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc

    print(json.dumps(admitted, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
