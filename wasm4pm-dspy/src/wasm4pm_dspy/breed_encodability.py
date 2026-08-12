"""Formalizes a judgment call this session made in prose, by hand, over and
over: "is this breed REAL_FIT or NO_FIT for k8s anomaly encoding, and what
would its honest encoding be?" -- the exact reasoning that grew
``k8s_state.py``'s ``DETERMINISTIC_ENCODER_BREEDS`` from 6 to 19 (and
correctly refused ``dempster_shafer``/``soar``/``problog``/``mdp``/``ilp``).

Same discipline as ``k8s_theory.py``, reused UNCHANGED, not reimplemented:
the LM never gets execution authority. This module only ever produces a
typed classification (``fit``) plus, via ``K8sIncidentEncodingProgram``
(imported, not duplicated), a typed ``BreedInput`` -- both go through the
real ``admit_breed_input``/``run_admitted_breed_input`` pipeline exactly
like every other specialist call in this package. Nothing here writes
Python code, and nothing here writes to ``k8s_state.py``'s registry --
this produces a report a human acts on, the same SELECT != DO boundary
``admission.py``/``autonomic.py`` already enforce.

The "real check, not LM self-report" for a classification is the same
discipline that caught this session's own real ``htn_planning``/
``fuzzy_logic`` bugs: don't trust "this should work," actually run it. A
``real_fit``/``marginal`` verdict is only as good as whatever real
admit+run trial backs it; a verdict that claims fit but real-fails is
itself evidence fed to a critique stage, not silently accepted.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Literal

import dspy

from wasm4pm_dspy.admission import AdmissionRefused, admit_breed_input
from wasm4pm_dspy.k8s_theory import (
    K8sIncidentEncodingProgram,
    _BREEDS_SRC_DIR,
    encoding_notes_for,
)
from wasm4pm_dspy.runner import NoEvidence, run_admitted_breed_input

__all__ = [
    "TARGET_DOMAIN_DESCRIPTION",
    "ClassifyBreedEncodability",
    "CritiqueEncodabilityMismatch",
    "field_access_for",
    "BreedEncodabilityProgram",
    "BreedEncodabilityVerdict",
    "propose_encodability_report",
]

# Fixed, honest description of what k8s_state.py's encoders actually have to
# work with -- the same real constraint this session's own breed-by-breed
# survey (REAL_FIT/NO_FIT) reasoned against, made an explicit input instead
# of implicit context a human had to already know.
TARGET_DOMAIN_DESCRIPTION = (
    "A flat, single-snapshot list of K8sAnomaly records (kind, object_name, "
    "namespace, relation_class, field, observed, expected, detail) plus an "
    "optional already-classified fault_hint string. No timestamps or event "
    "ordering, no multi-agent/multi-source belief structure, no natural-"
    "language content beyond short field/detail strings, no probability or "
    "utility values of any kind in the source data."
)

_FIELD_ACCESS_PATTERN = re.compile(r"input\.(facts|rules|state|goals|candidates|cases)\b")


def field_access_for(breed_id: str) -> str:
    """Real, parsed-not-guessed: which BreedInput fields breed_id's own
    Rust run() actually reads, found by scanning its .rs source for
    `input.<field>` accesses -- the same mechanic this session's Explore
    agents used by hand when auditing breed source. Returns a comma-joined
    sorted list of field names, or an honest empty string if the source
    file isn't found or accesses none of these fields directly."""
    path = _BREEDS_SRC_DIR / f"{breed_id}.rs"
    if not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8")
    fields = sorted(set(_FIELD_ACCESS_PATTERN.findall(text)))
    return ", ".join(fields)


class ClassifyBreedEncodability(dspy.Signature):
    """Judge whether target_breed's real reasoning paradigm (per its own
    doc comment and which BreedInput fields it actually reads) has an
    honest, non-fabricated encoding from target_domain_description's data
    shape. Prefer 'no_fit' over inventing structure the domain doesn't
    have (timestamps, multi-agent belief sets, probabilities) -- the same
    discipline that correctly refused dempster_shafer/soar/problog/mdp/ilp
    this session."""

    breed_doc_comment: str = dspy.InputField(desc="The breed's own real //! / /// module doc comment")
    breed_input_field_access: str = dspy.InputField(
        desc="Comma-joined BreedInput fields (facts/rules/state/goals/candidates/cases) the breed's real run() reads"
    )
    target_domain_description: str = dspy.InputField(desc="What the source data actually looks like")
    fit: Literal["real_fit", "marginal", "no_fit"] = dspy.OutputField()
    reasoning: str = dspy.OutputField(desc="Why this fit level, citing the real doc comment and field access")
    fabrication_risk: str = dspy.OutputField(
        desc="What would have to be invented (if anything) to force an encoding -- 'none' if fit is honest"
    )


class CritiqueEncodabilityMismatch(dspy.Signature):
    """A classification claimed real_fit/marginal, but a real trial
    encoding (via K8sIncidentEncodingProgram, admitted and run for real)
    failed with a real precondition/admission error. Explain the mismatch
    using the real error text and propose a revised, more honest fit
    level."""

    breed_doc_comment: str = dspy.InputField()
    original_fit: str = dspy.InputField(desc="The classification that was made")
    original_reasoning: str = dspy.InputField()
    real_failure_error: str = dspy.InputField(desc="The real AdmissionRefused/NoEvidence error text from a live trial")
    revised_fit: Literal["real_fit", "marginal", "no_fit"] = dspy.OutputField()
    revised_reasoning: str = dspy.OutputField(desc="Why the real failure changes the verdict")


class BreedEncodabilityProgram(dspy.Module):
    """classify -> (real trial: propose+admit+run via the unmodified
    K8sIncidentEncodingProgram) -> critique-and-revise only when the real
    trial disagrees with the classification. No LM call ever produces or
    executes code; only typed classifications and, via the reused
    encoding program, typed BreedInput objects."""

    def __init__(self) -> None:
        super().__init__()
        self.classify = dspy.ChainOfThought(ClassifyBreedEncodability)
        self.critique = dspy.ChainOfThought(CritiqueEncodabilityMismatch)
        self.encoder = K8sIncidentEncodingProgram()

    def forward(self, breed: str, trial_incident: str) -> dspy.Prediction:
        doc_comment = encoding_notes_for(breed)
        field_access = field_access_for(breed)
        classification = self.classify(
            breed_doc_comment=doc_comment,
            breed_input_field_access=field_access,
            target_domain_description=TARGET_DOMAIN_DESCRIPTION,
        )

        if classification.fit == "no_fit":
            # Honest refusal needs no real trial to confirm -- attempting
            # one would spend an LM+subprocess call on a breed already
            # correctly judged unencodable.
            return dspy.Prediction(
                fit=classification.fit,
                reasoning=classification.reasoning,
                fabrication_risk=classification.fabrication_risk,
                real_trial_error=None,
            )

        real_error = self._real_trial(breed, trial_incident)
        if real_error is None:
            return dspy.Prediction(
                fit=classification.fit,
                reasoning=classification.reasoning,
                fabrication_risk=classification.fabrication_risk,
                real_trial_error=None,
            )

        revision = self.critique(
            breed_doc_comment=doc_comment,
            original_fit=classification.fit,
            original_reasoning=classification.reasoning,
            real_failure_error=real_error,
        )
        return dspy.Prediction(
            fit=revision.revised_fit,
            reasoning=revision.revised_reasoning,
            fabrication_risk=classification.fabrication_risk,
            real_trial_error=real_error,
        )

    def _real_trial(self, breed: str, trial_incident: str) -> str | None:
        """Real admit+run trial via the unmodified encoding program.
        Returns the real error text on failure, None on success -- never
        an LM's opinion about whether it would have worked."""
        prediction = self.encoder(
            incident=trial_incident, target_breed=breed, encoding_notes=encoding_notes_for(breed)
        )
        candidate = {"breed": breed, "payload": prediction.breed_input.model_dump(mode="json")}
        try:
            admitted = admit_breed_input(candidate)
        except AdmissionRefused as exc:
            return str(exc)
        try:
            asyncio.run(run_admitted_breed_input(admitted))
        except NoEvidence as exc:
            return str(exc)
        return None


@dataclass(frozen=True)
class BreedEncodabilityVerdict:
    breed: str
    fit: str
    reasoning: str
    fabrication_risk: str
    real_trial_error: str | None


def propose_encodability_report(
    program: BreedEncodabilityProgram,
    breeds: tuple[str, ...],
    trial_incident: str,
) -> list[BreedEncodabilityVerdict]:
    """PROPOSAL ONLY -- never writes to k8s_state.py's registry. Produces
    one verdict per breed a human (or architecture_vision.py's proposal
    stage) can act on."""
    verdicts: list[BreedEncodabilityVerdict] = []
    for breed in breeds:
        prediction = program(breed=breed, trial_incident=trial_incident)
        verdicts.append(
            BreedEncodabilityVerdict(
                breed=breed,
                fit=prediction.fit,
                reasoning=prediction.reasoning,
                fabrication_risk=prediction.fabrication_risk,
                real_trial_error=prediction.real_trial_error,
            )
        )
    return verdicts
