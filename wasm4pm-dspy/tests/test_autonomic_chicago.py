"""Chicago-style tests for :mod:`wasm4pm_dspy.autonomic` -- the real
Monitor->Analyze->Plan->Propose->Knowledge cycle built to close this
session's found autonomic gap (a continuous loop native to the k8s
cognition-breed layer, honestly NOT wired into the incompatible Rust
``AutoProcessAgent``/``RlState`` -- see ``autonomic.py``'s module docstring).

Real components throughout: real `k8s_state.encode_incident`, real
`orchestrator.diagnose` (real admit + real `wpm` subprocess run + real
BLAKE3 receipt verify per breed, per cycle). No mocks anywhere, no LLM
anywhere -- gated only on the built CLI, same skip pattern as
`test_orchestrator_chicago.py`.

Two real, deliberately chosen breed subsets drive the scenarios below --
not arbitrary, both grounded in `orchestrator.extract_confidence`'s own
real, already-existing per-breed knowledge:
  - `_KNOWN_CONFIDENCE_BREEDS`: the 6 breeds `extract_confidence` can
    actually grade (sat_cdcl/version_space/dendral/mycin/strips/cbr) -- a
    real incident against these produces a real confidence > the healthy
    threshold, confirmed live before writing these assertions.
  - `_UNKNOWN_CONFIDENCE_BREEDS`: the other 13 registered breeds, which
    `extract_confidence` honestly returns 0.0 for (no established
    extraction) regardless of real execution success -- confirmed live to
    all real-succeed (`status == "ok"`) for the same healthy incident, so
    this scenario exercises a real, non-crashing, genuinely low-confidence
    cycle rather than an artificially empty/precondition-failing one.
"""

from __future__ import annotations

import asyncio

import pytest

from wasm4pm_dspy.autonomic import AutonomicAgent, run_cycle
from wasm4pm_dspy.k8s_state import DETERMINISTIC_ENCODER_BREEDS, K8sAnomaly, K8sIncidentState
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)

_KNOWN_CONFIDENCE_BREEDS = ("sat_cdcl", "version_space", "dendral", "mycin", "strips", "cbr")
_UNKNOWN_CONFIDENCE_BREEDS = tuple(b for b in DETERMINISTIC_ENCODER_BREEDS if b not in _KNOWN_CONFIDENCE_BREEDS)


def _frontend_scale_to_zero_state() -> K8sIncidentState:
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


# ============================================================================
# 1. Healthy incident against known-confidence breeds: breaker stays closed,
#    real Knowledge history grows one real CycleRecord per cycle.
# ============================================================================


def test_healthy_cycles_keep_circuit_closed_and_grow_history():
    state = _frontend_scale_to_zero_state()
    agent = AutonomicAgent()

    async def _run():
        for _ in range(3):
            await run_cycle(agent, state, target_breeds=_KNOWN_CONFIDENCE_BREEDS)

    asyncio.run(_run())
    assert agent.cycle_count == 3
    assert len(agent.history) == 3
    assert agent.circuit_state == "closed"
    for record in agent.history:
        assert record.decision == "continue_monitoring"
        assert record.confidence >= agent.healthy_confidence_threshold
        assert record.meta_status == "ok"
        assert record.hearsay_status == "ok"
        assert set(record.breeds_ok) == set(_KNOWN_CONFIDENCE_BREEDS)


# ============================================================================
# 2. Real, non-crashing low-confidence cycles (unknown-confidence breeds,
#    all real-executing) trip the breaker open after failure_threshold.
# ============================================================================


def test_low_confidence_cycles_trip_circuit_open():
    state = _frontend_scale_to_zero_state()
    agent = AutonomicAgent(failure_threshold=3, cooldown_cycles=5)

    async def _run():
        records = []
        for _ in range(3):
            records.append(await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS))
        return records

    records = asyncio.run(_run())
    assert [r.confidence for r in records] == [0.0, 0.0, 0.0]
    assert [r.decision for r in records] == ["propose_escalate", "propose_escalate", "propose_escalate"]
    assert records[-1].circuit_state == "open"
    assert agent.circuit_state == "open"
    assert agent.opened_at_cycle == 3
    # Real successful execution throughout -- low confidence is a real
    # extract_confidence limitation, not a run failure.
    for r in records:
        assert set(r.breeds_ok) == set(_UNKNOWN_CONFIDENCE_BREEDS)


def test_open_circuit_skips_real_analyze_until_cooldown_elapses():
    """While open, real Analyze/Plan work is skipped entirely -- the real
    point of a breaker. Asserted by the skipped cycle's own record: no
    breeds attempted, no combiner status, decision == circuit_open_skip."""
    state = _frontend_scale_to_zero_state()
    agent = AutonomicAgent(failure_threshold=2, cooldown_cycles=3)

    async def _run():
        for _ in range(2):  # trip the breaker
            await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS)
        return await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS)

    skipped = asyncio.run(_run())
    assert agent.circuit_state == "open"
    assert skipped.decision == "circuit_open_skip"
    assert skipped.breeds_attempted == ()
    assert skipped.breeds_ok == ()
    assert skipped.meta_status is None
    assert skipped.hearsay_status is None
    assert agent.cycle_count == 3  # cycle count still real-advances even while skipped


# ============================================================================
# 3. After cooldown, a real healthy trial cycle closes the breaker again --
#    real half_open -> closed transition, not asserted by construction.
# ============================================================================


def test_healthy_trial_cycle_closes_breaker_after_cooldown():
    state = _frontend_scale_to_zero_state()
    agent = AutonomicAgent(failure_threshold=2, cooldown_cycles=1)

    async def _run():
        for _ in range(2):  # trip the breaker
            await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS)
        # Cooldown of 1 cycle has elapsed by the next call -- real half_open
        # trial, this time against known-confidence breeds (real healthy).
        return await run_cycle(agent, state, target_breeds=_KNOWN_CONFIDENCE_BREEDS)

    trial = asyncio.run(_run())
    assert trial.decision == "continue_monitoring"
    assert trial.circuit_state == "closed"
    assert agent.circuit_state == "closed"
    assert agent.consecutive_low_confidence == 0


def test_unhealthy_trial_cycle_reopens_breaker_and_resets_cooldown():
    state = _frontend_scale_to_zero_state()
    agent = AutonomicAgent(failure_threshold=2, cooldown_cycles=1)

    async def _run():
        for _ in range(2):  # trip the breaker (opens at cycle 2)
            await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS)
        # Real half_open trial, still unhealthy breeds -- must re-open.
        return await run_cycle(agent, state, target_breeds=_UNKNOWN_CONFIDENCE_BREEDS)

    trial = asyncio.run(_run())
    assert trial.decision == "propose_escalate"
    assert trial.circuit_state == "open"
    assert agent.circuit_state == "open"
    assert agent.opened_at_cycle == trial.cycle  # cooldown clock real-reset to this cycle
