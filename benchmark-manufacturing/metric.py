from __future__ import annotations

import json
from typing import Any

EXPECTED_BREEDS = 55
REQUIRED_SURFACES = {"kernel_only", "full_lifecycle", "context_pressure"}


def _load_contract(pred: Any) -> dict[str, Any] | None:
    raw = getattr(pred, "benchmark_contract_json", None)
    if not isinstance(raw, str):
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def benchmark_contract_metric(example: Any, pred: Any, trace: Any = None) -> float:
    """Score DSPy candidates on anti-hiding law, not prose similarity.

    The metric deliberately rewards only mechanically testable properties. The deterministic
    admission membrane remains authoritative after optimization.
    """
    contract = _load_contract(pred)
    if contract is None:
        return 0.0

    expected_inventory = list(example.breeds)
    checks = [
        len(expected_inventory) == EXPECTED_BREEDS,
        contract.get("breeds") == expected_inventory,
        isinstance(contract.get("batch_sizes"), list),
        isinstance(contract.get("context_sizes"), list),
        set(contract.get("surfaces", [])) == REQUIRED_SURFACES,
        isinstance(contract.get("falsifiers"), list) and len(contract.get("falsifiers", [])) >= 8,
    ]

    batch = contract.get("batch_sizes", [])
    context = contract.get("context_sizes", [])
    checks.extend(
        [
            bool(batch) and batch == sorted(set(batch)) and batch[0] == 1 and max(batch) >= 64,
            bool(context) and context == sorted(set(context)) and context[0] == 0 and max(context) >= 4096,
        ]
    )

    score = sum(bool(x) for x in checks) / len(checks)
    # Optimization can rank candidates, but only a perfect candidate is admission-eligible.
    return float(score)
