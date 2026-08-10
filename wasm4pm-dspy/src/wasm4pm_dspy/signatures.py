"""SELECT-stage DSPy signatures, using real typed fields -- ``list[str]`` for
the breed allowlist and the :class:`~wasm4pm_dspy.models.BreedInput` Pydantic
model directly as the output type, rather than JSON strings with a schema
duplicated in prose. DSPy's structured-output adapter parses/validates the
LM's output against ``BreedInput`` itself; a malformed response fails at the
DSPy layer with a concrete Pydantic error, before ever reaching admission.

``CritiqueBreedSelection`` and ``RepairBreedSelection`` also take
``terminal_conclusions: list[str]`` -- a real, deterministically computed
field (:func:`wasm4pm_dspy.models.terminal_conclusions`), not prose guidance
the LM has to infer correctness from. This directly encodes what a live run
this session found: MYCIN-family breeds select the highest-CF *terminal*
conclusion (one never consumed as another rule's premise), so a rule chain
that incidentally consumes the goal's real answer as a further premise
silently produces the wrong ``selected`` value. Prose alone (an earlier
version of this file) did not reliably prevent that; a real computed field
the critique stage can check against does.

Requires the ``llm`` extra (``pip install wasm4pm-dspy[llm]``). Never imported
by ``admission.py`` or ``runner.py``.
"""

from __future__ import annotations

import dspy

from wasm4pm_dspy.models import BreedInput


class NLGoalToBreedInput(dspy.Signature):
    """Propose which of wasm4pm's classical-AI cognition breeds best applies to a
    free-text goal, and a BreedInput for it. Only ever propose a ``breed`` id
    that appears in ``available_breeds`` -- never one from prior training
    knowledge that isn't in that list."""

    goal: str = dspy.InputField(desc="Free-text description of what the caller wants reasoned about")
    available_breeds: list[str] = dspy.InputField(desc="The real breed_id allowlist -- propose only from this list")
    breed: str = dspy.OutputField(desc="The chosen breed_id, verbatim from available_breeds")
    breed_input: BreedInput = dspy.OutputField(
        desc="A BreedInput whose facts/rules/goals ground the goal in this breed's reasoning style. "
        "For rule-chaining breeds, avoid writing a further rule whose premise consumes the exact "
        "conclusion string that should be the final answer -- the critique stage will check this "
        "against the real terminal-conclusion computation and flag it if so."
    )


class CritiqueBreedSelection(dspy.Signature):
    """Find problems with a proposed breed selection: does the payload's
    facts/rules/goals actually support the stated intent, and -- for
    rule-chaining breeds -- does the goal's real intended answer appear in
    ``terminal_conclusions``. If a rule conclusion that should be the answer
    is missing from ``terminal_conclusions``, some other rule consumes it as
    a premise, which will cause the wrong value to be selected."""

    goal: str = dspy.InputField(desc="The original free-text goal")
    available_breeds: list[str] = dspy.InputField(desc="The real breed_id allowlist")
    breed: str = dspy.InputField(desc="Candidate breed_id")
    breed_input: BreedInput = dspy.InputField(desc="Candidate BreedInput")
    terminal_conclusions: list[str] = dspy.InputField(
        desc="Real, computed list of this candidate's rule conclusions that are NOT consumed as "
        "any other rule's premise -- only conclusions in this list can ever be selected"
    )
    critique: str = dspy.OutputField(
        desc="Free-text critique: does the payload support the goal, and is the intended answer "
        "actually present in terminal_conclusions -- name the specific rule to remove or restructure if not"
    )


class RepairBreedSelection(dspy.Signature):
    """Repair a proposed breed selection using a critique. If the critique
    identifies that the intended answer is not in ``terminal_conclusions``,
    restructure or remove the offending rule so the intended conclusion is no
    longer consumed as another rule's premise."""

    goal: str = dspy.InputField(desc="The original free-text goal")
    available_breeds: list[str] = dspy.InputField(desc="The real breed_id allowlist")
    breed: str = dspy.InputField(desc="Candidate breed_id")
    breed_input: BreedInput = dspy.InputField(desc="Candidate BreedInput")
    terminal_conclusions: list[str] = dspy.InputField(
        desc="Real, computed list of this candidate's terminal (selectable) rule conclusions"
    )
    critique: str = dspy.InputField(desc="Critique of the candidate")
    repaired_breed: str = dspy.OutputField(desc="Repaired breed_id, verbatim from available_breeds")
    repaired_breed_input: BreedInput = dspy.OutputField(
        desc="Repaired BreedInput -- if critique flagged a terminal-conclusion problem, the intended "
        "answer's conclusion string must not appear as any rule's premise in the repaired rule set"
    )
