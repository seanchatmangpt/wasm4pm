"""Machine-readable applicability for wasm4pm cognition operators.

Eligibility is deterministic and evidence-derived. An LM may rank the eligible
set, but it cannot invent operator preconditions or make an ineligible operator
eligible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, FrozenSet


@dataclass(frozen=True)
class ProblemShape:
    """Admitted structural properties of a problem instance."""

    features: FrozenSet[str]

    @classmethod
    def from_features(cls, features: Iterable[str]) -> "ProblemShape":
        normalized = frozenset(str(feature).strip() for feature in features if str(feature).strip())
        return cls(features=normalized)


@dataclass(frozen=True)
class OperatorContract:
    """Deterministic precondition contract for one computation operator."""

    operator_id: str
    requires_all: FrozenSet[str] = frozenset()
    requires_any: FrozenSet[str] = frozenset()

    def applicable(self, shape: ProblemShape) -> bool:
        if not self.requires_all.issubset(shape.features):
            return False
        if self.requires_any and self.requires_any.isdisjoint(shape.features):
            return False
        return True


# Conservative structural contracts for the operator families that repeatedly
# surfaced in the live 55-breed campaign. These are not payload templates.
# They encode only the evidence shape required before an operator may enter a
# candidate portfolio.
DEFAULT_OPERATOR_CONTRACTS: Mapping[str, OperatorContract] = {
    "sat_cdcl": OperatorContract("sat_cdcl", requires_any=frozenset({"constraints", "boolean_constraints"})),
    "version_space": OperatorContract("version_space", requires_any=frozenset({"labeled_examples", "candidate_hypotheses"})),
    "dendral": OperatorContract("dendral", requires_all=frozenset({"candidate_hypotheses", "observations"})),
    "mycin": OperatorContract("mycin", requires_all=frozenset({"rules", "observations"})),
    "strips": OperatorContract("strips", requires_all=frozenset({"initial_state", "goal_state", "actions"})),
    "cbr": OperatorContract("cbr", requires_all=frozenset({"cases", "observations"})),
    "allen_temporal": OperatorContract("allen_temporal", requires_all=frozenset({"temporal_intervals"})),
    "event_calculus": OperatorContract("event_calculus", requires_all=frozenset({"events", "fluents", "temporal_order"})),
    "mdp": OperatorContract("mdp", requires_all=frozenset({"states", "actions", "transition_probabilities", "rewards"})),
    "pomdp": OperatorContract("pomdp", requires_all=frozenset({"states", "actions", "transition_probabilities", "observations", "observation_probabilities", "rewards"})),
    "htn": OperatorContract("htn", requires_all=frozenset({"tasks", "methods", "initial_state"})),
}


def eligible_operator_ids(
    shape: ProblemShape,
    contracts: Mapping[str, OperatorContract] = DEFAULT_OPERATOR_CONTRACTS,
) -> tuple[str, ...]:
    """Return the deterministic, sorted eligible operator set."""

    return tuple(sorted(operator_id for operator_id, contract in contracts.items() if contract.applicable(shape)))


def refused_operator_ids(
    shape: ProblemShape,
    contracts: Mapping[str, OperatorContract] = DEFAULT_OPERATOR_CONTRACTS,
) -> tuple[str, ...]:
    """Return the deterministic, sorted ineligible operator set."""

    return tuple(sorted(operator_id for operator_id, contract in contracts.items() if not contract.applicable(shape)))
