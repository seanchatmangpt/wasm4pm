"""Chicago tests for deterministic operator applicability.

These tests use the real contracts and real problem-shape values. No LM or mock
may manufacture eligibility.
"""

from operator_applicability import ProblemShape, eligible_operator_ids, refused_operator_ids


def test_strips_requires_real_planning_shape() -> None:
    incomplete = ProblemShape.from_features({"initial_state", "goal_state"})
    assert "strips" not in eligible_operator_ids(incomplete)
    assert "strips" in refused_operator_ids(incomplete)

    complete = ProblemShape.from_features({"initial_state", "goal_state", "actions"})
    assert "strips" in eligible_operator_ids(complete)


def test_pomdp_is_not_admitted_from_incident_text_shape() -> None:
    shape = ProblemShape.from_features({"observations", "candidate_hypotheses", "events"})
    assert "pomdp" not in eligible_operator_ids(shape)


def test_sat_is_admitted_by_constraint_shape_without_llm() -> None:
    shape = ProblemShape.from_features({"constraints"})
    assert "sat_cdcl" in eligible_operator_ids(shape)


def test_eligibility_is_deterministic_and_sorted() -> None:
    shape = ProblemShape.from_features(
        {
            "constraints",
            "initial_state",
            "goal_state",
            "actions",
            "candidate_hypotheses",
            "observations",
        }
    )
    first = eligible_operator_ids(shape)
    second = eligible_operator_ids(shape)
    assert first == second
    assert first == tuple(sorted(first))
