"""SELECT-stage DSPy signature, using real typed fields -- ``list[str]`` for
the breed allowlist and the :class:`~wasm4pm_dspy.models.BreedInput` Pydantic
model directly as the output type, rather than JSON strings with a schema
duplicated in prose. DSPy's structured-output adapter parses/validates the
LM's output against ``BreedInput`` itself; a malformed response fails at the
DSPy layer with a concrete Pydantic error, before ever reaching admission.

One propose call, no critique/repair signatures. An earlier version of this
module also defined ``CritiqueBreedSelection``/``RepairBreedSelection`` (a
second LM pass that critiques and then rewrites the first pass's output).
Removed after a real, live, reproducible finding this session: at
temperature=0 on ``llama-3.1-8b-instant``, the propose stage correctly chose
``mycin`` for a medical diagnosis goal, and the repair stage then rewrote it
to a hallucinated, nonexistent breed id (``abductive_mycin``) -- caught only
because ``admission.admit_breed_input``'s registry check happened to catch
it. The real verification layer is entirely downstream and non-LM: schema +
registry admission, then wasm4pm's own real, compiled preconditions/
postconditions during actual execution. See
:mod:`wasm4pm_dspy.program`'s module docstring for the full account.

Requires the ``llm`` extra (``pip install wasm4pm-dspy[llm]``). Never imported
by ``admission.py`` or ``runner.py``.
"""

from __future__ import annotations

import dspy

from wasm4pm_dspy.models import BreedInput

__all__ = ["NLGoalToBreedInput"]


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
        "For rule-chaining breeds (e.g. mycin), the real engine's working memory is seeded EXACTLY as "
        "f'{fact.key}={fact.value}' (NO spaces around '=') and fact.value alone -- every rule.premise "
        "entry must match one of those two exact strings, or the exact conclusion string of some other "
        "rule, or it can never fire. Never write premise strings with spaces around '=' "
        "(\"a = b\" will NOT match \"a=b\"), and never reference a fact/entity (e.g. "
        "\"bacterial_culture\") in a premise unless it also appears as a fact.key or fact.value. "
        "Also avoid writing a further rule whose premise consumes the exact conclusion string that "
        "should be the final answer -- that conclusion would then never be selectable (it must remain "
        "a real terminal conclusion, never used as any other rule's premise)."
    )
