"""Theory-test module: can a real LLM do the per-breed K8s-incident encoding
``orchestrator.py`` deliberately declined to hand-build generically?

``orchestrator.py``'s design explicitly leaves each specialist breed's
encoding (CNF clauses for `sat_cdcl`, CF rules for `mycin`, STRIPS operators
for `strips`, ...) as a visible, hand-authored call-site concern -- building
one generic incident->BreedInput translator would mean this codebase
deciding, narratively, what a piece of evidence "means" for every formalism
at once, the same failure mode the DENDRAL/CBR breed-projection test fix
eliminated. This module tests a different, legitimate way to do that
encoding: ask an LLM to do it per breed, from real, documented format
guidance (not a planted answer), and see whether the real orchestrator
combiners (``meta_reasoning``, ``hearsay``) still produce something coherent
on LLM-proposed (not hand-crafted) evidence.

Explicitly exploratory: this does NOT claim the encoding is reliable. Same
honesty discipline as ``judge.py`` -- a breed whose LLM-proposed payload
fails admission or execution is a real, reported finding, not hidden or
silently retried.

Requires the ``llm`` extra (imports ``dspy``). Never imported by
``admission.py``/``runner.py``/``orchestrator.py`` -- this module only calls
those, never the reverse.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import dspy

from wasm4pm_dspy.admission import AdmissionRefused, admit_breed_input
from wasm4pm_dspy.models import BreedInput
from wasm4pm_dspy.orchestrator import (
    OrchestrationResult,
    SpecialistReport,
    combine_via_hearsay,
    combine_via_meta_reasoning,
    extract_confidence,
)
from wasm4pm_dspy.registry import breed_ids
from wasm4pm_dspy.runner import NoEvidence, run_admitted_breed_input

__all__ = [
    "SPECIALIST_BREEDS",
    "encoding_notes_for",
    "NLIncidentToBreedPayload",
    "CritiqueBreedPayload",
    "RepairBreedPayload",
    "structural_problems",
    "K8sIncidentEncodingProgram",
    "SpecialistOutcome",
    "propose_and_run_specialists",
    "diagnose_from_nl",
]

# Real, already-proven input conventions for the 6 originally-scoped Section-5
# breeds, paraphrased from the Rust source read this session and exercised in
# test_k8s_max_breed_projections_chicago.py -- guidance teaching the LM a
# real external format, not a narrative answer planted for it to echo back.
# Higher fidelity than the doc-comment fallback below (deep-read + cross-
# checked against a real passing fixture/test); kept as an override table.
_VERIFIED_ENCODING_NOTES: dict[str, str] = {
    "sat_cdcl": (
        "facts are keyed `clause:00`, `clause:01`, ... (zero-padded index); each "
        "value is a DIMACS-style space-separated literal string, e.g. `1 -2 3` "
        "means (var1 OR NOT var2 OR var3). Positive integer = variable true, "
        "negative = variable false. No other fields are used."
    ),
    "version_space": (
        "facts include one `vs:attrs` entry (comma-joined attribute names) and "
        "one or more `vs:example:N` entries (N starting at 1), each value a "
        "comma-joined list of attribute values for that example followed by "
        "`:+` (positive/consistent observation) or `:-` (negative/disconfirming "
        "observation), e.g. `Match,Match:+`."
    ),
    "dendral": (
        "candidates is a list of {id, score, eliminated: false} -- id should be "
        "a short slug naming a plausible root cause. facts may include entries "
        "keyed `constraint` with value `forbid:<candidate-id>` for each "
        "candidate that observed evidence rules out."
    ),
    "mycin": (
        "facts are keyed `signal` (repeated, once per observed symptom), value "
        "= the symptom token. rules chain: each rule has `premise` (list of "
        "symptom/conclusion tokens that must all be present), `conclusion` "
        "(a `key=value` string), and `certainty` in [0,1]. A rule's conclusion "
        "can be another rule's premise token to build a diagnosis->action chain."
    ),
    "strips": (
        "state is a list of {predicate, value} atoms describing the current "
        "situation. goals is a list of {id, predicate, value} describing the "
        "desired end state. rules are action operators: `premise` = list of "
        "state atoms required (as `predicate=value` strings), `conclusion` = "
        "semicolon-joined effects, `!predicate=value` meaning that atom is "
        "removed, otherwise added."
    ),
    "cbr": (
        "cases is a list of {id, intent, architecture, outcome_score, facts} "
        "-- each a past precedent. The query's own top-level facts describe "
        "the current incident using the SAME fact keys the cases use, so real "
        "Jaccard overlap can be computed. candidates should list each case id."
    ),
}

# Combinatorial-maximalism scope: every registered breed, not just the 6
# originally hand-verified ones. Parsed from the real registry, never a
# retyped literal list -- same discipline as _load_real_fault_ids() earlier
# this session.
SPECIALIST_BREEDS: tuple[str, ...] = tuple(sorted(breed_ids()))

_BREEDS_SRC_DIR = (
    Path(__file__).resolve().parents[3] / "crates" / "wasm4pm-cognition" / "src" / "breeds"
)

_GENERIC_ENCODING_NOTE = (
    "no verified encoding convention is available for this breed -- use the "
    "standard BreedInput fields (facts: list of {key, value}; rules: list of "
    "{id, premise, conclusion, certainty}; cases: list of {id, intent, "
    "architecture, outcome_score, facts}; goals: list of {id, predicate, "
    "value}; candidates: list of {id, score, eliminated}; state: list of "
    "{predicate, value}) in whatever combination best fits this breed's "
    "named reasoning paradigm. If no combination plausibly fits, prefer "
    "producing an empty/minimal payload over inventing a fake fit."
)


def _load_breed_doc_comment(breed_id: str) -> str:
    """Real, parsed-not-invented encoding guidance: the breed's own real
    ``//!``/``///`` module doc comment, read directly from its .rs source at
    ``crates/wasm4pm-cognition/src/breeds/<breed_id>.rs``. Falls back to
    ``_GENERIC_ENCODING_NOTE`` if the file or a doc comment isn't found --
    an honest "no verified guidance" signal, never a fabricated convention
    for a paradigm this module hasn't actually read source for."""
    path = _BREEDS_SRC_DIR / f"{breed_id}.rs"
    if not path.is_file():
        return _GENERIC_ENCODING_NOTE

    lines: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("//!") or stripped.startswith("///"):
            lines.append(re.sub(r"^//[!/]\s?", "", stripped))
        elif lines:
            break  # doc comment block ended

    note = " ".join(lines).strip()
    return note if note else _GENERIC_ENCODING_NOTE


def encoding_notes_for(breed_id: str) -> str:
    """The real encoding guidance for ``breed_id`` -- the hand-verified note
    for the 6 originally-scoped breeds, else the breed's own real doc
    comment (parsed live), else an honest generic fallback."""
    if breed_id in _VERIFIED_ENCODING_NOTES:
        return _VERIFIED_ENCODING_NOTES[breed_id]
    return _load_breed_doc_comment(breed_id)


class NLIncidentToBreedPayload(dspy.Signature):
    """Encode a free-text K8s incident description as a BreedInput matching
    target_breed's real, documented fact/rule/state convention (encoding_notes).
    Only use the fields and formats encoding_notes describes -- do not invent
    a different encoding for this breed."""

    incident: str = dspy.InputField(desc="Free-text description of the observed K8s incident")
    target_breed: str = dspy.InputField(desc="Which breed's convention to encode for")
    encoding_notes: str = dspy.InputField(desc="That breed's real, documented input-format convention")
    breed_input: BreedInput = dspy.OutputField(
        desc="A BreedInput encoding the incident strictly per encoding_notes' convention for target_breed"
    )


class CritiqueBreedPayload(dspy.Signature):
    """Explain why a proposed BreedInput fails a real, computed structural
    check for target_breed (structural_problems) -- name the specific missing
    piece (e.g. "no rules were proposed" or "no rule chain reaches the
    stated goal from the stated state") so repair can fix exactly that."""

    incident: str = dspy.InputField(desc="The original free-text incident")
    target_breed: str = dspy.InputField(desc="Which breed's convention this was encoded for")
    encoding_notes: str = dspy.InputField(desc="That breed's real, documented input-format convention")
    breed_input: BreedInput = dspy.InputField(desc="The candidate BreedInput that failed the structural check")
    structural_problems: list[str] = dspy.InputField(
        desc="Real, computed (not LM-guessed) list of structural problems found in breed_input"
    )
    critique: str = dspy.OutputField(desc="Specific, actionable critique addressing each structural problem")


class RepairBreedPayload(dspy.Signature):
    """Repair a proposed BreedInput using a critique of its real, computed
    structural problems -- the repaired payload must resolve every named
    problem while still following encoding_notes' convention."""

    incident: str = dspy.InputField(desc="The original free-text incident")
    target_breed: str = dspy.InputField(desc="Which breed's convention to encode for")
    encoding_notes: str = dspy.InputField(desc="That breed's real, documented input-format convention")
    breed_input: BreedInput = dspy.InputField(desc="The candidate BreedInput that failed the structural check")
    critique: str = dspy.InputField(desc="Critique naming the specific structural problems to fix")
    repaired_breed_input: BreedInput = dspy.OutputField(
        desc="Repaired BreedInput resolving every problem named in critique, still per encoding_notes"
    )


def _strips_goal_reachable(breed_input: BreedInput, max_depth: int = 16) -> bool:
    """Pure-Python forward-chaining reachability check over the same
    premise/conclusion shape strips.rs actually consumes (`predicate=value`
    premise strings; `;`-joined conclusion effects, `!predicate=value` =
    removed, otherwise added) -- computed for real, not LM-guessed, mirroring
    `wasm4pm_dspy.models.terminal_conclusions`'s "compute it, don't ask the
    LM to self-report" discipline. Not a claim of exact parity with
    strips.rs's own search (no goal-decomposition/subgoal ordering), just a
    real, cheap check for the specific failure mode this session's live run
    exhibited: proposed rules that can never reach the stated goal at all.
    """
    facts = {f"{atom.predicate}={atom.value}" for atom in breed_input.state}
    goal_atoms = {f"{g.predicate}={g.value}" for g in breed_input.goals}
    if not goal_atoms:
        return True  # nothing to reach

    for _ in range(max_depth):
        if goal_atoms <= facts:
            return True
        fired = False
        for rule in breed_input.rules:
            if set(rule.premise) <= facts:
                for effect in rule.conclusion.split(";"):
                    effect = effect.strip()
                    if not effect:
                        continue
                    if effect.startswith("!"):
                        facts.discard(effect[1:])
                    elif effect not in facts:
                        facts.add(effect)
                        fired = True
        if not fired:
            break
    return goal_atoms <= facts


def structural_problems(breed: str, breed_input: BreedInput) -> list[str]:
    """Real, computed structural checks per breed -- only the failure modes
    this session's live run actually exhibited. Other breeds pass through
    unchecked (their live run already succeeded; adding speculative checks
    for breeds with no observed failure would be guessing, not fixing)."""
    problems: list[str] = []
    if breed == "mycin" and not breed_input.rules:
        problems.append("no rules were proposed -- MYCIN requires at least one rule to fire")
    if breed == "strips" and breed_input.goals and not _strips_goal_reachable(breed_input):
        problems.append(
            "no proposed rule chain reaches the stated goal(s) from the stated state "
            "within a bounded forward-chaining search"
        )
    return problems


class K8sIncidentEncodingProgram(dspy.Module):
    """propose -> (real, computed structural check) -> critique -> repair,
    but critique/repair only run when the structural check actually finds a
    problem (per breed) -- no LM call spent on breeds that already produced
    a structurally sound payload."""

    def __init__(self) -> None:
        super().__init__()
        self.propose = dspy.ChainOfThought(NLIncidentToBreedPayload)
        self.critique = dspy.ChainOfThought(CritiqueBreedPayload)
        self.repair = dspy.ChainOfThought(RepairBreedPayload)

    def forward(self, incident: str, target_breed: str, encoding_notes: str) -> dspy.Prediction:
        proposal = self.propose(incident=incident, target_breed=target_breed, encoding_notes=encoding_notes)
        problems = structural_problems(target_breed, proposal.breed_input)
        if not problems:
            return dspy.Prediction(breed_input=proposal.breed_input, structural_problems=[], critique=None)

        critique = self.critique(
            incident=incident,
            target_breed=target_breed,
            encoding_notes=encoding_notes,
            breed_input=proposal.breed_input,
            structural_problems=problems,
        )
        repaired = self.repair(
            incident=incident,
            target_breed=target_breed,
            encoding_notes=encoding_notes,
            breed_input=proposal.breed_input,
            critique=critique.critique,
        )
        return dspy.Prediction(
            breed_input=repaired.repaired_breed_input,
            structural_problems=problems,
            critique=critique.critique,
        )


@dataclass(frozen=True)
class SpecialistOutcome:
    breed: str
    status: str  # "ok" | "admission_refused" | "no_evidence"
    report: SpecialistReport | None
    error: str | None


async def propose_and_run_specialists(
    program: K8sIncidentEncodingProgram,
    incident: str,
    target_breeds: tuple[str, ...] = SPECIALIST_BREEDS,
) -> list[SpecialistOutcome]:
    """For each target breed: propose an encoding via the real LLM, then try
    real admission and execution. Every failure mode is caught and reported
    as a real, typed outcome -- never silently retried or hidden."""
    outcomes: list[SpecialistOutcome] = []
    for breed in target_breeds:
        prediction = program(incident=incident, target_breed=breed, encoding_notes=encoding_notes_for(breed))
        candidate = {"breed": breed, "payload": prediction.breed_input.model_dump(mode="json")}

        try:
            admitted = admit_breed_input(candidate)
        except AdmissionRefused as exc:
            outcomes.append(SpecialistOutcome(breed=breed, status="admission_refused", report=None, error=str(exc)))
            continue

        try:
            result = await run_admitted_breed_input(admitted)
        except NoEvidence as exc:
            outcomes.append(SpecialistOutcome(breed=breed, status="no_evidence", report=None, error=str(exc)))
            continue

        report = SpecialistReport(breed=breed, result=result, confidence=extract_confidence(breed, result))
        outcomes.append(SpecialistOutcome(breed=breed, status="ok", report=report, error=None))

    return outcomes


async def diagnose_from_nl(
    program: K8sIncidentEncodingProgram,
    incident: str,
    target_breeds: tuple[str, ...] = SPECIALIST_BREEDS,
) -> tuple[list[SpecialistOutcome], OrchestrationResult]:
    """Full theory-test pipeline: LLM-encode, run each real specialist with
    per-breed failure tolerance, then combine whichever succeeded via the
    real, unmodified orchestrator combiners."""
    outcomes = await propose_and_run_specialists(program, incident, target_breeds)
    ok_reports = [o.report for o in outcomes if o.status == "ok" and o.report is not None]

    meta = await combine_via_meta_reasoning(ok_reports) if len(ok_reports) >= 2 else None
    hearsay = await combine_via_hearsay(ok_reports) if ok_reports else None

    return outcomes, OrchestrationResult(specialists=ok_reports, meta=meta, hearsay=hearsay)
