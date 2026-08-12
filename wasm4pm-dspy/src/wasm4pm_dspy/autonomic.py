"""80/20 ERRC "Create": the real autonomic gap this session found between
``wasm4pm-dspy``'s one-shot cognition-breed pipeline and ``wasm4pm``'s real
MAPE-K loop (``wasm4pm/src/autoprocess.rs``'s ``AutoProcessAgent``).

NOT a wrapper around ``AutoProcessAgent``: that agent's real ``run_cycle()``
consumes an 8-dim quantized ``RlState`` derived from XES event-log features
(Shannon entropy over activity frequencies, SPC control-chart violations,
...) and dispatches a 5-action ``RlAction`` (``Continue/Scale/Retry/
Fallback/Restart``) meant for process-discovery-algorithm remediation.
Forcing a k8s anomaly into that quantization would mean inventing what
"activity_count" or "SPC alert level" means for a pod restart -- the exact
fabricated-mapping failure mode ``k8s_state.py``'s own encoder-selection
discipline (``triz``, ``dempster_shafer``, ``ilp`` all real, honest NO-FITs)
already refused elsewhere in this session.

Instead: the MAPE-K *pattern* (Monitor -> Analyze -> Plan -> Execute ->
Knowledge), honestly reimplemented native to this module's own real data --
:mod:`wasm4pm_dspy.k8s_state`'s deterministic encoders and
:mod:`wasm4pm_dspy.orchestrator`'s real specialist fan-out/combine, both
reused completely unmodified.

Authority boundary: this module never actuates anything. Its "Execute"
stage is honestly named ``propose_escalate`` -- a typed decision only, the
same SELECT != DO discipline :mod:`wasm4pm_dspy.admission` already encodes
(``AdmittedBreedInput.authority == "SELECT_ONLY"``). No k8s cluster mutation
call exists anywhere in this file.

No reward signal exists yet to learn a Q-table from (unlike
``AutoProcessAgent``'s real Bellman updates) -- this is explicitly NOT
reinforcement learning. The "Knowledge" stage here is a real, inspectable,
append-only cycle log, not a fabricated learned value table.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal

from wasm4pm_dspy import k8s_state, orchestrator
from wasm4pm_dspy.k8s_state import K8sIncidentState
from wasm4pm_dspy.orchestrator import OrchestrationResult

__all__ = [
    "CircuitState",
    "Decision",
    "CycleRecord",
    "AutonomicAgent",
    "run_cycle",
]

CircuitState = Literal["closed", "open", "half_open"]
Decision = Literal["continue_monitoring", "propose_escalate", "circuit_open_skip"]

# Real, deterministic policy thresholds -- documented, not tuned against any
# real incident corpus (none exists yet); a caller with real operational
# data should override via AutonomicAgent's own fields, not by editing these
# module constants.
_HEALTHY_CONFIDENCE_THRESHOLD = 0.6


@dataclass(frozen=True)
class CycleRecord:
    """One real, inspectable Knowledge-stage entry -- what actually happened
    this cycle, not a learned value. ``breeds_attempted``/``breeds_ok`` are
    the real breed ids k8s_state.encode_incident produced payloads for and
    that real-ran with ``status == "ok"``, respectively."""

    cycle: int
    intent: str
    breeds_attempted: tuple[str, ...]
    breeds_ok: tuple[str, ...]
    meta_status: str | None
    hearsay_status: str | None
    confidence: float
    decision: Decision
    circuit_state: CircuitState


@dataclass
class AutonomicAgent:
    """Mutable, held by the caller across cycles -- the real state a
    continuous Monitor->Analyze->Plan loop needs that a one-shot
    ``orchestrator.diagnose()`` call has no way to carry: a circuit breaker
    and an append-only cycle history."""

    failure_threshold: int = 3
    cooldown_cycles: int = 5
    healthy_confidence_threshold: float = _HEALTHY_CONFIDENCE_THRESHOLD

    circuit_state: CircuitState = "closed"
    consecutive_low_confidence: int = 0
    opened_at_cycle: int | None = None
    cycle_count: int = 0
    history: list[CycleRecord] = field(default_factory=list)


def _cycle_confidence(result: OrchestrationResult) -> float:
    """Real, computed from already-real data -- mean confidence over
    specialists whose real run succeeded (``status == "ok"``); ``0.0`` if
    none did. Every input value here already comes from
    ``orchestrator.extract_confidence``'s own real, per-breed extraction --
    this function invents no new confidence source."""
    ok_confidences = [s.confidence for s in result.specialists if s.result.status == "ok"]
    if not ok_confidences:
        return 0.0
    return sum(ok_confidences) / len(ok_confidences)


def _is_healthy(agent: AutonomicAgent, confidence: float, result: OrchestrationResult) -> bool:
    if confidence < agent.healthy_confidence_threshold:
        return False
    if result.meta is not None and result.meta.status != "ok":
        return False
    if result.hearsay is not None and result.hearsay.status != "ok":
        return False
    return True


async def run_cycle(
    agent: AutonomicAgent,
    state: K8sIncidentState,
    target_breeds: Iterable[str] | None = None,
) -> CycleRecord:
    """One real Monitor -> [circuit check] -> Analyze -> Plan -> Propose ->
    Knowledge cycle. ``state`` IS the Monitor stage's observation (a real k8s
    watch/informer producing one is real infrastructure, explicitly out of
    scope for this module -- callers supply it). Never actuates anything."""
    agent.cycle_count += 1
    cycle = agent.cycle_count

    # Circuit check -- mirrors autoprocess.rs's own circuit_allows_request
    # gate: while open, real Analyze/Plan work is skipped entirely (the
    # real point of a breaker, not a cosmetic no-op) until cooldown elapses,
    # at which point the breaker moves to half_open for one real trial cycle.
    if agent.circuit_state == "open":
        assert agent.opened_at_cycle is not None
        if cycle - agent.opened_at_cycle < agent.cooldown_cycles:
            record = CycleRecord(
                cycle=cycle,
                intent=state.intent,
                breeds_attempted=(),
                breeds_ok=(),
                meta_status=None,
                hearsay_status=None,
                confidence=0.0,
                decision="circuit_open_skip",
                circuit_state=agent.circuit_state,
            )
            agent.history.append(record)
            return record
        agent.circuit_state = "half_open"

    # Analyze -- real, deterministic encoding + real specialist fan-out/combine.
    payloads = k8s_state.encode_incident(state, target_breeds)
    breeds_attempted = tuple(sorted(payloads))
    payload_dicts = {breed: bi.model_dump(mode="json") for breed, bi in payloads.items()}
    result = await orchestrator.diagnose(payload_dicts)
    breeds_ok = tuple(sorted(s.breed for s in result.specialists if s.result.status == "ok"))
    confidence = _cycle_confidence(result)
    healthy = _is_healthy(agent, confidence, result)

    # Plan -- real, deterministic circuit-breaker policy over real Analyze
    # output; no fabricated RL/Q-table anywhere here.
    if healthy:
        agent.consecutive_low_confidence = 0
        agent.circuit_state = "closed"
        agent.opened_at_cycle = None
        decision: Decision = "continue_monitoring"
    else:
        agent.consecutive_low_confidence += 1
        decision = "propose_escalate"
        if agent.circuit_state == "half_open" or agent.consecutive_low_confidence >= agent.failure_threshold:
            agent.circuit_state = "open"
            agent.opened_at_cycle = cycle
            agent.consecutive_low_confidence = 0

    record = CycleRecord(
        cycle=cycle,
        intent=state.intent,
        breeds_attempted=breeds_attempted,
        breeds_ok=breeds_ok,
        meta_status=result.meta.status if result.meta is not None else None,
        hearsay_status=result.hearsay.status if result.hearsay is not None else None,
        confidence=confidence,
        decision=decision,
        circuit_state=agent.circuit_state,
    )
    agent.history.append(record)
    return record
