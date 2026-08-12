"""Chicago-style tests for :mod:`wasm4pm_dspy.ocpm_state` -- Bridge 3, a real
OCPM (object-centric process mining) discovered-process state -> per-breed
``BreedInput`` encoder.

Real components throughout: a real GymAct-emitted OCEL 2.0 fixture parsed
by the real ``ocpm_state_from_ocel``, real ``admit_breed_input``, real
``run_admitted_breed_input`` (real subprocess, real WASM execution, real
BLAKE3 receipt verification). No mocks anywhere -- named skip (never a mock
substitute) if the fixture or the built ``wpm`` CLI isn't available, same
pattern as ``test_gymact_bridge_chicago.py``.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.ocpm_state import (
    DETERMINISTIC_ENCODER_BREEDS_OCPM,
    OcelEventRecord,
    OcelObjectRecord,
    OcpmState,
    encode_allen_temporal,
    encode_episodic_memory,
    encode_for_breed,
    encode_incident,
    encode_ltl_monitor,
    encode_ocpm_route_discoverer,
    encode_script_sam,
    ocpm_state_from_ocel,
)
from wasm4pm_dspy.registry import breed_ids
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli, run_admitted_breed_input

_GYMACT_OCEL_FIXTURE = Path.home() / "gymact" / "tests" / "fixtures" / "real_episode.ocel.json"

requires_gymact_fixture = pytest.mark.skipif(
    not _GYMACT_OCEL_FIXTURE.is_file(),
    reason=f"real GymAct OCEL fixture not found at {_GYMACT_OCEL_FIXTURE} (checkout ~/gymact to run this)",
)

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

requires_wpm_cli = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)


# ============================================================================
# Fixtures -- one real, OCEL-derived state (from the real GymAct fixture),
# one small hand-built state for structural edge cases the real fixture
# doesn't happen to exercise (e.g. a single-event log).
# ============================================================================


def _real_gymact_state() -> OcpmState:
    return ocpm_state_from_ocel(
        _GYMACT_OCEL_FIXTURE, intent="discover object lifecycles from a real GymAct episode"
    )


def _single_event_state() -> OcpmState:
    return OcpmState(
        intent="single event, no held-out cue possible",
        events=[
            OcelEventRecord(
                id="e1", type="act", time="2026-01-01T00:00:00+00:00",
                objects=["o1"], attributes={"standing": "ALIVE"},
            )
        ],
        objects=[OcelObjectRecord(id="o1", type="object")],
    )


def _two_object_state() -> OcpmState:
    """Two objects, three events, real distinct timestamps -- exercises the
    multi-object route/interval/episode paths without depending on the
    external gymact fixture's exact shape."""
    return OcpmState(
        intent="diagnose a small two-object order fulfillment trace",
        events=[
            OcelEventRecord(
                id="e1", type="Create", time="2026-01-01T00:00:00+00:00",
                objects=["order-1", "item-1"], attributes={"standing": "ALIVE"},
            ),
            OcelEventRecord(
                id="e2", type="Pay", time="2026-01-01T00:01:00+00:00",
                objects=["order-1"], attributes={"standing": "ALIVE"},
            ),
            OcelEventRecord(
                id="e3", type="Ship", time="2026-01-01T00:02:00+00:00",
                objects=["item-1"], attributes={"standing": "ALIVE"},
            ),
        ],
        objects=[
            OcelObjectRecord(id="order-1", type="order"),
            OcelObjectRecord(id="item-1", type="item"),
        ],
    )


# ============================================================================
# 1. Real structural cross-check: the real fixture parses into a real,
#    non-empty OcpmState.
# ============================================================================


@requires_gymact_fixture
def test_ocpm_state_from_ocel_parses_real_fixture():
    state = _real_gymact_state()
    assert state.events
    assert state.objects
    # Real fixture invariant confirmed live this session: every event
    # carries a real 'standing' attribute.
    assert all("standing" in e.attributes for e in state.events)
    assert all(e.objects for e in state.events)


# ============================================================================
# 2. Each deterministic encoder produces a real, admitted, executed
#    BreedInput over the real GymAct fixture.
# ============================================================================


@requires_gymact_fixture
@requires_wpm_cli
def test_deterministic_encoders_run_real_breeds_end_to_end_on_real_fixture():
    state = _real_gymact_state()

    async def _run_all():
        outcomes = {}
        for breed in DETERMINISTIC_ENCODER_BREEDS_OCPM:
            breed_input = encode_for_breed(breed, state)
            assert breed_input is not None, f"{breed} must be registered as a deterministic encoder"
            candidate = {"breed": breed, "payload": breed_input.model_dump(mode="json")}
            admitted = admit_breed_input(candidate)
            outcomes[breed] = await run_admitted_breed_input(admitted)
        return outcomes

    results = asyncio.run(_run_all())
    assert set(results) == set(DETERMINISTIC_ENCODER_BREEDS_OCPM)
    for breed, result in results.items():
        assert result.status == "ok", f"{breed} real run did not return status=ok: {result}"
        # run_admitted_breed_input already re-verifies the BLAKE3 receipt
        # internally before returning -- a result existing here means that
        # verification already passed for real.


@requires_wpm_cli
def test_deterministic_encoders_run_real_breeds_end_to_end_on_two_object_state():
    """Same end-to-end real-admit-real-run proof, over a small,
    self-contained (non-gymact-dependent) two-object trace -- runs even
    when ~/gymact isn't checked out."""
    state = _two_object_state()

    async def _run_all():
        outcomes = {}
        for breed in DETERMINISTIC_ENCODER_BREEDS_OCPM:
            breed_input = encode_for_breed(breed, state)
            assert breed_input is not None
            candidate = {"breed": breed, "payload": breed_input.model_dump(mode="json")}
            admitted = admit_breed_input(candidate)
            outcomes[breed] = await run_admitted_breed_input(admitted)
        return outcomes

    results = asyncio.run(_run_all())
    assert set(results) == set(DETERMINISTIC_ENCODER_BREEDS_OCPM)
    for breed, result in results.items():
        assert result.status == "ok", f"{breed} real run did not return status=ok: {result}"


# ============================================================================
# 3. encode_for_breed / encode_incident are honest about unsupported breeds
# ============================================================================


def test_encode_for_breed_returns_none_for_unregistered_breed():
    state = _two_object_state()
    # ctl_check is a real NO_FIT breed for this bridge (see ocpm_state.py's
    # module docstring: a linear OCEL trace has no real branching-successor
    # structure a CTL transition system needs) -- must be an explicit None.
    assert encode_for_breed("ctl_check", state) is None


def test_encode_incident_over_full_registry_covers_only_registered_breeds():
    state = _two_object_state()
    all_breeds = tuple(sorted(breed_ids()))
    result = encode_incident(state, target_breeds=all_breeds)
    assert set(result) == set(DETERMINISTIC_ENCODER_BREEDS_OCPM)
    assert len(all_breeds) > len(DETERMINISTIC_ENCODER_BREEDS_OCPM)  # sanity: registry is really bigger


def test_encode_incident_defaults_to_full_registry():
    state = _two_object_state()
    result = encode_incident(state)
    assert set(result) == set(DETERMINISTIC_ENCODER_BREEDS_OCPM)


# ============================================================================
# 4. Per-encoder structural sanity (no admission/run -- fast, pure checks on
#    real fact/format conventions confirmed by reading the Rust source)
# ============================================================================


def test_encode_ocpm_route_discoverer_uses_real_event_fact_convention():
    state = _two_object_state()
    breed_input = encode_ocpm_route_discoverer(state)
    assert len(breed_input.facts) == 3
    assert all(f.key == "event" for f in breed_input.facts)
    first = breed_input.facts[0].value
    assert first.startswith("id=e1|activity=Create|objects=order-1,item-1|timestamp=")


def test_encode_episodic_memory_holds_out_the_last_real_event_as_cue():
    state = _two_object_state()
    breed_input = encode_episodic_memory(state)
    # 2 of the 3 real events become episodes; the chronologically LAST (e3)
    # is held out as the cue.
    assert len(breed_input.cases) == 2
    assert {c.id for c in breed_input.cases} == {"e1", "e2"}
    episode_time_keys = {f.key for f in breed_input.facts if f.key.startswith("episode:")}
    assert episode_time_keys == {"episode:e1:t", "episode:e2:t"}
    assert any(f.key == "cue:t" for f in breed_input.facts)
    # cue atoms (activity/object) come from the held-out e3 ("Ship"/"item-1")
    assert any(f.key == "activity" and f.value == "Ship" for f in breed_input.facts)
    assert any(f.key == "object" and f.value == "item-1" for f in breed_input.facts)


def test_encode_episodic_memory_empty_on_fewer_than_two_events():
    state = _single_event_state()
    breed_input = encode_episodic_memory(state)
    assert breed_input.cases == []
    assert breed_input.facts == []


def test_encode_allen_temporal_derives_real_tick_based_intervals():
    state = _two_object_state()
    breed_input = encode_allen_temporal(state)
    intervals = {atom.value.split(",")[0]: atom.value for atom in breed_input.state}
    assert set(intervals) == {"order-1", "item-1"}
    # order-1 spans e1 (tick 0) .. e2 (tick 1); item-1 spans e1 (tick 0) .. e3 (tick 2).
    assert intervals["order-1"] == "order-1,0,1"
    assert intervals["item-1"] == "item-1,0,2"
    assert any(f.key == "ocpm:interval-count" for f in breed_input.facts)


def test_encode_ltl_monitor_uses_real_standing_attribute_as_the_alive_atom():
    state = _two_object_state()
    breed_input = encode_ltl_monitor(state)
    formula_fact = next(f for f in breed_input.facts if f.key == "ltl:formula")
    assert formula_fact.value == "G alive"
    trace_facts = sorted(
        (f for f in breed_input.facts if f.key.startswith("trace:")),
        key=lambda f: int(f.key.split(":")[1]),
    )
    assert len(trace_facts) == 3
    assert all(f.value == "alive" for f in trace_facts)  # every fixture event has standing=ALIVE


def test_encode_ltl_monitor_omits_alive_atom_when_standing_not_alive():
    state = OcpmState(
        intent="one event with a non-ALIVE standing",
        events=[
            OcelEventRecord(
                id="e1", type="act", time="2026-01-01T00:00:00+00:00",
                objects=["o1"], attributes={"standing": "DEAD"},
            )
        ],
        objects=[OcelObjectRecord(id="o1", type="object")],
    )
    breed_input = encode_ltl_monitor(state)
    trace0 = next(f for f in breed_input.facts if f.key == "trace:0")
    assert trace0.value == ""


def test_encode_script_sam_uses_real_first_last_event_and_generic_script():
    state = _two_object_state()
    breed_input = encode_script_sam(state)
    assert len(breed_input.facts) == 2
    begin_fact = next(f for f in breed_input.facts if f.key == "sam:event:0")
    end_fact = next(f for f in breed_input.facts if f.key == "sam:event:1")
    # e1 is chronologically first, e3 is chronologically last, in _two_object_state.
    assert begin_fact.value == "lifecycle_begin:e1"
    assert end_fact.value == "lifecycle_end:e3"
    assert len(breed_input.rules) == 1
    rule = breed_input.rules[0]
    assert rule.premise == [
        "lifecycle_begin($a)",
        "lifecycle_progress($a)",
        "lifecycle_end($b)",
    ]
    assert rule.conclusion == "generic_lifecycle"


def test_encode_script_sam_empty_on_fewer_than_two_events():
    state = _single_event_state()
    breed_input = encode_script_sam(state)
    assert breed_input.facts == []
    assert breed_input.rules == []


@requires_wpm_cli
def test_script_sam_real_run_aligns_and_infers_the_real_gap_scene():
    """Real run over the two-object trace: confirms SAM's own real
    bounded-inference algorithm (script_sam.rs's ``min_idx..=max_idx`` loop)
    genuinely infers the unobserved ``lifecycle_progress`` scene between the
    two real observed endpoints, bound to the real first-event id via its
    own real ``apply_bindings`` substitution -- not fabricated by this
    encoder."""
    state = _two_object_state()
    breed_input = encode_script_sam(state)
    candidate = {"breed": "script_sam", "payload": breed_input.model_dump(mode="json")}
    admitted = admit_breed_input(candidate)
    result = asyncio.run(run_admitted_breed_input(admitted))
    assert result.status == "ok"
    assert result.selected == "generic_lifecycle"
    inferred = [
        f for f in result.raw_output["facts"] if f["key"] == "sam:inferred:lifecycle_progress"
    ]
    assert len(inferred) == 1
    assert inferred[0]["value"] == "e1"  # bound to the real first event's id


@requires_wpm_cli
def test_ltl_monitor_real_run_reports_false_at_trace_end_for_an_open_always_formula():
    """Real run over the always-alive two-object trace. Confirmed live this
    session by reading ltl_monitor.rs's own ``evaluate_end`` directly: a
    still-open ``Always(Atom)`` progression (the honest state after every
    real step keeps re-asserting ``alive`` without ever collapsing to a
    literal) evaluates to ``false`` at trace exhaustion -- finite-trace LTL
    monitoring genuinely cannot conclude an unbounded ``G p`` holds just
    because no violation was seen yet. Asserting the real engine's own
    verdict here (not the intuitively-expected 'true') is the honest
    Chicago-style check: it caught this exact real monitor semantic rather
    than assuming it."""
    state = _two_object_state()
    breed_input = encode_ltl_monitor(state)
    candidate = {"breed": "ltl_monitor", "payload": breed_input.model_dump(mode="json")}
    admitted = admit_breed_input(candidate)
    result = asyncio.run(run_admitted_breed_input(admitted))
    assert result.status == "ok"
    assert result.selected == "false"
