"""The deterministic SELECT -> ADMIT membrane. Zero ``dspy`` import, by design --
mirrors ``benchmark-manufacturing/admission.py``'s exact shape: a pure function,
one :class:`AdmissionRefused` per violated invariant, an admitted/stamped result
on success. This is the load-bearing property carried over from that prior art:
the admission/refusal logic must be independently readable, testable, and
auditable without a DSPy/LM dependency at all.

Schema validation delegates to :mod:`wasm4pm_dspy.models`'s real Pydantic
``BreedInput`` -- the same model the DSPy signature uses as its typed output
field -- rather than duplicating the shape by hand as prose in a signature
description and again as ad-hoc ``isinstance`` checks here. One schema,
checked the same way on both the SELECT and ADMIT sides.

Unlike ``benchmark-manufacturing``'s gate (whose ``actuation`` is always
``"REFUSED"`` -- it only ever authors a benchmark contract for ggen to project,
never runs anything), this gate's admitted result is stamped
``actuation="PENDING_RUN"``: the next real step for an admitted candidate is
``runner.run_admitted_breed_input``, not a refusal.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from wasm4pm_dspy.models import BreedInput
from wasm4pm_dspy.registry import BreedRecord, breed_ids

__all__ = ["AdmissionRefused", "AdmittedBreedInput", "admit_breed_input"]


class AdmissionRefused(RuntimeError):
    """Raised for every violated admission invariant. The message is always
    prefixed ``REFUSED:<REASON>`` so a caller can pattern-match the reason
    without parsing free text, mirroring ``benchmark-manufacturing/admission.py``'s
    ``ValueError("REFUSED:<REASON>")`` convention (raised here as its own type
    instead of a bare ``ValueError`` so callers can catch it specifically)."""


@dataclass(frozen=True)
class AdmittedBreedInput:
    """A candidate that passed every admission check. ``payload`` is the
    validated ``BreedInput``'s plain-dict form (``model_dump(mode="json")``),
    ready to serialize straight into the ``wpm`` CLI's ``--input`` file --
    the runner never has to know Pydantic exists."""

    breed: str
    payload: dict[str, Any]
    authority: str = "SELECT_ONLY"
    actuation: str = "PENDING_RUN"


def admit_breed_input(
    candidate: dict[str, Any],
    registry: list[BreedRecord] | None = None,
) -> AdmittedBreedInput:
    """Admit or refuse a DSPy-proposed breed-selection candidate.

    ``candidate`` is expected to have the shape
    ``{"breed": str, "payload": {...}}``, where ``payload`` is a plain dict
    matching :class:`wasm4pm_dspy.models.BreedInput` (as produced by
    ``model_dump()``) or an equivalent hand-built dict in a test. Every check
    below is independent of any LM call.
    """
    breed = candidate.get("breed")
    if not isinstance(breed, str) or not breed:
        raise AdmissionRefused(f"REFUSED:MISSING_BREED: candidate has no string 'breed' field: {candidate!r}")

    valid_breeds = breed_ids(registry)
    if breed not in valid_breeds:
        raise AdmissionRefused(
            f"REFUSED:UNKNOWN_BREED: '{breed}' is not in the {len(valid_breeds)}-breed "
            "registry -- the LM must only ever propose a breed_id it was shown"
        )

    payload = candidate.get("payload")
    if not isinstance(payload, dict):
        raise AdmissionRefused(f"REFUSED:SCHEMA_INVALID: candidate has no 'payload' object: {candidate!r}")

    try:
        validated = BreedInput.model_validate(payload)
    except ValidationError as exc:
        raise AdmissionRefused(f"REFUSED:SCHEMA_INVALID: {exc}") from exc

    return AdmittedBreedInput(breed=breed, payload=validated.model_dump(mode="json"))
