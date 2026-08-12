"""Chicago-style tests for :mod:`wasm4pm_dspy.k8s_state` -- the deterministic
k8s-state -> per-breed ``BreedInput`` encoder (autofde-lab's
``docs/planning/fortune5-k8s-state-space/ROADMAP.md`` step 7,
``build-k8s-state-encoder``).

Deliberately NOT gated behind ``GROQ_API_KEY``: every encoder here is a pure,
deterministic function -- no LLM call anywhere in this file. The only skip
condition is the real `wpm` CLI not being built, same as
`test_orchestrator_chicago.py`. Real components throughout: real
`admit_breed_input`, real `run_admitted_breed_input` (real subprocess, real
WASM execution, real BLAKE3 receipt verification). No mocks anywhere.

Anomaly fixtures below use real ``kind``/``field``/``relation_class``
combinations taken directly from
``autofde_lab_planner.scanner.taxonomy.classify()``'s own real branches
(``Deployment/readyReplicas/declared_vs_observed``,
``Service/spec.selector/dangling_reference``) -- read, not invented.
"""

from __future__ import annotations

import asyncio

import pytest

from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.k8s_state import (
    DETERMINISTIC_ENCODER_BREEDS,
    K8sAnomaly,
    K8sIncidentState,
    encode_autoinstinct_learning,
    encode_cbr,
    encode_circumscription,
    encode_dendral,
    encode_ebl,
    encode_event_calculus,
    encode_for_breed,
    encode_fuzzy_logic,
    encode_hearsay,
    encode_htn_planning,
    encode_ilp,
    encode_incident,
    encode_mycin,
    encode_sat_cdcl,
    encode_strips,
    encode_tableaux,
    encode_triz,
    encode_version_space,
)
from wasm4pm_dspy.models import Fact
from wasm4pm_dspy.registry import breed_ids
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli, run_admitted_breed_input

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)


# ============================================================================
# Real anomaly fixtures -- shapes taken from taxonomy.classify()'s own real
# branches, not invented.
# ============================================================================


def _frontend_scale_to_zero_state() -> K8sIncidentState:
    """Mirrors taxonomy.classify()'s real
    `Deployment/readyReplicas/declared_vs_observed -> INJECT_SCALE_PODS_TO_ZERO`
    branch."""
    anomaly = K8sAnomaly(
        kind="Deployment",
        object_name="frontend",
        namespace="hotel-reservation",
        relation_class="declared_vs_observed",
        field="readyReplicas",
        observed="0",
        expected="3",
        detail="frontend deployment has 0 ready replicas, expected 3",
    )
    return K8sIncidentState(
        intent="diagnose frontend unavailability in hotel-reservation namespace",
        anomalies=[anomaly],
        fault_hint="inject_scale_pods_to_zero",
    )


def _service_selector_mismatch_state() -> K8sIncidentState:
    """Mirrors taxonomy.classify()'s real
    `Service/spec.selector/dangling_reference -> INJECT_WRONG_SERVICE_SELECTOR`
    branch."""
    anomaly = K8sAnomaly(
        kind="Service",
        object_name="frontend-svc",
        namespace="hotel-reservation",
        relation_class="dangling_reference",
        field="spec.selector",
        observed="app=frontend-v2",
        expected="app=frontend",
        detail="service selector references a label no live pod carries",
    )
    return K8sIncidentState(
        intent="diagnose frontend service routing zero endpoints",
        anomalies=[anomaly],
        fault_hint="inject_wrong_service_selector",
    )


def _multi_anomaly_state() -> K8sIncidentState:
    """Two real, distinct anomaly kinds observed together -- exercises the
    multi-signal path in encode_mycin/encode_cbr/encode_sat_cdcl."""
    return K8sIncidentState(
        intent="diagnose recommendation service degraded with config drift",
        anomalies=[
            K8sAnomaly(
                kind="ConfigMap",
                object_name="recommendation-config",
                namespace="hotel-reservation",
                relation_class="declared_vs_observed",
                field="data",
                observed="drifted",
                expected="declared",
                detail="live ConfigMap data diverged from declared manifest",
            ),
            K8sAnomaly(
                kind="Pod",
                object_name="recommendation-7d9f",
                namespace="hotel-reservation",
                relation_class="aggregate_threshold",
                field="restartCount",
                observed="12",
                expected="0",
                detail="pod restart count exceeds threshold",
            ),
        ],
        fault_hint="inject_configmap_drift",
    )


_FIXTURES = {
    "frontend_scale_to_zero": _frontend_scale_to_zero_state,
    "service_selector_mismatch": _service_selector_mismatch_state,
    "multi_anomaly": _multi_anomaly_state,
}


# ============================================================================
# 1. Each deterministic encoder produces a real, admitted, executed BreedInput
# ============================================================================


@pytest.mark.parametrize("fixture_name", sorted(_FIXTURES))
def test_deterministic_encoders_run_real_breeds_end_to_end(fixture_name: str):
    """For each real incident fixture, every one of the 19 registered
    deterministic encoders produces a BreedInput that real admission accepts
    and the real CLI executes with a receipt that verifies -- no LLM
    anywhere in this path. (``ilp`` is deliberately NOT in
    ``DETERMINISTIC_ENCODER_BREEDS`` -- see ``encode_ilp``'s docstring and
    ``test_encode_ilp_is_real_but_deliberately_unregistered`` below.)"""
    state = _FIXTURES[fixture_name]()

    async def _run_all():
        outcomes = {}
        for breed in DETERMINISTIC_ENCODER_BREEDS:
            breed_input = encode_for_breed(breed, state)
            assert breed_input is not None, f"{breed} must be registered as a deterministic encoder"
            candidate = {"breed": breed, "payload": breed_input.model_dump(mode="json")}
            admitted = admit_breed_input(candidate)
            outcomes[breed] = await run_admitted_breed_input(admitted)
        return outcomes

    results = asyncio.run(_run_all())
    assert set(results) == set(DETERMINISTIC_ENCODER_BREEDS)
    for breed, result in results.items():
        assert result.status == "ok", f"{breed} real run did not return status=ok: {result}"
        # run_admitted_breed_input already re-verifies the BLAKE3 receipt
        # internally before returning -- a result existing here means that
        # verification already passed for real.


# ============================================================================
# 2. encode_for_breed is honest about unsupported breeds -- never fabricates
# ============================================================================


def test_encode_for_breed_returns_none_for_unregistered_breed():
    state = _frontend_scale_to_zero_state()
    # bayesian_network is a real NO_FIT breed (needs a conditional
    # probability table this encoder has no honest anomaly-derived source
    # for) -- must be an explicit None, not a fabricated best-effort payload.
    assert encode_for_breed("bayesian_network", state) is None


def test_encode_ilp_is_real_but_deliberately_unregistered():
    """encode_ilp is a real, callable, exported function -- but NOT in
    DETERMINISTIC_ENCODER_BREEDS, because ilp's own real preconditions()
    hard-requires a pos:<atom> example this module refuses to fabricate
    (see encode_ilp's docstring). encode_for_breed must therefore report it
    as unsupported even though a real encoder function exists."""
    state = _multi_anomaly_state()
    assert "ilp" not in DETERMINISTIC_ENCODER_BREEDS
    assert encode_for_breed("ilp", state) is None
    # The function itself still works -- it's unregistered, not broken.
    breed_input = encode_ilp(state)
    assert breed_input.facts
    assert all(f.key == "bg" for f in breed_input.facts)


# ============================================================================
# 3. encode_incident over the FULL registry only returns the 6 registered
#    breeds -- proves no encoder was fabricated for the other 49
# ============================================================================


def test_encode_incident_over_full_registry_covers_only_registered_breeds():
    state = _multi_anomaly_state()
    all_breeds = tuple(sorted(breed_ids()))
    result = encode_incident(state, target_breeds=all_breeds)
    assert set(result) == set(DETERMINISTIC_ENCODER_BREEDS)
    assert len(all_breeds) > len(DETERMINISTIC_ENCODER_BREEDS)  # sanity: registry is really bigger


def test_encode_incident_defaults_to_full_registry():
    state = _frontend_scale_to_zero_state()
    # No target_breeds passed -- must default to scanning every registered
    # breed id (live, parsed), not a hardcoded subset.
    result = encode_incident(state)
    assert set(result) == set(DETERMINISTIC_ENCODER_BREEDS)


# ============================================================================
# 4. Per-encoder structural sanity on real fixture data (no admission/run --
#    fast, pure checks on the payload shape itself)
# ============================================================================


def test_encode_strips_uses_real_anomaly_observed_expected_as_state_and_goal():
    state = _frontend_scale_to_zero_state()
    breed_input = encode_strips(state)
    assert len(breed_input.state) == 1
    assert breed_input.state[0].predicate == "readyReplicas"
    assert breed_input.state[0].value == "0"
    assert len(breed_input.goals) == 1
    assert breed_input.goals[0].value == "3"
    assert len(breed_input.rules) == 1


def test_encode_strips_empty_when_no_expected_value():
    anomaly = K8sAnomaly(
        kind="Pod",
        object_name="x",
        namespace="ns",
        relation_class="declared_vs_observed",
        field="spec.dnsPolicy",
        observed="ClusterFirst",
        expected=None,
        detail="no expected value observed",
    )
    state = K8sIncidentState(intent="x", anomalies=[anomaly])
    breed_input = encode_strips(state)
    assert breed_input.state == []
    assert breed_input.goals == []
    assert breed_input.rules == []


def test_encode_mycin_chains_root_cause_from_real_signals():
    state = _multi_anomaly_state()
    breed_input = encode_mycin(state)
    assert len(breed_input.facts) == 2  # one signal per anomaly
    assert len(breed_input.rules) == 2  # diagnose + recommend chain
    root_cause_rule = next(r for r in breed_input.rules if r.id == "diagnose-root-cause")
    assert root_cause_rule.conclusion == f"root-cause={state.fault_hint}"
    assert set(root_cause_rule.premise) == {f.value for f in breed_input.facts}


def test_encode_cbr_derives_query_facts_from_first_anomaly():
    state = _multi_anomaly_state()
    breed_input = encode_cbr(state)
    assert len(breed_input.cases) == len(state.anomalies)
    first = state.anomalies[0]
    query_kind_fact = next(f for f in breed_input.facts if f.key == "kind")
    assert query_kind_fact.value == first.kind


def test_encode_dendral_ranks_fault_hint_first():
    state = _frontend_scale_to_zero_state()
    breed_input = encode_dendral(state)
    assert breed_input.candidates
    assert breed_input.candidates[0].id == state.fault_hint
    scores = [c.score for c in breed_input.candidates]
    assert scores == sorted(scores, reverse=True)  # real descending rank, not incidental order


def test_encode_sat_cdcl_and_version_space_empty_on_no_anomalies():
    state = K8sIncidentState(intent="nothing observed", anomalies=[])
    assert encode_sat_cdcl(state).facts == []
    assert encode_version_space(state).facts == []


def test_encode_htn_planning_uses_real_op_task_convention():
    """htn_planning's real run() consumes goals[i].value as a TASK TOKEN
    (op:<rule-id>), not a predicate=value atom like STRIPS -- confirmed live
    this session after a first attempt (reusing _encode_strips_compatible)
    real-failed with NO_EVIDENCE 'no plan found'. This asserts the fixed
    encoding's real shape: the single goal's value is an 'op:' token that
    literally matches the one rule's id."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_htn_planning(state)
    assert len(breed_input.goals) == 1
    assert breed_input.goals[0].value.startswith("op:")
    assert len(breed_input.rules) == 1
    assert breed_input.rules[0].id == breed_input.goals[0].value


def test_encode_fuzzy_logic_produces_real_rule_and_membership_terms():
    """fuzzy_logic's real preconditions() requires BOTH a fuzzy:input: fact
    AND a non-empty rules list -- confirmed live after a first attempt
    (input fact only) real-failed with NO_EVIDENCE 'precondition failed'.
    Asserts the fixed encoding supplies a real rule plus Mf::parse-able
    membership-function facts for both the input and output terms."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_fuzzy_logic(state)
    assert any(f.key == "fuzzy:input:incident" for f in breed_input.facts)
    assert len(breed_input.rules) == 1
    rule = breed_input.rules[0]
    # The rule's premise/conclusion terms must each have a real
    # Mf::parse-able membership fact (triangular:/trapezoidal:).
    term_facts = {f.key: f.value for f in breed_input.facts if f.key.startswith("fuzzy:") and "input" not in f.key}
    assert rule.premise[0] in term_facts
    assert rule.conclusion in term_facts
    assert all(v.startswith(("triangular:", "trapezoidal:")) for v in term_facts.values())


def test_encode_event_calculus_uses_real_ec_prefix_convention():
    state = _frontend_scale_to_zero_state()
    breed_input = encode_event_calculus(state)
    keys = {f.key for f in breed_input.facts}
    assert "ec:initially" in keys
    assert "ec:happens:0" in keys
    assert any(k.startswith("ec:initiates:") for k in keys)


def test_encode_event_calculus_omits_initiates_when_no_expected():
    anomaly = K8sAnomaly(
        kind="Pod",
        object_name="x",
        namespace="ns",
        relation_class="declared_vs_observed",
        field="spec.dnsPolicy",
        observed="ClusterFirst",
        expected=None,
        detail="no expected value observed",
    )
    state = K8sIncidentState(intent="x", anomalies=[anomaly])
    breed_input = encode_event_calculus(state)
    keys = {f.key for f in breed_input.facts}
    assert not any(k.startswith("ec:initiates:") for k in keys)


def test_encode_hearsay_posts_one_level0_hypothesis_per_anomaly():
    state = _multi_anomaly_state()
    breed_input = encode_hearsay(state)
    assert len(breed_input.facts) == len(state.anomalies)
    assert {f.key for f in breed_input.facts} == {a.kind for a in state.anomalies}
    # KS promotion rules only exist when fault_hint is present.
    assert len(breed_input.rules) == len(state.anomalies)
    assert all(r.conclusion == f"diagnosis:{state.fault_hint}" for r in breed_input.rules)


def test_encode_hearsay_no_rules_without_fault_hint():
    state = _multi_anomaly_state()
    state = state.model_copy(update={"fault_hint": None})
    breed_input = encode_hearsay(state)
    assert breed_input.rules == []


def test_encode_triz_uses_real_improving_worsening_facts():
    state = _frontend_scale_to_zero_state()
    breed_input = encode_triz(state)
    facts = {f.key: f.value for f in breed_input.facts}
    assert facts.get("improving") == "readyReplicas"
    assert facts.get("worsening") == "declared_vs_observed"


def test_triz_real_run_honestly_reports_no_matrix_match_for_k8s_fields():
    """TRIZ's embedded contradiction matrix uses domain words (speed,
    accuracy, reliability, ...) -- confirmed by reading
    triz.rs's static_contradiction_matrix() directly. A real k8s field/
    relation_class pair will genuinely never match. Confirmed live: the
    real run returns status='ok' but selected=None, with an honest
    'no-matrix-entry' inference_trace step -- asserting that exact real
    outcome rather than a fabricated non-ok status."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_triz(state)
    candidate = {"breed": "triz", "payload": breed_input.model_dump(mode="json")}
    admitted = admit_breed_input(candidate)
    result = asyncio.run(run_admitted_breed_input(admitted))
    assert result.status == "ok"
    assert result.selected is None
    assert any(step.get("kind") == "no-matrix-entry" for step in result.inference_trace)


def test_encode_ebl_derives_domain_theory_rule_and_goal_from_real_anomaly():
    """Structural sanity confirming encode_ebl's real fact/rule/goal shape
    against ebl.rs's own contract: a ground fact naming the observed
    condition as a Prolog-style term, a Horn rule generalizing it toward
    the expected condition, and a goal asking EBL to prove that expected
    condition holds for the same object."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_ebl(state)
    assert breed_input.facts == [Fact(key="readyReplicas_observed(frontend)", value="true")]
    assert len(breed_input.rules) == 1
    rule = breed_input.rules[0]
    assert rule.premise == ["readyReplicas_observed(?x)"]
    assert rule.conclusion == "readyReplicas_expected(?x)"
    assert len(breed_input.goals) == 1
    assert breed_input.goals[0].predicate == "readyReplicas_expected"
    assert breed_input.goals[0].value == "frontend"


def test_encode_ebl_empty_when_no_expected_value():
    anomaly = K8sAnomaly(
        kind="Pod",
        object_name="x",
        namespace="ns",
        relation_class="declared_vs_observed",
        field="spec.dnsPolicy",
        observed="ClusterFirst",
        expected=None,
        detail="no expected value observed",
    )
    state = K8sIncidentState(intent="x", anomalies=[anomaly])
    breed_input = encode_ebl(state)
    assert breed_input.facts == []
    assert breed_input.rules == []
    assert breed_input.goals == []


def test_encode_tableaux_derives_real_propositional_formula_from_anomaly():
    """Structural sanity confirming encode_tableaux's real
    ``tableaux:formula`` fact: a single implication from the observed
    condition to the negation of the expected condition, using atom names
    sanitized from the real ``field``."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_tableaux(state)
    assert len(breed_input.facts) == 1
    formula_fact = breed_input.facts[0]
    assert formula_fact.key == "tableaux:formula"
    assert formula_fact.value == "readyReplicas_observed -> !readyReplicas_expected"


def test_encode_tableaux_sanitizes_dotted_field_into_valid_atom():
    state = _service_selector_mismatch_state()
    breed_input = encode_tableaux(state)
    formula_fact = breed_input.facts[0]
    assert "." not in formula_fact.value
    assert formula_fact.value == "spec_selector_observed -> !spec_selector_expected"


def test_encode_tableaux_empty_when_no_expected_value():
    anomaly = K8sAnomaly(
        kind="Pod",
        object_name="x",
        namespace="ns",
        relation_class="declared_vs_observed",
        field="spec.dnsPolicy",
        observed="ClusterFirst",
        expected=None,
        detail="no expected value observed",
    )
    state = K8sIncidentState(intent="x", anomalies=[anomaly])
    breed_input = encode_tableaux(state)
    assert breed_input.facts == []


# ============================================================================
# 5. encode_autoinstinct_learning / encode_circumscription -- structural
#    sanity confirming the real fact/rule format read from source.
# ============================================================================


def test_encode_autoinstinct_learning_goals_are_positional_not_matched():
    """autoinstinct_learning's real run() reads goals/facts PURELY by index
    (bit i = goals[i]/facts[i]) -- never by predicate/value content
    (confirmed by reading run()). This asserts the real shape: one goal per
    anomaly carrying a real expected value, one fact per anomaly, and that
    the encoder never emits rules/state/candidates (unused by this breed)."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_autoinstinct_learning(state)
    assert len(breed_input.goals) == 1
    assert breed_input.goals[0].predicate == "readyReplicas"
    assert breed_input.goals[0].value == "3"
    assert len(breed_input.facts) == 1
    assert breed_input.rules == []
    assert breed_input.state == []
    assert breed_input.candidates == []


def test_encode_autoinstinct_learning_empty_when_no_expected_value():
    anomaly = K8sAnomaly(
        kind="Pod",
        object_name="x",
        namespace="ns",
        relation_class="declared_vs_observed",
        field="spec.dnsPolicy",
        observed="ClusterFirst",
        expected=None,
        detail="no expected value observed",
    )
    state = K8sIncidentState(intent="x", anomalies=[anomaly])
    breed_input = encode_autoinstinct_learning(state)
    assert breed_input.goals == []
    assert breed_input.facts == []


def test_encode_autoinstinct_learning_one_goal_per_expected_anomaly():
    state = _multi_anomaly_state()
    breed_input = encode_autoinstinct_learning(state)
    assert len(breed_input.goals) == len(state.anomalies)
    assert len(breed_input.facts) == len(state.anomalies)


def test_encode_circumscription_uses_real_ab_prefixed_rule_derived_atoms():
    """circumscription's real closure() seeds its working set from ALL facts
    unconditionally, so a raw ab_ fact would be true in every candidate
    model. This asserts the real shape: ab_-prefixed atoms only ever appear
    as RULE CONCLUSIONS/premises, never as a raw fact key, plus a root-cause
    rule chaining every derived ab_ atom to a single entailment goal."""
    state = _frontend_scale_to_zero_state()
    breed_input = encode_circumscription(state)
    assert breed_input.facts
    assert all(not f.key.startswith("ab_") for f in breed_input.facts)
    ab_rules = [r for r in breed_input.rules if r.conclusion.startswith("ab_")]
    assert len(ab_rules) == len(state.anomalies)
    cause_rule = next(r for r in breed_input.rules if r.id == "circumscribe-root-cause")
    assert set(cause_rule.premise) == {r.conclusion for r in ab_rules}
    assert len(breed_input.goals) == 1
    assert breed_input.goals[0].value == cause_rule.conclusion


def test_encode_circumscription_caps_at_twelve_abnormality_atoms():
    anomalies = [
        K8sAnomaly(
            kind="Pod",
            object_name=f"pod-{i}",
            namespace="ns",
            relation_class=f"class-{i}",
            field="restartCount",
            observed=str(i),
            expected="0",
            detail=f"anomaly {i}",
        )
        for i in range(20)
    ]
    state = K8sIncidentState(intent="many anomalies", anomalies=anomalies)
    breed_input = encode_circumscription(state)
    ab_rules = [r for r in breed_input.rules if r.conclusion.startswith("ab_")]
    assert len(ab_rules) == 12


def test_encode_circumscription_generic_cause_without_fault_hint():
    state = _frontend_scale_to_zero_state().model_copy(update={"fault_hint": None})
    breed_input = encode_circumscription(state)
    assert breed_input.goals[0].value == "root_cause_detected"
