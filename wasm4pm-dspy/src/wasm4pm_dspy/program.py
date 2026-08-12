"""SELECT-stage DSPy program: one propose call, no LM self-repair.

sentence -> BreedInput -> wasm4pm -> BreedOutput, and only that. An earlier
version of this module ran propose -> critique -> repair (LM critiques its
own output, LM repairs its own output). Removed after a real, live,
reproducible finding this session: on ``llama-3.1-8b-instant`` at
temperature=0, the propose stage correctly chose ``mycin`` for a medical
diagnosis goal, and the repair stage then rewrote it to a hallucinated,
nonexistent breed id (``abductive_mycin``) -- caught only because
``admission.admit_breed_input``'s registry check happened to catch it. A
second, unbounded LM call whose only constraint is prose guidance
("verbatim from available_breeds") is a real, demonstrated way to corrupt an
already-correct answer, not a reliable way to fix a wrong one -- there is no
evidence anywhere in this codebase that the repair stage ever fixed a real
defect it didn't also risk introducing.

The real verification layer is, and was always meant to be, entirely
downstream and non-LM: :func:`wasm4pm_dspy.admission.admit_breed_input`
(schema + registry check) and then wasm4pm's own real, compiled
preconditions/postconditions during actual execution (confirmed live this
session: a real ``AbductiveIbe`` precondition refusing empty facts, and a
real MYCIN postcondition refusing an empty inference trace as a "fraud
signal"). Neither of those is an LM call. If the propose stage's output is
wrong, the correct outcome is a real, loud refusal from one of those two
layers -- not a second LM guess trying to patch it.

:func:`wasm4pm_dspy.models.terminal_conclusions` and
:func:`wasm4pm_dspy.models.unresolvable_premises` are still computed here --
real, free, pure-Python diagnostics attached to the prediction for a caller
to inspect or log -- but nothing in this module feeds them back into another
LM call.

Requires the ``llm`` extra. Never imported by ``admission.py`` or ``runner.py``
-- this module's output is always a plain-dict candidate that must still pass
through ``admission.admit_breed_input`` before it is trusted for anything.
"""

from __future__ import annotations

import dspy

from wasm4pm_dspy.models import terminal_conclusions, unresolvable_premises
from wasm4pm_dspy.signatures import NLGoalToBreedInput

__all__ = ["BreedSelectionProgram", "propose_candidate"]


class BreedSelectionProgram(dspy.Module):
    """DSPy-native SELECT program: propose, once. No critique, no repair."""

    def __init__(self) -> None:
        super().__init__()
        self.propose = dspy.ChainOfThought(NLGoalToBreedInput)

    def forward(self, goal: str, available_breeds: list[str]) -> dspy.Prediction:
        proposal = self.propose(goal=goal, available_breeds=available_breeds)
        return dspy.Prediction(
            breed=proposal.breed,
            breed_input=proposal.breed_input,
            terminal_conclusions=terminal_conclusions(proposal.breed_input),
            unresolvable_premises=unresolvable_premises(proposal.breed_input),
        )


def propose_candidate(program: BreedSelectionProgram, goal: str, available_breeds: list[str]) -> dict:
    """Run the program and shape its output into the plain
    ``{"breed": ..., "payload": {...}}`` dict :func:`admission.admit_breed_input`
    expects. ``prediction.breed_input`` is already a real, DSPy-validated
    ``BreedInput`` instance (not a string to parse) -- ``model_dump()`` is the
    only conversion needed."""
    prediction = program(goal=goal, available_breeds=available_breeds)
    return {"breed": prediction.breed, "payload": prediction.breed_input.model_dump(mode="json")}
