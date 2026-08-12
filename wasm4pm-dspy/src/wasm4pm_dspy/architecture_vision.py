"""The actual Phase A (Architecture Vision) mechanism named as a real,
named gap two turns before this module existed: nothing in wasm4pm today
originates a target-state proposal. ``meta_reasoning`` can arbitrate
between candidate visions once proposed (real, already used this session
for a different purpose -- combining specialist breed reports); nothing
proposes one.

Consumes :mod:`wasm4pm_dspy.gap_triage`'s output, unmodified -- only the
backlog items already scored ``actionable`` and tagged
``action in {"raise", "create"}`` are eligible to appear in a proposal.
Same SELECT != DO boundary every other module in this package enforces:
``ProposeArchitectureVision`` produces a proposal only. Nothing here
executes, builds, or writes anything the proposal names -- a human decides
what to build from it, exactly as this session's own plan-mode turns
already worked, just with the judgment step itself now inspectable,
repeatable, and backed by a real structural check instead of one-off
prose.
"""

from __future__ import annotations

from dataclasses import dataclass

import dspy

from wasm4pm_dspy.gap_triage import GapVerdict

__all__ = [
    "REPO_CONSTRAINTS",
    "ProposeArchitectureVision",
    "ArchitectureVisionProgram",
    "VisionProposal",
    "propose_vision",
]

# The real, standing constraints this session actually operated under all
# along, made an explicit input instead of implicit judgment a human had to
# already know and enforce silently every turn.
REPO_CONSTRAINTS = (
    "SELECT != DO: no proposal may claim or imply execution authority over "
    "a live cluster or external system; authority stays SELECT_ONLY / "
    "PENDING_RUN per admission.py's own convention. "
    "Never fabricate an encoding or mapping where no honest one exists -- "
    "prefer naming a real limitation over forcing a fit (the same "
    "discipline that correctly refused dempster_shafer/soar/problog/mdp/"
    "ilp this session). "
    "Never perform destructive git operations; commits are immutable, fix "
    "forward only. "
    "Repo-boundary rule: this package computes and proposes; it does not "
    "modify other repositories (autofde-lab's own stated rule, honored "
    "here too)."
)


class ProposeArchitectureVision(dspy.Signature):
    """Given an actionable capability-gap backlog and this repo's real,
    standing constraints, propose an ordered set of target-state items --
    what should get built next, and in what order, and why. Every item
    MUST reference a real backlog entry (by its finding text) -- never
    invent a target the backlog doesn't support."""

    actionable_backlog: str = dspy.InputField(
        desc="Newline-joined 'finding | errc_action | adm_phase' entries, already filtered to actionable raise/create items"
    )
    constraints: str = dspy.InputField(desc="This repo's real, standing constraints the proposal must respect")
    ordered_targets: list[str] = dspy.OutputField(
        desc="Target-state proposals in priority order, each one referencing a real backlog finding verbatim"
    )
    rationale: str = dspy.OutputField(desc="Why this order, and how each target respects the stated constraints")


class ArchitectureVisionProgram(dspy.Module):
    """propose -> real structural check (every referenced backlog item
    actually exists in the input) -- no critique/repair loop, since a
    fabricated reference is caught deterministically and simply dropped
    rather than requiring another LM round-trip to argue about; the real
    check IS the fix here, matching models.terminal_conclusions' "compute
    it, don't ask the LM to self-report" discipline."""

    def __init__(self) -> None:
        super().__init__()
        self.propose = dspy.ChainOfThought(ProposeArchitectureVision)

    def forward(self, backlog: list[GapVerdict]) -> dspy.Prediction:
        eligible = [
            item
            for item in backlog
            if item.actionable and item.errc_action in ("raise", "create")
        ]
        backlog_text = "\n".join(f"{item.finding} | {item.errc_action} | {item.adm_phase}" for item in eligible)
        real_findings = {item.finding for item in eligible}

        prediction = self.propose(actionable_backlog=backlog_text, constraints=REPO_CONSTRAINTS)

        # Real structural check: drop any target that doesn't reference a
        # real backlog finding verbatim -- never trust the LM's own claim
        # that a target is grounded.
        verified_targets = [t for t in prediction.ordered_targets if any(f in t for f in real_findings)]
        dropped = [t for t in prediction.ordered_targets if t not in verified_targets]

        return dspy.Prediction(
            ordered_targets=verified_targets,
            dropped_unverified_targets=dropped,
            rationale=prediction.rationale,
            eligible_backlog_size=len(eligible),
        )


@dataclass(frozen=True)
class VisionProposal:
    ordered_targets: list[str]
    dropped_unverified_targets: list[str]
    rationale: str
    eligible_backlog_size: int


def propose_vision(program: ArchitectureVisionProgram, backlog: list[GapVerdict]) -> VisionProposal:
    """PROPOSAL ONLY. Nothing here executes any item in ordered_targets."""
    prediction = program(backlog=backlog)
    return VisionProposal(
        ordered_targets=prediction.ordered_targets,
        dropped_unverified_targets=prediction.dropped_unverified_targets,
        rationale=prediction.rationale,
        eligible_backlog_size=prediction.eligible_backlog_size,
    )
