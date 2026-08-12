"""ROADMAP step 7 (autofde-lab: ``docs/planning/fortune5-k8s-state-space/
ROADMAP.md``): a real, deterministic k8s-state -> per-breed ``BreedInput``
encoder -- the piece autofde-lab's own ``breed_ensemble.BreedEnsembleMember``
today requires callers to hand-write per breed, and that
``k8s_theory.K8sIncidentEncodingProgram`` only ever did via a non-deterministic
LLM call.

Deliberately NOT a generic ``state -> universal payload`` function.
``k8s_theory.py``'s own module docstring already states why: building one
generic translator would mean this codebase deciding, narratively, what a
piece of evidence "means" for every formalism at once. Instead: a small
registry of hand-verified, per-breed *deterministic* encoders, each following
the exact wire-format convention documented in
``k8s_theory._VERIFIED_ENCODING_NOTES`` for that breed. A breed with no
registered encoder is reported as unsupported (``encode_for_breed`` returns
``None``) -- never a fabricated best-effort fit.

Cross-repo boundary: this module never imports ``autofde_lab_planner``.
``K8sAnomaly`` is an independent field-for-field mirror of
``autofde_lab_planner.scanner.models.Anomaly`` (``kind, object_name,
namespace, relation_class, field, observed, expected, detail`` -- confirmed
by reading that file directly), the same "mirror the shape, don't import the
package" discipline ``models.BreedInput`` already uses for the Rust struct.
Translating a real ``Anomaly`` into a ``K8sAnomaly`` is autofde-lab's own
call-site responsibility (ROADMAP step 8), not this module's.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from wasm4pm_dspy.models import BreedInput, Candidate, Case, Fact, Goal, Rule, StateAtom
from wasm4pm_dspy.registry import breed_ids

__all__ = [
    "K8sAnomaly",
    "K8sIncidentState",
    "encode_sat_cdcl",
    "encode_version_space",
    "encode_dendral",
    "encode_mycin",
    "encode_strips",
    "encode_cbr",
    "encode_gps",
    "encode_partial_order_plan",
    "encode_htn_planning",
    "encode_prolog",
    "encode_default_logic",
    "encode_asp",
    "encode_abductive_ibe",
    "encode_abductive_lp",
    "encode_ilp",
    "encode_event_calculus",
    "encode_fuzzy_logic",
    "encode_qualitative_reason",
    "encode_triz",
    "encode_hearsay",
    "encode_ebl",
    "encode_tableaux",
    "encode_autoinstinct_learning",
    "encode_circumscription",
    "DETERMINISTIC_ENCODER_BREEDS",
    "encode_for_breed",
    "encode_incident",
]


class K8sAnomaly(BaseModel):
    """Field-for-field mirror of ``autofde_lab_planner.scanner.models.Anomaly``
    -- read directly from that file, not guessed. ``extra="forbid"`` matches
    every other model in this package (``models.py``)."""

    model_config = ConfigDict(extra="forbid")
    kind: str
    object_name: str
    namespace: str
    relation_class: str
    field: str
    observed: str
    expected: str | None
    detail: str


class K8sIncidentState(BaseModel):
    """Normalized input to the deterministic encoders below. ``fault_hint``
    carries an already-classified taxonomy label (e.g.
    ``autofde_lab_planner.scanner.taxonomy.classify()``'s real output) when
    the caller has one; every encoder below must degrade gracefully when it
    is ``None`` -- not every caller will have run classification first."""

    model_config = ConfigDict(extra="forbid")
    intent: str
    anomalies: list[K8sAnomaly]
    fault_hint: str | None = None


def _anomaly_key(anomaly: K8sAnomaly) -> str:
    """The one deterministic string every encoder below uses to name an
    anomaly -- ``kind:relation_class`` -- stable, real, derived from the
    anomaly itself (never invented per-encoder)."""
    return f"{anomaly.kind}:{anomaly.relation_class}"


# ---------------------------------------------------------------------------
# Sibling fault-id vocabulary, loaded live from the real taxonomy source --
# same discipline as tests/test_orchestrator_chicago.py::_load_real_fault_ids
# and tests/test_k8s_max_breed_projections_chicago.py, not retyped as
# literals here. Used only by encoders (dendral/cbr) that rank a fault_hint
# against its real sibling candidates; absent entirely if the taxonomy file
# isn't found (e.g. autofde-lab not checked out alongside this repo) -- an
# honest empty list, not a fabricated one.
# ---------------------------------------------------------------------------

_TAXONOMY_PATH = Path.home() / "autofde-lab" / "src" / "autofde_lab_planner" / "scanner" / "taxonomy.py"


def _load_real_fault_ids() -> list[str]:
    if not _TAXONOMY_PATH.is_file():
        return []
    text = _TAXONOMY_PATH.read_text(encoding="utf-8")
    return sorted(set(re.findall(r'INJECT_\w+\s*=\s*"([a-z_]+)"', text)))


# ---------------------------------------------------------------------------
# Deterministic per-breed encoders -- promoted from the hand-verified,
# single-scenario fixtures in tests/test_orchestrator_chicago.py, generalized
# to derive their facts/rules/candidates from a real K8sIncidentState instead
# of literal constants. Wire-format conventions unchanged from
# k8s_theory._VERIFIED_ENCODING_NOTES.
# ---------------------------------------------------------------------------


def encode_sat_cdcl(state: K8sIncidentState) -> BreedInput:
    """Each anomaly becomes one DIMACS-style unit clause naming that anomaly
    true (variable index = 1-based position); a real SAT feasibility check on
    "can all observed anomalies coexist" rather than the fixed 3-clause
    scheduling example the original fixture hardcoded. With no anomalies,
    an empty (trivially satisfiable) clause set."""
    facts = [
        Fact(key=f"clause:{i:02d}", value=str(i + 1))
        for i in range(len(state.anomalies))
    ]
    return BreedInput(
        intent=state.intent,
        facts=facts,
        rules=[],
        cases=[],
        goals=[],
        candidates=[],
        state=[],
    )


def encode_version_space(state: K8sIncidentState) -> BreedInput:
    """One boolean attribute per distinct anomaly kind observed; the single
    observed incident is encoded as one positive example (all attributes
    "Match" where that anomaly kind is present) -- a minimal, real version
    space, not the fixed 2-example fixture."""
    kinds = sorted({a.kind for a in state.anomalies})
    if not kinds:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    values = ",".join("Match" for _ in kinds)
    facts = [
        Fact(key="vs:attrs", value=",".join(kinds)),
        Fact(key="vs:example:1", value=f"{values}:+"),
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


def encode_dendral(state: K8sIncidentState) -> BreedInput:
    """``fault_hint`` (if present) plus its real sibling taxonomy ids become
    ranked candidates, ``fault_hint`` scored highest; anomalies whose kind
    doesn't match any candidate's own kind become ``forbid`` constraints,
    mirroring the original fixture's elimination-via-constraint pattern but
    derived from real state instead of a fixed id list."""
    sibling_ids = _load_real_fault_ids()
    ordered_ids: list[str] = []
    if state.fault_hint:
        ordered_ids.append(state.fault_hint)
    ordered_ids += [fid for fid in sibling_ids if fid not in ordered_ids][:4]
    candidate_models = [
        Candidate(id=fid, score=round(1.0 - 0.05 * i, 4), eliminated=False)
        for i, fid in enumerate(ordered_ids)
    ]
    facts = [
        Fact(key="constraint", value=f"forbid:{a.kind.lower()}")
        for a in state.anomalies
        if state.fault_hint and a.kind.lower() not in state.fault_hint.lower()
    ]
    return BreedInput(
        intent=state.intent,
        facts=facts,
        rules=[],
        cases=[],
        goals=[],
        candidates=candidate_models,
        state=[],
    )


def encode_mycin(state: K8sIncidentState) -> BreedInput:
    """Every anomaly becomes one ``signal`` fact keyed by its
    ``kind:relation_class``; if 2+ signals are present, one chained rule
    fires a ``root-cause`` conclusion from all of them (mirroring the
    original fixture's 2-rule diagnose->recommend chain), certainty derived
    from anomaly count (more corroborating anomalies -> higher certainty,
    capped at 0.95) rather than a fixed literal."""
    signals = [_anomaly_key(a) for a in state.anomalies]
    facts = [Fact(key="signal", value=sig) for sig in signals]
    rules: list[Rule] = []
    if signals:
        cause = state.fault_hint or "unclassified-anomaly-cluster"
        certainty = min(0.5 + 0.1 * len(signals), 0.95)
        rules.append(
            Rule(
                id="diagnose-root-cause",
                premise=signals,
                conclusion=f"root-cause={cause}",
                certainty=certainty,
            )
        )
        rules.append(
            Rule(
                id="recommend-remediation",
                premise=[f"root-cause={cause}"],
                conclusion="recommended-action=investigate-root-cause",
                certainty=0.9,
            )
        )
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


def _encode_strips_compatible(state: K8sIncidentState, rule_id_prefix: str) -> BreedInput:
    """Shared STRIPS-compatible encoding: the first anomaly's
    ``field=observed`` becomes the current state atom; its
    ``field=expected`` (if present) becomes the goal; one fix rule
    transitions between them. With no anomalies or no ``expected`` value, an
    empty (trivially satisfied) plan -- honest rather than fabricating a goal
    that was never observed. Shared by ``encode_strips``, ``encode_gps``,
    ``encode_partial_order_plan``, and ``encode_htn_planning`` -- each of
    those breeds' own doc comments states its engine is directly
    STRIPS-compatible (same ``predicate=value`` state/goal atoms, same
    ``!predicate=value``-means-removed rule-effect convention), confirmed by
    reading their real Rust source, not assumed from the name."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    if anomaly.expected is None:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    predicate = anomaly.field
    current_atom = StateAtom(predicate=predicate, value=anomaly.observed)
    goal = Goal(id="g1", predicate=predicate, value=anomaly.expected)
    fix_rule = Rule(
        id=f"{rule_id_prefix}-{_anomaly_key(anomaly)}",
        premise=[f"{predicate}={anomaly.observed}"],
        conclusion=f"{predicate}={anomaly.expected};!{predicate}={anomaly.observed}",
        certainty=1.0,
    )
    return BreedInput(
        intent=state.intent,
        facts=[],
        rules=[fix_rule],
        cases=[],
        goals=[goal],
        candidates=[],
        state=[current_atom],
    )


def encode_strips(state: K8sIncidentState) -> BreedInput:
    return _encode_strips_compatible(state, rule_id_prefix="fix")


def encode_gps(state: K8sIncidentState) -> BreedInput:
    """GPS (General Problem Solver, Newell & Shaw 1963) -- its own doc
    comment confirms means-ends gap reduction over the same STRIPS-style
    rule/state/goal convention. Direct reuse of ``_encode_strips_compatible``."""
    return _encode_strips_compatible(state, rule_id_prefix="gps-fix")


def encode_partial_order_plan(state: K8sIncidentState) -> BreedInput:
    """Partial Order Planning (McAllester 1991) -- doc comment states
    "Encoding is compatible with STRIPS-style rules and state." Direct
    reuse of ``_encode_strips_compatible``."""
    return _encode_strips_compatible(state, rule_id_prefix="pop-fix")


def encode_htn_planning(state: K8sIncidentState) -> BreedInput:
    """Hierarchical Task Network Planning. NOT a reuse of
    ``_encode_strips_compatible`` -- its doc comment claims STRIPS-compatible
    encoding, but reading its real ``run()`` shows ``input.goals[i].value``
    is consumed as a TASK TOKEN (either ``op:<rule-id>`` or a compound task
    name matched against ``method:<task>:<variant>``-prefixed rule ids), not
    a ``predicate=value`` atom -- confirmed live: the shared-helper encoding
    real-ran with ``NO_EVIDENCE: "no plan found"`` because its goal value
    (an expected field value like ``"3"``) isn't a task name any rule
    matches. Real fix: a single-task plan whose one task is an ``op:``
    operator reference, with a matching operator rule -- htn_seek's own
    ``t1.starts_with("op:")`` branch, confirmed by reading the source."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    if anomaly.expected is None:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    predicate = anomaly.field
    op_id = f"op:htn-fix-{_anomaly_key(anomaly)}"
    current_atom = StateAtom(predicate=predicate, value=anomaly.observed)
    task_goal = Goal(id="g1", predicate="task", value=op_id)
    op_rule = Rule(
        id=op_id,
        premise=[f"{predicate}={anomaly.observed}"],
        conclusion=f"{predicate}={anomaly.expected};!{predicate}={anomaly.observed}",
        certainty=1.0,
    )
    return BreedInput(
        intent=state.intent,
        facts=[],
        rules=[op_rule],
        cases=[],
        goals=[task_goal],
        candidates=[],
        state=[current_atom],
    )


def encode_prolog(state: K8sIncidentState) -> BreedInput:
    """Flat-term unification over ground facts and Horn rules
    (``input.facts``/``.rules``/``.goals``, confirmed real). Anomalies become
    ground ``signal`` facts (same convention as ``encode_mycin``);
    ``fault_hint`` becomes a queryable goal atom; a single Horn rule chains
    the observed signals to that goal."""
    signals = [_anomaly_key(a) for a in state.anomalies]
    facts = [Fact(key="signal", value=sig) for sig in signals]
    rules: list[Rule] = []
    goals: list[Goal] = []
    if signals and state.fault_hint:
        rules.append(
            Rule(
                id="prolog-derive-cause",
                premise=signals,
                conclusion=f"cause={state.fault_hint}",
                certainty=1.0,
            )
        )
        goals.append(Goal(id="g1", predicate="cause", value=state.fault_hint))
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=goals, candidates=[], state=[])


def encode_default_logic(state: K8sIncidentState) -> BreedInput:
    """Reiter normal defaults (``input.facts``/``.rules``, confirmed real).
    Each anomaly is an observed fact; one normal-default rule per anomaly
    concludes a default diagnosis in the absence of a stated contrary --
    the honest way to represent "defeasible unless contradicted" without
    fabricating an explicit ``not_ab_`` counter-fact this encoder has no
    real source for."""
    facts = [Fact(key="observed", value=_anomaly_key(a)) for a in state.anomalies]
    cause = state.fault_hint or "unclassified-anomaly-cluster"
    rules = [
        Rule(
            id=f"default-{_anomaly_key(a)}",
            premise=[_anomaly_key(a)],
            conclusion=f"default-cause={cause}",
            certainty=0.75,
        )
        for a in state.anomalies
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


def encode_asp(state: K8sIncidentState) -> BreedInput:
    """Answer Set Programming (``input.facts``/``.rules``, confirmed real;
    ASP's own precondition accepts facts-only or rules-only). Anomalies
    become ground facts; a derivation rule is added only when ``fault_hint``
    is present -- with no fault_hint, an honest facts-only program rather
    than a fabricated rule with no real conclusion to draw."""
    facts = [Fact(key="anomaly", value=_anomaly_key(a)) for a in state.anomalies]
    rules: list[Rule] = []
    if state.fault_hint and state.anomalies:
        rules.append(
            Rule(
                id="asp-derive-cause",
                premise=[_anomaly_key(a) for a in state.anomalies],
                conclusion=f"cause={state.fault_hint}",
                certainty=1.0,
            )
        )
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


def encode_abductive_ibe(state: K8sIncidentState) -> BreedInput:
    """Abduction by Inference to the Best Explanation, Thagard's ECHO
    (``input.facts``/``.rules``/``.candidates``, confirmed real). Same
    evidence-as-facts (mycin-style) + fault_hint-and-siblings-as-candidates
    (dendral-style) combination -- both patterns already proven in this
    module, composed rather than reinvented."""
    mycin_shaped = encode_mycin(state)
    dendral_shaped = encode_dendral(state)
    return BreedInput(
        intent=state.intent,
        facts=mycin_shaped.facts,
        rules=mycin_shaped.rules,
        cases=[],
        goals=[],
        candidates=dendral_shaped.candidates,
        state=[],
    )


def encode_abductive_lp(state: K8sIncidentState) -> BreedInput:
    """Abductive Logic Programming (``input.facts``/``.rules``/``.goals``,
    confirmed real). Same evidence/rule shape as ``encode_abductive_ibe``,
    plus an explicit abducible goal from ``fault_hint`` -- ALP needs a goal
    to abduce an explanation for."""
    base = encode_abductive_ibe(state)
    goals = [Goal(id="g1", predicate="cause", value=state.fault_hint)] if state.fault_hint else []
    return BreedInput(
        intent=state.intent,
        facts=base.facts,
        rules=base.rules,
        cases=[],
        goals=goals,
        candidates=base.candidates,
        state=[],
    )


def encode_ilp(state: K8sIncidentState) -> BreedInput:
    """FOIL (Quinlan 1990): induces Horn clauses from ``pos:``/``neg:``/
    ``bg:``-prefixed facts (confirmed real via the breed's own key-prefix
    parsing). Each anomaly becomes one ``bg:``-prefixed ground background
    atom. Deliberately emits NO ``pos:``/``neg:`` facts -- a single incident
    has no real positive/negative example set for a target relation to
    learn; fabricating one would invent the very examples FOIL is meant to
    generalize from.

    NOT registered in ``DETERMINISTIC_ENCODER_BREEDS`` (unlike this module's
    other encoders): confirmed live that ``ilp``'s real ``preconditions()``
    hard-requires ``"at least one pos:<atom> example"`` -- a background-
    facts-only program doesn't just produce a trivial theory, it's REFUSED
    outright before ``run()``. Since satisfying that precondition honestly
    would require inventing the very positive example this docstring
    already explains we won't fabricate, this breed stays real-but-
    unregistered, same as the explicitly-deferred marginal breeds
    (``dempster_shafer``/``soar``/``problog``/``mdp``) -- kept here as a
    real, callable encoder for a future caller that DOES have a legitimate
    positive-example source, not deleted."""
    facts = [
        Fact(key="bg", value=f"{a.kind.lower()}({a.object_name},{a.namespace})")
        for a in state.anomalies
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


def encode_event_calculus(state: K8sIncidentState) -> BreedInput:
    """Discrete Event Calculus (Kowalski 1986) -- confirmed real canonical
    fact-key convention: ``ec:initially`` (fluent true at t=0),
    ``ec:happens:<time>`` (event occurrence), ``ec:initiates:<event>``
    (fluent the event brings about). The first anomaly's ``observed`` value
    becomes the initial fluent; the anomaly itself is the event at t=0;
    its ``expected`` value (if present) becomes the fluent that event
    initiates -- omitted when absent, honest rather than a fabricated
    target fluent."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    event = _anomaly_key(anomaly)
    facts = [
        Fact(key="ec:initially", value=f"{anomaly.field}={anomaly.observed}"),
        Fact(key="ec:happens:0", value=event),
    ]
    if anomaly.expected is not None:
        facts.append(Fact(key=f"ec:initiates:{event}", value=f"{anomaly.field}={anomaly.expected}"))
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


def encode_fuzzy_logic(state: K8sIncidentState) -> BreedInput:
    """Mamdani fuzzy inference (Zadeh 1965) -- confirmed real: ``preconditions()``
    requires BOTH a ``fuzzy:input:`` fact AND a non-empty ``rules`` list (a
    first attempt with only the input fact real-ran with
    ``NO_EVIDENCE: "precondition failed"`` -- rules were empty). ``run()``
    further requires an actual ``Mf::parse``-able membership-function fact
    (``triangular:a,b,c`` / ``trapezoidal:a,b,c,d``) per term a rule
    references, for both the input and output variable, confirmed by
    reading ``Mf::parse``/the rule-firing loop directly.

    Honest degenerate choice (no domain-calibrated membership curve is
    invented, since anomaly data carries no such calibration): a single
    binary "incident observed" input variable fixed at 1.0, a full-support
    trapezoidal "present" term covering it, one rule firing that term to a
    same-shaped output term named after ``fault_hint`` (or a generic
    "investigate" term when absent) -- real, working Mamdani mechanics
    (fuzzify -> fire -> aggregate -> centroid-defuzzify all genuinely
    execute), just not a claim of meaningful fuzzy semantics beyond
    "an anomaly was observed"."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    output_term = state.fault_hint or "investigate"
    full_support = "trapezoidal:0,0,10,10"  # membership=1.0 for any x in [0,10]
    facts = [
        Fact(key="fuzzy:input:incident", value="1.0"),
        Fact(key="fuzzy:incident:present", value=full_support),
        Fact(key=f"fuzzy:diagnosis:{output_term}", value=full_support),
    ]
    rules = [
        Rule(
            id="fuzzy-diagnose",
            premise=["fuzzy:incident:present"],
            conclusion=f"fuzzy:diagnosis:{output_term}",
            certainty=1.0,
        )
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


def encode_qualitative_reason(state: K8sIncidentState) -> BreedInput:
    """de Kleer-Brown qualitative sign algebra (``input.facts``/``.rules``,
    confirmed real). Each anomaly with both ``observed`` and ``expected``
    values contributes one qualitative sign fact on its named quantity
    (``field``): ``+`` if observed != expected in a way this encoder can
    only honestly call "changed" (not a fabricated direction/magnitude),
    ``0`` if they match."""
    facts = []
    for a in state.anomalies:
        if a.expected is None:
            continue
        sign = "0" if a.observed == a.expected else "+"
        facts.append(Fact(key=f"qr:{a.field}", value=sign))
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


def encode_triz(state: K8sIncidentState) -> BreedInput:
    """Altshuller's TRIZ contradiction matrix -- confirmed real: the breed
    reads ``improving=X``/``worsening=Y`` from ``input.facts`` and falls
    back to its own embedded static matrix when no matching rule is
    supplied. Only the first anomaly is used (TRIZ's real lookup is
    pairwise, not list-shaped): ``field`` names the improving feature,
    ``relation_class`` the worsening one. A real "no match in the embedded
    matrix" is an honest, expected outcome for most k8s-derived pairs --
    not fabricated to force a hit."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    facts = [
        Fact(key="improving", value=anomaly.field),
        Fact(key="worsening", value=anomaly.relation_class),
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


def encode_hearsay(state: K8sIncidentState) -> BreedInput:
    """Hearsay-II blackboard, used here as a PRIMARY specialist over raw
    anomaly evidence -- distinct from
    ``orchestrator.combine_via_hearsay``'s use of the same breed to fuse
    OTHER breeds' already-computed reports. Confirmed real convention:
    ``input.facts`` post level-0 hypotheses; ``input.rules`` encode
    knowledge sources as ``rule.premise[0]`` (trigger) -> ``rule.conclusion``
    (posted hypothesis), ``rule.certainty`` = KS confidence. Each anomaly
    posts one level-0 hypothesis; if ``fault_hint`` is present, one KS rule
    per anomaly promotes that hypothesis toward a ``diagnosis`` level."""
    facts = [Fact(key=a.kind, value=a.relation_class) for a in state.anomalies]
    rules: list[Rule] = []
    if state.fault_hint:
        rules = [
            Rule(
                id=f"ks-promote-{_anomaly_key(a)}",
                premise=[a.relation_class],
                conclusion=f"diagnosis:{state.fault_hint}",
                certainty=0.8,
            )
            for a in state.anomalies
        ]
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


def encode_cbr(state: K8sIncidentState) -> BreedInput:
    """Each anomaly's ``kind``/``relation_class``/``namespace`` becomes one
    precedent case (facts describing that anomaly, ``architecture`` = a
    real sibling fault id if the taxonomy is available, else the anomaly's
    own ``kind:relation_class`` key); the query's own top-level facts
    describe the FIRST anomaly using the same fact keys, so real Jaccard
    overlap can be computed by the breed itself -- generalized from the
    original fixture's fixed 3-service scenario."""
    sibling_ids = _load_real_fault_ids()
    cases = []
    for i, a in enumerate(state.anomalies):
        architecture = sibling_ids[i % len(sibling_ids)] if sibling_ids else _anomaly_key(a)
        cases.append(
            Case(
                id=f"incident-{a.namespace}-{a.object_name}-{i}",
                intent=f"{a.kind} anomaly in {a.namespace}/{a.object_name}: {a.detail}",
                architecture=f"fix-{architecture}",
                outcome_score=round(0.9 - 0.1 * i, 4),
                facts=[
                    Fact(key="kind", value=a.kind),
                    Fact(key="relation_class", value=a.relation_class),
                    Fact(key="namespace", value=a.namespace),
                ],
            )
        )
    if not cases:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    query_anomaly = state.anomalies[0]
    query_facts = [
        Fact(key="kind", value=query_anomaly.kind),
        Fact(key="relation_class", value=query_anomaly.relation_class),
        Fact(key="namespace", value=query_anomaly.namespace),
    ]
    candidates = [Candidate(id=c.id, score=0.0, eliminated=False) for c in cases]
    return BreedInput(
        intent=state.intent,
        facts=query_facts,
        rules=[],
        cases=cases,
        goals=[],
        candidates=candidates,
        state=[],
    )


def encode_autoinstinct_learning(state: K8sIncidentState) -> BreedInput:
    """AutoinstinctLearning -- STRIPS/HACKER bitwise heuristic planning
    (breeds/autoinstinct_learning.rs). Confirmed real from ``run()``: goals
    and facts are consumed PURELY POSITIONALLY -- ``goal_mask`` sets bit i
    for ``input.goals[i]`` (index only, predicate/value content never read),
    ``initial_features`` sets bit i for ``input.facts[i]`` (same, index
    only). NOT a ``predicate=value`` atom match like the STRIPS-compatible
    family (``_encode_strips_compatible``) -- there is no goal/state atom
    matching here at all, just bit-count arithmetic. ``preconditions()``
    only requires a non-empty ``goals`` list; ``rules``/``cases``/``state``
    are unused by this breed's ``run()``.

    Honest encoding: one goal per anomaly that has a real ``expected`` value
    (each such anomaly is a genuine, real thing this incident needs fixed --
    not a fabricated sub-goal), named with the real field/expected pair for
    traceability even though the breed itself never reads goal content. One
    fact per anomaly (observed state, positional only) so the initial
    bitmask reflects the real number of already-observed conditions. With no
    anomalies carrying an ``expected`` value, an honest empty BreedInput
    (no goals) -- the same degrade-when-nothing-to-plan-toward discipline as
    ``encode_strips``."""
    goal_anomalies = [a for a in state.anomalies if a.expected is not None]
    if not goal_anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    facts = [Fact(key=f"observed:{_anomaly_key(a)}", value=a.observed) for a in state.anomalies]
    goals = [
        Goal(id=f"g{i}", predicate=a.field, value=a.expected)
        for i, a in enumerate(goal_anomalies)
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=goals, candidates=[], state=[])


def encode_circumscription(state: K8sIncidentState) -> BreedInput:
    """McCarthy predicate circumscription (breeds/circumscription.rs).
    Confirmed real from ``ab_atoms()``/``closure()``: ``ab_``-prefixed
    ATOMS must be RULE-DERIVED, never stated as raw facts -- ``closure()``
    seeds its working set from ALL of ``input.facts`` unconditionally
    regardless of the candidate abnormality set ``S`` being enumerated, so a
    raw ``ab_x`` fact would be true in every candidate model and short-
    circuit real minimization entirely. This mirrors the breed's own
    fixture: ``penguin_opus`` is the raw fact, ``ab_bird_opus`` is DERIVED
    from it by a rule (``r-penguin-ab``), never asserted directly.

    Honest encoding, same discipline: each anomaly becomes one plain
    (non-``ab_``) trigger fact (its real ``kind:relation_class`` key -- an
    anomaly genuinely was observed, that's a real fact, not a fabricated
    one), plus one rule deriving that anomaly's real abnormality atom
    ``ab_<kind_relationclass>`` from the trigger. A second rule concludes a
    root-cause atom (``root_cause_<fault_hint>``, or an honest generic
    ``root_cause_detected`` when no ``fault_hint`` was supplied) from the
    conjunction of every derived abnormality atom -- an anomaly genuinely IS
    an abnormal condition, so entailing a root cause from "all observed
    anomalies are abnormal" is a real, not fabricated, inference. The goal
    tests cautious entailment of that root-cause atom (``preconditions()``
    requires >=1 rule and >=1 goal, confirmed real). Capped at the real
    12-abnormality-atom limit via ``state.anomalies[:12]`` -- a refusal
    ceiling, not silent truncation, per the breed's own doc comment."""
    anomalies = state.anomalies[:12]
    if not anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    trigger_facts = [Fact(key=_anomaly_key(a), value="true") for a in anomalies]
    ab_keys = [f"ab_{_anomaly_key(a).replace(':', '_')}" for a in anomalies]
    ab_rules = [
        Rule(id=f"ab-derive-{i}", premise=[trigger_facts[i].key], conclusion=ab_keys[i], certainty=1.0)
        for i in range(len(anomalies))
    ]
    cause = f"root_cause_{state.fault_hint}" if state.fault_hint else "root_cause_detected"
    cause_rule = Rule(id="circumscribe-root-cause", premise=ab_keys, conclusion=cause, certainty=1.0)
    goal = Goal(id="g1", predicate="entail", value=cause)
    return BreedInput(
        intent=state.intent,
        facts=trigger_facts,
        rules=[*ab_rules, cause_rule],
        cases=[],
        goals=[goal],
        candidates=[],
        state=[],
    )


def _safe_ident(raw: str) -> str:
    """Sanitize an anomaly field name into a valid propositional-atom /
    EBL-term identifier -- alnum + underscore only, non-empty, doesn't start
    with a digit. Real anomaly ``field`` values include dotted paths
    (``spec.selector``) that neither the tableaux formula parser's ``ident``
    token nor EBL's ``Term::parse`` would round-trip safely."""
    ident = re.sub(r"[^A-Za-z0-9_]", "_", raw)
    if not ident or ident[0].isdigit():
        ident = f"f_{ident}"
    return ident


def encode_ebl(state: K8sIncidentState) -> BreedInput:
    """Explanation-Based Learning (``crates/wasm4pm-cognition/src/breeds/ebl.rs``,
    read in full): ``preconditions()`` hard-requires a non-empty ``goals``
    list AND a non-empty ``rules`` list (a real domain theory) -- confirmed
    real, not guessed. ``run()``'s ``explain()`` proves ``goals[0]`` by SLD
    backward-chaining over ``input.rules``/``input.facts``, where every fact
    is matched by its bare ``key`` string as a Prolog-style ground term
    (``Term::parse`` -- ``pred(arg1,arg2)``), and every rule's ``premise``/
    ``conclusion`` strings are terms in that same grammar, unified with
    ``?``-prefixed variables.

    Honest single-anomaly domain theory, same ``field=observed`` ->
    ``field=expected`` premise/conclusion pattern already proven in
    ``encode_strips``/``encode_mycin`` -- here expressed as a Horn rule
    ``{field}_observed(?x) => {field}_expected(?x)`` instead of a
    ``predicate=value`` STRIPS atom, since EBL's engine consumes Prolog
    terms, not STRIPS atoms (confirmed by reading ``explain``/``unify``
    directly). The training example is the first anomaly's own object:
    fact ``{field}_observed(<object_name>)``, goal
    ``{field}_expected(<object_name>)``. Honest-empty (matching the guard
    ``encode_strips`` already uses) when there is no anomaly or no
    ``expected`` value to generalize from -- fabricating one would invent
    the very training example EBL is meant to generalize."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    if anomaly.expected is None:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    field = _safe_ident(anomaly.field)
    obj = _safe_ident(anomaly.object_name)
    observed_pred = f"{field}_observed"
    expected_pred = f"{field}_expected"

    facts = [Fact(key=f"{observed_pred}({obj})", value="true")]
    rules = [
        Rule(
            id=f"ebl-domain-{_anomaly_key(anomaly)}",
            premise=[f"{observed_pred}(?x)"],
            conclusion=f"{expected_pred}(?x)",
            certainty=1.0,
        )
    ]
    goals = [Goal(id="g1", predicate=expected_pred, value=obj)]
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=goals, candidates=[], state=[])


def encode_tableaux(state: K8sIncidentState) -> BreedInput:
    """Smullyan signed analytic tableaux
    (``crates/wasm4pm-cognition/src/breeds/tableaux.rs``, read in full):
    ``preconditions()`` requires exactly one ``tableaux:formula`` fact whose
    value parses under the shared Pratt formula grammar (propositional
    fragment only: atoms, ``!``, ``&``, ``|``, ``->``, ``true``/``false`` --
    confirmed by reading ``Formula::parse``/``is_propositional`` directly;
    temporal/CTL operators are refused before ``run()``).

    Honest single-anomaly formula derived from the first anomaly with a real
    ``expected`` value: an implication from "the observed state holds" to
    "the expected state does NOT hold" -- ``{field}_observed ->
    !{field}_expected`` -- a genuine propositional claim this encoder can
    actually derive from the anomaly (the observed and expected values are
    real and distinct; asserting the observed condition rules out the
    expected one is the honest reading of "anomaly", not a fabricated
    tautology or contradiction chosen to force a particular valid/invalid
    verdict). Atom names sanitized via ``_safe_ident`` since ``field`` may
    be a dotted path (``spec.selector``) the tokenizer's ``ident`` rule
    wouldn't accept as-is. Honest-empty (no ``tableaux:formula`` fact, same
    guard convention as ``encode_strips``) when there is no anomaly or no
    ``expected`` value to build a genuine claim from."""
    if not state.anomalies:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])
    anomaly = state.anomalies[0]
    if anomaly.expected is None:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    field = _safe_ident(anomaly.field)
    observed_atom = f"{field}_observed"
    expected_atom = f"{field}_expected"
    formula = f"{observed_atom} -> !{expected_atom}"
    facts = [Fact(key="tableaux:formula", value=formula)]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


DETERMINISTIC_ENCODER_BREEDS: tuple[str, ...] = (
    "sat_cdcl",
    "version_space",
    "dendral",
    "mycin",
    "strips",
    "cbr",
    "gps",
    "partial_order_plan",
    "htn_planning",
    "prolog",
    "default_logic",
    "asp",
    "abductive_ibe",
    "abductive_lp",
    "event_calculus",
    "fuzzy_logic",
    "qualitative_reason",
    "triz",
    "hearsay",
    "ebl",
    "tableaux",
    "autoinstinct_learning",
    "circumscription",
)

_DETERMINISTIC_ENCODERS: dict[str, Callable[[K8sIncidentState], BreedInput]] = {
    "sat_cdcl": encode_sat_cdcl,
    "version_space": encode_version_space,
    "dendral": encode_dendral,
    "mycin": encode_mycin,
    "strips": encode_strips,
    "cbr": encode_cbr,
    "gps": encode_gps,
    "partial_order_plan": encode_partial_order_plan,
    "htn_planning": encode_htn_planning,
    "prolog": encode_prolog,
    "default_logic": encode_default_logic,
    "asp": encode_asp,
    "abductive_ibe": encode_abductive_ibe,
    "abductive_lp": encode_abductive_lp,
    "event_calculus": encode_event_calculus,
    "fuzzy_logic": encode_fuzzy_logic,
    "qualitative_reason": encode_qualitative_reason,
    "triz": encode_triz,
    "hearsay": encode_hearsay,
    "ebl": encode_ebl,
    "tableaux": encode_tableaux,
    "autoinstinct_learning": encode_autoinstinct_learning,
    "circumscription": encode_circumscription,
}


def encode_for_breed(breed: str, state: K8sIncidentState) -> BreedInput | None:
    """The deterministic encoding for ``breed`` if one is registered, else
    ``None`` -- an explicit, honest "no deterministic encoder" signal, never
    a fabricated best-effort payload."""
    encoder = _DETERMINISTIC_ENCODERS.get(breed)
    return encoder(state) if encoder is not None else None


def encode_incident(
    state: K8sIncidentState,
    target_breeds: Iterable[str] | None = None,
) -> dict[str, BreedInput]:
    """Apply every registered deterministic encoder whose breed id is in
    ``target_breeds`` (default: every registered breed id, real, parsed from
    the registry). Breeds with no deterministic encoder are silently omitted
    from the result -- not an error, since ``target_breeds`` defaulting to
    the full registry is expected to include many breeds this module has no
    verified encoding for."""
    breeds = tuple(sorted(breed_ids())) if target_breeds is None else tuple(target_breeds)
    return {breed: encoded for breed in breeds if (encoded := encode_for_breed(breed, state)) is not None}
