from __future__ import annotations

import json
from pathlib import Path

import dspy


def load_examples(root: Path) -> list[dspy.Example]:
    inventory = json.loads((root / "inventory.json").read_text())
    candidate = json.loads((root / "candidate.json").read_text())
    example = dspy.Example(
        inventory_json=json.dumps(inventory, sort_keys=True),
        current_contract_json=json.dumps(candidate, sort_keys=True),
        breeds=list(inventory["breeds"]),
        benchmark_contract_json=json.dumps(candidate, sort_keys=True),
    ).with_inputs("inventory_json", "current_contract_json")
    return [example]
