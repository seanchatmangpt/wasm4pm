from __future__ import annotations

from typing import Any

EXPECTED_BREEDS = 55
ALLOWED_SURFACES = {"kernel_only", "full_lifecycle", "context_pressure"}


def admit_candidate(candidate: dict[str, Any], inventory: list[str]) -> dict[str, Any]:
    if len(inventory) != EXPECTED_BREEDS or len(set(inventory)) != EXPECTED_BREEDS:
        raise ValueError("REFUSED:CANONICAL_INVENTORY_NOT_EXACTLY_55")
    if candidate.get("breeds") != inventory:
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

    if set(candidate.get("surfaces", [])) != ALLOWED_SURFACES:
        raise ValueError("REFUSED:MISSING_OR_UNKNOWN_MEASUREMENT_SURFACE")

    falsifiers = candidate.get("falsifiers", [])
    if not isinstance(falsifiers, list) or len(falsifiers) < 8:
        raise ValueError("REFUSED:ANTI_HIDING_FALSIFIERS_TOO_WEAK")
    if any(not isinstance(x, str) or not x.strip() for x in falsifiers):
        raise ValueError("REFUSED:EMPTY_FALSIFIER")

    admitted = dict(candidate)
    admitted["expected_breeds"] = EXPECTED_BREEDS
    admitted["expected_measurements"] = EXPECTED_BREEDS * (len(batch_sizes) * 2 + len(context_sizes))
    admitted["authority"] = "SELECT_ONLY"
    admitted["actuation"] = "REFUSED"
    return admitted
