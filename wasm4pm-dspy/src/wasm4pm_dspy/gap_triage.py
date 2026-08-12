"""Formalizes the other judgment call this session made in prose: given a
real capability-gap finding (e.g. one of the 5-agent audit's findings --
"wasm4pm-bindings-py exists, ~300+ functions, wasm4pm-dspy never imports
it"), decide whether it's ERRC-actionable and where it sits in TOGAF's ADM.

Same discipline as ``breed_encodability.py``/``k8s_theory.py``: the LM
never gets execution authority, and its factual claims never get trusted
un-grounded. The one Explore agent this session that caught its own
false-positive grep hit ("declared" matching DECLARE) rather than trusting
a naive match is the real precedent this module's grounding check
formalizes -- a claim that a capability is "currently unused" is verified
against a real, literal source search, not accepted from the LM.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import dspy

__all__ = [
    "AdmPhase",
    "ClassifyErrcAction",
    "ScoreActionability",
    "MapToAdmPhase",
    "verify_unused_claim",
    "GapTriageProgram",
    "GapVerdict",
    "triage_capability_gaps",
]

AdmPhase = Literal[
    "preliminary_requirements_management",
    "phase_a_vision",
    "phase_b_business",
    "phase_c_data_application",
    "phase_d_technology",
    "phase_e_opportunities_solutions",
    "phase_f_migration_planning",
    "phase_g_implementation_governance",
    "phase_h_change_management",
]

_WASM4PM_DSPY_SRC = Path(__file__).resolve().parent


def verify_unused_claim(search_terms: list[str], src_dir: Path = _WASM4PM_DSPY_SRC) -> bool:
    """Real, literal search over wasm4pm-dspy's own source tree for any of
    search_terms -- returns True (claim of "unused" upheld) only if NONE of
    the terms appear in any .py file under src_dir. This is the real check
    behind ScoreActionability: an LM's "currently unused" claim is only as
    good as this actually finding nothing, the same grounding discipline
    one of this session's own Explore agents used by hand when it caught
    and reported a false-positive grep hit rather than trusting the match."""
    patterns = [re.compile(re.escape(term), re.IGNORECASE) for term in search_terms]
    for path in src_dir.rglob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for pattern in patterns:
            if pattern.search(text):
                return False
    return True


class ClassifyErrcAction(dspy.Signature):
    """Classify a real capability-gap finding using the Eliminate-Reduce-
    Raise-Create framework: does wasm4pm-dspy's current use of
    capability_description need to eliminate/reduce something, raise an
    existing capability's role, create something new, or is it fine as-is
    (skip)?"""

    capability_description: str = dspy.InputField(desc="What the real capability is, from source")
    current_usage_evidence: str = dspy.InputField(desc="Real evidence of whether/how wasm4pm-dspy uses it today")
    action: Literal["eliminate", "reduce", "raise", "create", "skip"] = dspy.OutputField()
    justification: str = dspy.OutputField()


class ScoreActionability(dspy.Signature):
    """Judge whether a finding is a real, worth-acting-on gap versus a
    confirmed, expected non-overlap (e.g. process-mining algorithms having
    no reason to be used by a k8s-cognition-breed package is expected, not
    a gap; a generic reusable utility being silently reimplemented instead
    of reused IS a real gap)."""

    finding: str = dspy.InputField()
    claimed_currently_unused: bool = dspy.InputField(desc="Whether the finding claims this capability goes unused")
    actionable: bool = dspy.OutputField()
    reason: str = dspy.OutputField()


class MapToAdmPhase(dspy.Signature):
    """Map a real capability to the TOGAF ADM phase it most honestly
    corresponds to, grounded in the real source excerpt describing it --
    not a guess from the capability's name alone."""

    capability_description: str = dspy.InputField()
    real_source_excerpt: str = dspy.InputField(desc="Real, quoted source/doc text grounding the mapping")
    phase: AdmPhase = dspy.OutputField()
    justification: str = dspy.OutputField()
    confidence: float = dspy.OutputField(desc="0.0-1.0, honest about mapping ambiguity")


class GapTriageProgram(dspy.Module):
    """classify ERRC action -> score actionability (grounded by a real
    source search, not LM self-report) -> map to ADM phase. All three are
    independent judgment signatures; the actionability score is the only
    one with a real, non-LM check behind it, since ERRC action and phase
    mapping are inherently classification/interpretation calls with no
    mechanical ground truth to verify against -- named honestly as such,
    not disguised as more grounded than they are."""

    def __init__(self) -> None:
        super().__init__()
        self.classify_errc = dspy.ChainOfThought(ClassifyErrcAction)
        self.score_actionability = dspy.ChainOfThought(ScoreActionability)
        self.map_phase = dspy.ChainOfThought(MapToAdmPhase)

    def forward(
        self,
        capability_description: str,
        current_usage_evidence: str,
        finding: str,
        claimed_currently_unused: bool,
        real_source_excerpt: str,
        unused_search_terms: list[str],
    ) -> dspy.Prediction:
        errc = self.classify_errc(
            capability_description=capability_description, current_usage_evidence=current_usage_evidence
        )
        actionability = self.score_actionability(finding=finding, claimed_currently_unused=claimed_currently_unused)

        # Real check: if the finding claims "unused" but a real search
        # finds it IS referenced, the LM's actionability score is grounded
        # against reality, not accepted as-is.
        real_unused = verify_unused_claim(unused_search_terms) if claimed_currently_unused else None
        actionable = actionability.actionable
        reason = actionability.reason
        if real_unused is False:
            actionable = False
            reason = (
                f"real search found {unused_search_terms} referenced in wasm4pm-dspy/src -- "
                f"the 'currently unused' claim behind this finding does not hold; "
                f"original LM reason was: {actionability.reason}"
            )

        phase = self.map_phase(
            capability_description=capability_description, real_source_excerpt=real_source_excerpt
        )

        return dspy.Prediction(
            errc_action=errc.action,
            errc_justification=errc.justification,
            actionable=actionable,
            actionability_reason=reason,
            real_unused_verified=real_unused,
            adm_phase=phase.phase,
            adm_justification=phase.justification,
            adm_confidence=phase.confidence,
        )


@dataclass(frozen=True)
class GapVerdict:
    finding: str
    errc_action: str
    errc_justification: str
    actionable: bool
    actionability_reason: str
    real_unused_verified: bool | None
    adm_phase: str
    adm_justification: str
    adm_confidence: float


def triage_capability_gaps(
    program: GapTriageProgram,
    findings: list[dict],
) -> list[GapVerdict]:
    """PROPOSAL ONLY -- produces a scored, phase-tagged backlog; writes
    nothing, builds nothing. Each item in findings is a dict with keys
    capability_description, current_usage_evidence, finding,
    claimed_currently_unused, real_source_excerpt, unused_search_terms."""
    verdicts: list[GapVerdict] = []
    for item in findings:
        prediction = program(
            capability_description=item["capability_description"],
            current_usage_evidence=item["current_usage_evidence"],
            finding=item["finding"],
            claimed_currently_unused=item["claimed_currently_unused"],
            real_source_excerpt=item["real_source_excerpt"],
            unused_search_terms=item["unused_search_terms"],
        )
        verdicts.append(
            GapVerdict(
                finding=item["finding"],
                errc_action=prediction.errc_action,
                errc_justification=prediction.errc_justification,
                actionable=prediction.actionable,
                actionability_reason=prediction.actionability_reason,
                real_unused_verified=prediction.real_unused_verified,
                adm_phase=prediction.adm_phase,
                adm_justification=prediction.adm_justification,
                adm_confidence=prediction.adm_confidence,
            )
        )
    return verdicts
