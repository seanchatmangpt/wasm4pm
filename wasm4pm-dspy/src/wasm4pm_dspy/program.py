"""SELECT-stage DSPy program: propose -> critique -> repair. Mirrors
``benchmark-manufacturing/program.py``'s exact 3-stage ``ChainOfThought``
composition shape, adapted for typed ``BreedInput`` fields instead of JSON
strings.

Between propose and critique, this module computes
:func:`wasm4pm_dspy.models.terminal_conclusions` for real (pure Python, no
LM) and passes it into both the critique and repair stages as a properly
typed field -- the critique stage checks the goal's intended answer against
real, computed ground truth rather than trying to infer terminality itself.

Requires the ``llm`` extra. Never imported by ``admission.py`` or ``runner.py``
-- this module's output is always a plain-dict candidate that must still pass
through ``admission.admit_breed_input`` before it is trusted for anything.
"""

from __future__ import annotations

import dspy

from wasm4pm_dspy.models import terminal_conclusions
from wasm4pm_dspy.signatures import (
    CritiqueBreedSelection,
    NLGoalToBreedInput,
    RepairBreedSelection,
)

__all__ = ["BreedSelectionProgram", "propose_candidate"]


class BreedSelectionProgram(dspy.Module):
    """DSPy-native SELECT program: propose -> critique -> repair."""

    def __init__(self) -> None:
        super().__init__()
        self.propose = dspy.ChainOfThought(NLGoalToBreedInput)
        self.critique = dspy.ChainOfThought(CritiqueBreedSelection)
        self.repair = dspy.ChainOfThought(RepairBreedSelection)

    def forward(self, goal: str, available_breeds: list[str]) -> dspy.Prediction:
        proposal = self.propose(goal=goal, available_breeds=available_breeds)
        proposed_terminals = terminal_conclusions(proposal.breed_input)

        critique = self.critique(
            goal=goal,
            available_breeds=available_breeds,
            breed=proposal.breed,
            breed_input=proposal.breed_input,
            terminal_conclusions=proposed_terminals,
        )
        repaired = self.repair(
            goal=goal,
            available_breeds=available_breeds,
            breed=proposal.breed,
            breed_input=proposal.breed_input,
            terminal_conclusions=proposed_terminals,
            critique=critique.critique,
        )
        return dspy.Prediction(
            breed=repaired.repaired_breed,
            breed_input=repaired.repaired_breed_input,
            critique=critique.critique,
            terminal_conclusions=terminal_conclusions(repaired.repaired_breed_input),
        )


def propose_candidate(program: BreedSelectionProgram, goal: str, available_breeds: list[str]) -> dict:
    """Run the program and shape its output into the plain
    ``{"breed": ..., "payload": {...}}`` dict :func:`admission.admit_breed_input`
    expects. ``prediction.breed_input`` is already a real, DSPy-validated
    ``BreedInput`` instance (not a string to parse) -- ``model_dump()`` is the
    only conversion needed."""
    prediction = program(goal=goal, available_breeds=available_breeds)
    return {"breed": prediction.breed, "payload": prediction.breed_input.model_dump(mode="json")}
