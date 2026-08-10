"""ORCHESTRATE: fan out real cognition breeds concurrently over
already-encoded, breed-specific K8s-incident payloads, then combine their
real outputs via two distinct real combiner breeds -- ``meta_reasoning``
(conflict-aware confidence-weighted vote) and ``hearsay`` (blackboard
noisy-OR corroboration fusion).

Zero ``dspy`` dependency -- pure ``asyncio`` over
:mod:`wasm4pm_dspy.admission` / :mod:`wasm4pm_dspy.runner`, the same real,
already-proven primitives ``test_k8s_max_breed_projections_chicago.py`` uses
for each breed individually.

Deliberately NOT included: a generic incident -> BreedInput translator. Each
breed's real encoding is inherently different (CNF clauses for `sat_cdcl`,
CF-weighted rules for `mycin`, STRIPS operators for `strips`, ...) -- there
is no lossless shared representation, and building one would mean this
module deciding what a given piece of evidence "means" for every formalism
at once, which is exactly the kind of narrative-driven translation the
K8s-MAX breed-projection tests' hardcoding fix removed at the test level.
Callers supply each specialist's payload already encoded in that breed's own
real shape; this module only fans the calls out, extracts a confidence per
result, and combines.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.runner import CognitionRunResult, run_admitted_breed_input

__all__ = [
    "OrchestratorError",
    "SpecialistReport",
    "OrchestrationResult",
    "extract_confidence",
    "run_specialists",
    "build_meta_reasoning_payload",
    "combine_via_meta_reasoning",
    "build_hearsay_payload",
    "combine_via_hearsay",
    "diagnose",
]

# Breeds with no graded-confidence concept in their own output (exact
# verdict / boundary-set breeds) -- see extract_confidence for why 1.0 here
# is a real, stated modeling choice and not a fabricated number.
_EXACT_VERDICT_BREEDS = frozenset({"sat_cdcl", "strips", "version_space"})


class OrchestratorError(RuntimeError):
    """Raised for orchestration-level failures (e.g. too few specialist
    reports to combine) -- never let these surface as an opaque NoEvidence
    from the underlying CLI, which would hide that the failure was in this
    module's own precondition, not the breed's execution."""


@dataclass(frozen=True)
class SpecialistReport:
    breed: str
    result: CognitionRunResult
    confidence: float


@dataclass(frozen=True)
class OrchestrationResult:
    specialists: list[SpecialistReport] = field(default_factory=list)
    meta: CognitionRunResult | None = None
    hearsay: CognitionRunResult | None = None


def extract_confidence(breed: str, result: CognitionRunResult) -> float:
    """Derive a real confidence from ``result``'s own output -- never a
    fabricated stand-in.

    - ``mycin``: the terminal conclusion's own chained certainty factor,
      parsed from the real ``cf=<float>`` substring in
      ``inference_trace`` (same format
      ``test_k8s_max_breed_projections_chicago.py`` already asserts on).
    - ``dendral`` / ``cbr``: the winning candidate's own real ``score``.
    - ``sat_cdcl`` / ``strips`` / ``version_space``: these breeds report an
      exact verdict (SAT/UNSAT; a plan exists or it doesn't; a boundary set
      is non-empty or it isn't) -- they have no concept of partial belief at
      all, so ``1.0`` on a successful, non-empty result is a real, explicit
      modeling choice ("this breed is exactly as confident as its formalism
      allows it to be"), not an invented number standing in for missing
      data. ``0.0`` when the breed produced no evidence for its verdict.
    """
    if breed in _EXACT_VERDICT_BREEDS:
        return 1.0 if result.status == "ok" and result.selected is not None else 0.0

    if breed == "mycin":
        selected = result.selected
        if selected is None:
            return 0.0
        for step in result.inference_trace:
            detail = step.get("detail", "")
            if selected in detail and "cf=" in detail:
                try:
                    return float(detail.split("cf=", 1)[1].split()[0].rstrip(")"))
                except (IndexError, ValueError):
                    continue
        return 0.0

    if breed in ("dendral", "cbr"):
        candidates = result.raw_output.get("candidates", [])
        for candidate in candidates:
            if candidate.get("id") == result.selected or candidate.get("architecture") == result.selected:
                return float(candidate.get("score", 0.0))
        return 0.0

    # Unknown breed: no established confidence extraction -- 0.0 is honest
    # (absence of evidence for a graded belief), not a guess at what one
    # would be.
    return 0.0


async def run_specialists(payloads_by_breed: dict[str, dict[str, Any]]) -> list[SpecialistReport]:
    """Fan out real ``admit_breed_input`` + ``run_admitted_breed_input``
    calls concurrently via ``asyncio.gather``. Each call owns its own
    tempfile and subprocess (verified in ``runner.py`` -- no shared mutable
    state), so concurrent dispatch is safe at the Python level; a specialist
    whose run raises (``NoEvidence`` or otherwise) propagates that exception
    to the caller rather than being silently dropped.
    """

    async def _run_one(breed: str, payload: dict[str, Any]) -> SpecialistReport:
        admitted = admit_breed_input({"breed": breed, "payload": payload})
        result = await run_admitted_breed_input(admitted)
        return SpecialistReport(breed=breed, result=result, confidence=extract_confidence(breed, result))

    reports = await asyncio.gather(*(_run_one(breed, payload) for breed, payload in payloads_by_breed.items()))
    return list(reports)


def _fallback_token(report: SpecialistReport) -> str:
    return report.result.selected if report.result.selected is not None else f"{report.breed}-no-selection"


def build_meta_reasoning_payload(reports: list[SpecialistReport]) -> dict[str, Any]:
    """``meta_reasoning``'s real contract: ``breed:<id>:conclusion`` /
    ``breed:<id>:confidence`` fact pairs, >=2 reports required."""
    facts: list[dict[str, str]] = []
    for report in reports:
        facts.append({"key": f"breed:{report.breed}:conclusion", "value": _fallback_token(report)})
        facts.append({"key": f"breed:{report.breed}:confidence", "value": f"{report.confidence}"})
    return {"intent": "", "facts": facts, "rules": [], "cases": [], "goals": [], "candidates": [], "state": []}


async def combine_via_meta_reasoning(reports: list[SpecialistReport]) -> CognitionRunResult:
    if len(reports) < 2:
        raise OrchestratorError(
            f"meta_reasoning requires at least 2 specialist reports to combine, got {len(reports)}"
        )
    payload = build_meta_reasoning_payload(reports)
    admitted = admit_breed_input({"breed": "meta_reasoning", "payload": payload})
    return await run_admitted_breed_input(admitted)


def build_hearsay_payload(reports: list[SpecialistReport]) -> dict[str, Any]:
    """Model each specialist's real conclusion as a seed hypothesis at the
    ``breed`` level; a single real corroboration rule promotes the blackboard
    to a ``diagnosis`` level whenever the ``breed``-level hypothesis space is
    triggered -- this uses hearsay's real level-wildcard trigger
    (``"{level}-hypotheses"``, the mechanism added by this session's
    hearsay STOP-criterion fix), not a narrative rule about which breed's
    answer is "right".
    """
    facts = [{"key": "breed", "value": _fallback_token(report)} for report in reports]
    rules = [
        {
            "id": "promote-breed-corroboration",
            "premise": ["breed-hypotheses"],
            "conclusion": f"diagnosis:{'+'.join(sorted(_fallback_token(r) for r in reports))}",
            "certainty": 0.9,
        }
    ]
    return {"intent": "", "facts": facts, "rules": rules, "cases": [], "goals": [], "candidates": [], "state": []}


async def combine_via_hearsay(reports: list[SpecialistReport]) -> CognitionRunResult:
    if not reports:
        raise OrchestratorError("hearsay requires at least 1 specialist report to combine, got 0")
    payload = build_hearsay_payload(reports)
    admitted = admit_breed_input({"breed": "hearsay", "payload": payload})
    return await run_admitted_breed_input(admitted)


async def diagnose(payloads_by_breed: dict[str, dict[str, Any]]) -> OrchestrationResult:
    """Top-level entry point: fan out real specialists, then combine via both
    real combiner breeds. ``meta`` is ``None`` when fewer than 2 specialists
    ran (its real precondition); ``hearsay`` is ``None`` only when there were
    no specialists at all."""
    reports = await run_specialists(payloads_by_breed)
    meta = await combine_via_meta_reasoning(reports) if len(reports) >= 2 else None
    hearsay = await combine_via_hearsay(reports) if reports else None
    return OrchestrationResult(specialists=reports, meta=meta, hearsay=hearsay)
