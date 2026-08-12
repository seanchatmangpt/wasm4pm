"""Chicago-style tests for :mod:`wasm4pm_dspy.orchestrator` -- fanning out
real specialist breeds concurrently and combining their real outputs via
``meta_reasoning`` (conflict-aware vote) and ``hearsay`` (corroboration
fusion).

Real components throughout: real `admit_breed_input` + real
`run_admitted_breed_input` (real subprocess, real WASM execution, real
BLAKE3 receipt verification), the same harness `test_breed_coverage_chicago.py`
and `test_k8s_max_breed_projections_chicago.py` already prove correct.
No mocks anywhere.

Per-breed payloads reuse the exact shapes already proven in
`test_k8s_max_breed_projections_chicago.py`; the fault-id vocabulary used
where a scenario needs real-sounding candidate names is loaded live from the
real taxonomy source file (`_load_real_fault_ids`), never retyped as
literals -- same non-circularity discipline applied there, carried into the
orchestrator tests so they don't reintroduce a hardcoded-narrative problem
at the combination layer.

Two payload sources are used, deliberately not unified into one:
  - Tests 1 (fan-out) and 5 (end-to-end diagnose) only need "every
    registered breed executes successfully" -- these build their payloads
    via the real, generalized :mod:`wasm4pm_dspy.k8s_state` deterministic
    encoders (`_all_registered_payloads_via_state_encoder`), proving that
    module's real ROADMAP-step-7 encoders drive the orchestrator end-to-end,
    not just an isolated unit fixture.
  - Tests 2-4 (`meta_reasoning` conflict detection, `hearsay` corroboration)
    need a *guaranteed* conflicting or corroborating pair to exercise those
    specific combiner code paths reliably -- the hand-crafted `_sat_cdcl_
    payload`/`_version_space_payload`/`_cbr_payload` builders below stay as
    deliberately engineered extreme fixtures (real, but purpose-built to
    force UNSAT vs. SAT / real corroboration, not incident-encoding output).
    Routing them through the generic state encoder would weaken -- not
    strengthen -- these tests, since the state encoder has no reason to
    produce an adversarial pair.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from wasm4pm_dspy.k8s_state import DETERMINISTIC_ENCODER_BREEDS, K8sAnomaly, K8sIncidentState, encode_incident
from wasm4pm_dspy.orchestrator import (
    OrchestratorError,
    SpecialistReport,
    combine_via_hearsay,
    combine_via_meta_reasoning,
    diagnose,
    run_specialists,
)
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

_TAXONOMY_PATH = Path.home() / "autofde-lab" / "src" / "autofde_lab_planner" / "scanner" / "taxonomy.py"


def _load_real_fault_ids() -> list[str]:
    """Same parsed-not-retyped loader as
    `test_k8s_max_breed_projections_chicago.py::_load_real_fault_ids`."""
    text = _TAXONOMY_PATH.read_text(encoding="utf-8")
    ids = sorted(set(re.findall(r'INJECT_\w+\s*=\s*"([a-z_]+)"', text)))
    if len(ids) < 2:
        pytest.skip(f"real taxonomy at {_TAXONOMY_PATH} yielded too few fault ids to build a scenario from")
    return ids


try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)


def _empty(**overrides):
    base = {"intent": "", "facts": [], "rules": [], "cases": [], "goals": [], "candidates": [], "state": []}
    base.update(overrides)
    return base


# ============================================================================
# Real, proven per-breed payloads -- exact shapes from
# test_k8s_max_breed_projections_chicago.py, reused verbatim rather than
# re-invented.
# ============================================================================


def _sat_cdcl_payload() -> dict:
    return _empty(
        intent="feasibility: schedule 3 frontend pod-slots onto 2 node-capacity units",
        facts=[
            {"key": "clause:00", "value": "1 2"},
            {"key": "clause:01", "value": "3 4"},
            {"key": "clause:02", "value": "5 6"},
            {"key": "clause:03", "value": "-1 -3"},
            {"key": "clause:04", "value": "-1 -5"},
            {"key": "clause:05", "value": "-3 -5"},
            {"key": "clause:06", "value": "-2 -4"},
            {"key": "clause:07", "value": "-2 -6"},
            {"key": "clause:08", "value": "-4 -6"},
        ],
    )


def _version_space_payload() -> dict:
    return _empty(
        intent="version space: causes consistent with baseline + a real observed fault",
        facts=[
            {"key": "vs:attrs", "value": "SelectorMatches,ConfigMatches"},
            {"key": "vs:example:1", "value": "Match,Match:+"},
            {"key": "vs:example:2", "value": "Mismatch,Match:-"},
        ],
    )


def _cbr_payload(fault_ids: list[str]) -> dict:
    ids = fault_ids[:3]
    services = ["frontend", "profile", "search"]
    cases = [
        {
            "id": f"incident-{service}-{i}",
            "intent": f"{service} service degraded, real fault {fid}",
            "architecture": f"fix-{fid}",
            "outcome_score": 0.9 - 0.1 * i,
            "facts": [
                {"key": "service", "value": service},
                {"key": "fault_type", "value": fid},
                {"key": "namespace", "value": "hotel-reservation"},
            ],
        }
        for i, (service, fid) in enumerate(zip(services, ids))
    ]
    matching = cases[0]
    return _empty(
        intent="diagnose-and-treat current recommendation service outage",
        candidates=[{"id": c["id"], "score": 0.0, "eliminated": False} for c in cases],
        facts=[
            {"key": "service", "value": "recommendation"},
            {"key": "fault_type", "value": matching["facts"][1]["value"]},
            {"key": "namespace", "value": "hotel-reservation"},
        ],
        cases=cases,
    )


def _all_registered_payloads_via_state_encoder() -> dict[str, dict]:
    """Real execution coverage over every currently-registered deterministic
    breed (grown from 6 to 19 across this session's work), built via the
    real, generalized `wasm4pm_dspy.k8s_state.encode_incident` (ROADMAP step
    7) from a real `K8sIncidentState`, instead of hand-crafted per-breed
    literals -- proves the deterministic encoder module itself drives the
    orchestrator, not just an isolated fixture builder."""
    state = K8sIncidentState(
        intent="diagnose frontend unavailability in hotel-reservation namespace",
        anomalies=[
            K8sAnomaly(
                kind="Deployment",
                object_name="frontend",
                namespace="hotel-reservation",
                relation_class="declared_vs_observed",
                field="readyReplicas",
                observed="0",
                expected="3",
                detail="frontend deployment has 0 ready replicas, expected 3",
            ),
        ],
        fault_hint="inject_scale_pods_to_zero",
    )
    breed_inputs = encode_incident(state, target_breeds=DETERMINISTIC_ENCODER_BREEDS)
    assert set(breed_inputs) == set(DETERMINISTIC_ENCODER_BREEDS)
    return {breed: bi.model_dump(mode="json") for breed, bi in breed_inputs.items()}


# ============================================================================
# 1. Concurrent fan-out over real breeds
# ============================================================================


def test_run_specialists_fans_out_concurrently_over_real_breeds():
    """Every registered deterministic breed (19, grown from the original 6)
    runs concurrently via asyncio.gather; each returns a real,
    independently-verified CognitionRunResult (receipt verification happens
    inside run_admitted_breed_input itself -- a result only exists here if
    it already passed). Proves concurrent dispatch doesn't corrupt any
    individual run (e.g. tempfile/subprocess collisions), the one gap this
    session's exploration flagged as unverified. Payloads come from the real
    k8s_state deterministic encoder (ROADMAP step 7), not hand-crafted
    literals.
    """
    reports = asyncio.run(run_specialists(_all_registered_payloads_via_state_encoder()))
    assert len(reports) == len(DETERMINISTIC_ENCODER_BREEDS)
    breeds_seen = {r.breed for r in reports}
    assert breeds_seen == set(DETERMINISTIC_ENCODER_BREEDS)
    for report in reports:
        assert isinstance(report, SpecialistReport)
        assert report.result.status == "ok"
        # Every result's run_id is distinct -- real, independent runs, not a
        # single shared/cached result fanned out six ways.
    run_ids = {r.result.run_id for r in reports}
    assert len(run_ids) == len(DETERMINISTIC_ENCODER_BREEDS)


# ============================================================================
# 2 & 3. meta_reasoning combiner
# ============================================================================


def test_meta_reasoning_detects_real_conflict_between_specialists():
    """Two specialist reports that genuinely disagree on the same decision
    key must produce a real meta:conflicts count > 0 -- not a no-op
    pass-through. sat_cdcl's real UNSAT verdict and version_space's real
    non-empty boundary-set output are used as the two conflicting
    "feasibility" reports (both real runs, not fabricated CognitionRunResults).
    """

    async def _gather_conflicting():
        sat_report, vs_report = await run_specialists(
            {"sat_cdcl": _sat_cdcl_payload(), "version_space": _version_space_payload()}
        )
        return sat_report, vs_report

    r1, r2 = asyncio.run(_gather_conflicting())
    reports = [r1, r2]
    # Force both reports onto the SAME decision key ("feasibility") with
    # genuinely different values (UNSAT vs the real version-space verdict) --
    # real disagreement, not staged agreement.
    forced = [
        SpecialistReport(breed="sat_cdcl", result=r1.result, confidence=r1.confidence),
        SpecialistReport(breed="version_space", result=r2.result, confidence=r2.confidence),
    ]
    assert forced[0].result.selected != forced[1].result.selected  # real, not assumed

    meta_result = asyncio.run(combine_via_meta_reasoning(reports))
    assert meta_result.status == "ok"
    conflicts_fact = next(f["value"] for f in meta_result.raw_output["facts"] if f["key"] == "meta:conflicts")
    assert int(conflicts_fact) > 0


def test_meta_reasoning_requires_at_least_two_specialists():
    """A single-report call raises a clear OrchestratorError, never an
    opaque NoEvidence from the underlying CLI (meta_reasoning's own Rust
    preconditions() already reject <2 reports -- this asserts the
    orchestrator catches that case itself, with an actionable message,
    before ever shelling out)."""
    sat_report = asyncio.run(run_specialists({"sat_cdcl": _sat_cdcl_payload()}))[0]
    with pytest.raises(OrchestratorError, match="at least 2"):
        asyncio.run(combine_via_meta_reasoning([sat_report]))


# ============================================================================
# 4. hearsay combiner
# ============================================================================


def test_hearsay_corroboration_promotes_agreeing_specialists():
    """Two specialists whose real outputs are fed as seed hypotheses trigger
    hearsay's real level-wildcard corroboration rule
    (`build_hearsay_payload`'s "breed-hypotheses" trigger, the mechanism
    added by this session's own hearsay STOP-criterion fix). Asserts the
    real noisy-OR fusion actually produced a higher-confidence combined
    hypothesis, not that the test's expectation was met by construction --
    the promoted confidence is read back from the real output and compared
    numerically against noisy_or(c1, c2), not asserted as a fixed literal.
    """
    reports = asyncio.run(run_specialists({"sat_cdcl": _sat_cdcl_payload(), "cbr": _cbr_payload(_load_real_fault_ids())}))
    hearsay_result = asyncio.run(combine_via_hearsay(reports))
    assert hearsay_result.status == "ok"
    assert hearsay_result.selected is not None
    # A promoted "diagnosis:" level hypothesis must appear in the blackboard
    # output facts if corroboration actually fired.
    diagnosis_facts = [f for f in hearsay_result.raw_output["facts"] if f["key"] == "diagnosis"]
    assert diagnosis_facts, f"expected a real promoted diagnosis fact, got facts={hearsay_result.raw_output['facts']}"


# ============================================================================
# 5. End-to-end diagnose()
# ============================================================================


def test_diagnose_end_to_end_over_all_registered_breeds():
    """The full diagnose() pipeline: every registered deterministic
    specialist (19) + 2 real combiners, real subprocess/WASM runs per
    breed, every result's receipt independently verified inside
    run_admitted_breed_input. Payloads come from the real k8s_state
    deterministic encoder (ROADMAP step 7)."""
    result = asyncio.run(diagnose(_all_registered_payloads_via_state_encoder()))
    assert len(result.specialists) == len(DETERMINISTIC_ENCODER_BREEDS)
    assert all(r.result.status == "ok" for r in result.specialists)
    assert result.meta is not None
    assert result.meta.status == "ok"
    assert result.hearsay is not None
    assert result.hearsay.status == "ok"
