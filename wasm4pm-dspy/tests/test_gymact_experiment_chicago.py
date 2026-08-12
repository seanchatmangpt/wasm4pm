"""Chicago-style tests for :mod:`wasm4pm_dspy.gymact_experiment` -- Bridge 4
(candidate -> a real, safe, in-memory-only GymAct experiment) + Bridge 5
(that experiment's consequence -> wasm4pm re-discovery/comparison).

Real components throughout: a real ``GymAct`` kernel, a real
``MemoryProvider``/``MemoryEnvironment`` episode, a real OCEL 2.0 log
written to disk, real ``wpm model discover`` (or the native binding) runs
against it. No mocks anywhere -- ONLY ``MemoryProvider`` is ever
constructed; no Kubernetes/Terraform/Docker/subprocess-actuating provider
is imported or referenced in this file. Named skip (never a mock
substitute) if GymAct or a real discovery path isn't available.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from wasm4pm_dspy.gymact_bridge import GymActBridgeUnavailable
from wasm4pm_dspy.gymact_experiment import (
    ExperimentComparison,
    ExperimentProposal,
    compare_pre_post_experiment,
    run_safe_experiment,
)
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

try:
    import gymact  # noqa: F401

    _GYMACT_AVAILABLE = True
except ModuleNotFoundError:
    _GYMACT_AVAILABLE = False

requires_gymact = pytest.mark.skipif(
    not _GYMACT_AVAILABLE, reason="gymact is not installed/importable in this environment"
)

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

try:
    import importlib

    importlib.import_module("wasm4pm")
    _NATIVE_BINDING_AVAILABLE = True
except ModuleNotFoundError:
    _NATIVE_BINDING_AVAILABLE = False

requires_a_real_discovery_path = pytest.mark.skipif(
    not (_WPM_CLI_AVAILABLE or _NATIVE_BINDING_AVAILABLE),
    reason="neither the native wasm4pm binding nor the built wpm CLI is available",
)

_GYMACT_OCEL_FIXTURE = Path.home() / "gymact" / "tests" / "fixtures" / "real_episode.ocel.json"

requires_gymact_fixture = pytest.mark.skipif(
    not _GYMACT_OCEL_FIXTURE.is_file(),
    reason=f"real GymAct OCEL fixture not found at {_GYMACT_OCEL_FIXTURE} (checkout ~/gymact to run this)",
)


_SET_PROPOSAL = ExperimentProposal(
    capability_iri="urn:gymact:memory:capability:set",
    payload={"key": "wasm4pm_dspy_bridge4_probe", "value": 1},
    rationale="Bridge 4 Chicago test: real MemoryProvider set() episode.",
)


# ============================================================================
# 1. Bridge 4: real safe experiment -> real OCEL log on disk
# ============================================================================


@requires_gymact
def test_run_safe_experiment_produces_a_real_ocel_log_on_disk():
    """A real MemoryProvider-backed episode produces a real, schema-shaped
    OCEL 2.0 log file. No fixed event/object count assertion beyond what
    the episode itself guarantees (materialize/act/verify/teardown ->
    4 real receipts minimum)."""
    ocel_path = asyncio.run(run_safe_experiment(_SET_PROPOSAL))

    assert ocel_path.is_file()
    data = json.loads(ocel_path.read_text(encoding="utf-8"))

    assert "eventTypes" in data
    assert "objectTypes" in data
    assert "events" in data
    assert "objects" in data

    real_event_type_names = {et["name"] for et in data["eventTypes"]}
    # materialize, act, verify, teardown are all real Operation values this
    # episode exercises unconditionally.
    assert {"materialize", "act", "verify", "teardown"} <= real_event_type_names

    real_object_type_names = {ot["name"] for ot in data["objectTypes"]}
    assert real_object_type_names <= {"episode", "environment", "capability"}
    assert "episode" in real_object_type_names

    assert len(data["events"]) >= 4


@requires_gymact
def test_run_safe_experiment_only_ever_touches_memory_provider():
    """Direct source-level confirmation that the module under test imports
    exactly one GymAct provider -- MemoryProvider -- and no other."""
    import wasm4pm_dspy.gymact_experiment as module

    source = Path(module.__file__).read_text(encoding="utf-8")
    for forbidden in ("KubernetesProvider", "TerraformProvider", "DockerProvider",
                       "GymnasiumProvider", "FastMcpProvider", "InspectAiProvider",
                       "import subprocess", "asyncio.create_subprocess"):
        assert forbidden not in source, f"forbidden provider/actuation reference found: {forbidden}"
    assert "MemoryProvider" in source


# ============================================================================
# 2. Bridge 5: real discovery + real comparison over two real experiment runs
# ============================================================================


@requires_gymact
@requires_a_real_discovery_path
def test_compare_pre_post_experiment_over_two_real_runs():
    """Two independent real safe-experiment runs produce two real OCEL
    logs; Bridge 5 discovers a real process model over each and returns a
    real, computed diff. No fixed node/edge-count assertion -- a real
    0-edge DFG over a tiny 5-event-ish log is an honest result, not a
    failure (this session's own precedent in
    test_gymact_bridge_chicago.py)."""
    pre_path = asyncio.run(run_safe_experiment(_SET_PROPOSAL))
    post_proposal = ExperimentProposal(
        capability_iri="urn:gymact:memory:capability:increment",
        payload={"key": "wasm4pm_dspy_bridge4_probe", "amount": 2},
        rationale="Bridge 4 Chicago test: second real MemoryProvider episode for Bridge 5 diff.",
    )
    post_path = asyncio.run(run_safe_experiment(post_proposal))

    comparison = asyncio.run(compare_pre_post_experiment(pre_path, post_path))

    assert isinstance(comparison, ExperimentComparison)
    assert comparison.pre.source_ocel_path == str(pre_path)
    assert comparison.post.source_ocel_path == str(post_path)
    assert comparison.node_count_delta == comparison.post.node_count - comparison.pre.node_count
    assert comparison.edge_count_delta == comparison.post.edge_count - comparison.pre.edge_count
    assert comparison.pre.node_count >= 0
    assert comparison.post.node_count >= 0


@requires_gymact
@requires_a_real_discovery_path
@requires_gymact_fixture
def test_compare_pre_post_experiment_against_gymact_own_fixture():
    """A real safe-experiment OCEL log compared against GymAct's own real
    fixture (``real_episode.ocel.json``) -- cross-repo real evidence, no
    self-comparison shortcut."""
    post_path = asyncio.run(run_safe_experiment(_SET_PROPOSAL))

    comparison = asyncio.run(compare_pre_post_experiment(_GYMACT_OCEL_FIXTURE, post_path))

    assert comparison.pre.source_ocel_path == str(_GYMACT_OCEL_FIXTURE)
    assert comparison.post.source_ocel_path == str(post_path)
    assert comparison.node_count_delta == comparison.post.node_count - comparison.pre.node_count


# ============================================================================
# 3. Honest unavailability -- never a fabricated result
# ============================================================================


@requires_gymact
def test_compare_pre_post_experiment_raises_for_missing_ocel_file():
    missing = Path("/nonexistent/path/to/nothing.ocel.json")
    with pytest.raises(GymActBridgeUnavailable, match="OCEL log not found"):
        asyncio.run(
            compare_pre_post_experiment(missing, missing)
        )
