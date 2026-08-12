"""Chicago-style tests for :mod:`wasm4pm_dspy.gymact_conformance` -- the
conformance half of Bridge 2. Real components throughout: a real GymAct
OCEL 2.0 fixture, a real `wpm model check --mode oracle` subprocess run
against a real reference DFG file (transcribed from GymAct's own real
`LIFECYCLE` table). No mocks anywhere. Named skip (never a mock
substitute) if the fixture or CLI isn't available.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from wasm4pm_dspy.gymact_conformance import (
    GymActConformanceUnavailable,
    _lifecycle_reference_dfg,
    check_gymact_ocel_conformance,
    check_gymact_ocel_fitness,
)
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

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
    reason="built wpm CLI (apps/wasm4pm/dist/bin/wpm.js) not available",
)


# ============================================================================
# 1. The reference DFG is a faithful transcription of GymAct's own real
#    LIFECYCLE table, not an invented structure -- checked directly against
#    the same source file this session read to build it.
# ============================================================================


def test_lifecycle_reference_dfg_matches_real_gymact_process_module():
    """Cross-check `_lifecycle_reference_dfg()`'s edges against GymAct's own
    real `gymact.process.LIFECYCLE` dict, read live -- not against a second,
    independently-typed copy that could silently drift from the source."""
    gymact_process = pytest.importorskip(
        "gymact.process", reason="~/gymact not installed/importable in this venv"
    )

    real_lifecycle = gymact_process.LIFECYCLE
    real_start = gymact_process.START_OPERATION

    dfg = _lifecycle_reference_dfg()
    node_ids = {n["id"] for n in dfg["nodes"]}
    edge_pairs = {(e["from"], e["to"]) for e in dfg["edges"]}

    real_node_ids = {op.value for op in real_lifecycle}
    real_edge_pairs = {
        (frm.value, to.value) for frm, successors in real_lifecycle.items() for to in successors
    }

    assert node_ids == real_node_ids
    assert edge_pairs == real_edge_pairs
    assert dfg["start_activities"] == {real_start.value: 1}
    real_terminal = {op.value for op, succ in real_lifecycle.items() if not succ}
    assert set(dfg["end_activities"]) == real_terminal


def test_lifecycle_reference_dfg_has_real_schema_shape():
    """Structural shape matches wasm4pm's real `DFG` Rust struct (nodes with
    id/label/frequency, edges with from/to/frequency, start/end activity
    maps) -- read directly from `wasm4pm/src/models.rs` this session."""
    dfg = _lifecycle_reference_dfg()
    assert dfg["nodes"]
    assert dfg["edges"]
    for node in dfg["nodes"]:
        assert set(node) == {"id", "label", "frequency"}
    for edge in dfg["edges"]:
        assert set(edge) == {"from", "to", "frequency"}
    assert dfg["start_activities"] == {"materialize": 1}
    assert dfg["end_activities"] == {"teardown": 1}


# ============================================================================
# 2. Real conformance check over the real fixture
# ============================================================================


@requires_gymact_fixture
@requires_wpm_cli
def test_check_gymact_ocel_conformance_admits_real_fixture():
    """The real 5-event fixture (materialize, act, act, verify, teardown)
    is a real legal walk through GymAct's own real LIFECYCLE table, so the
    real conformance check must admit it -- not asserted, computed."""
    result = asyncio.run(check_gymact_ocel_conformance(_GYMACT_OCEL_FIXTURE))

    assert result.status == "ADMITTED"
    assert result.conformant is True
    assert result.total_events == 5
    assert result.checked == 1
    assert result.admitted == 1
    assert result.rejected == 0
    assert result.findings == []
    assert result.source_ocel_path == str(_GYMACT_OCEL_FIXTURE)
    assert result.duration_ms >= 0.0


@requires_gymact_fixture
@requires_wpm_cli
def test_check_gymact_ocel_conformance_rejects_a_real_lifecycle_violation():
    """Real negative control: an OCEL log whose event sequence starts with
    `teardown` (the one real LIFECYCLE-terminal operation, illegal as a
    start) must be rejected by the real conformance check -- proves the
    check has real discriminating power, not a check that always admits."""
    fixture = json.loads(_GYMACT_OCEL_FIXTURE.read_text(encoding="utf-8"))
    violating = dict(fixture)
    violating_events = [dict(e) for e in fixture["events"]]
    assert violating_events, "fixture must have at least one real event to mutate"
    violating_events[0] = {**violating_events[0], "type": "teardown"}
    violating["events"] = violating_events

    import tempfile

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".ocel.json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(violating, tmp)
        violating_path = Path(tmp.name)

    try:
        result = asyncio.run(check_gymact_ocel_conformance(violating_path))
        assert result.status != "ADMITTED"
        assert result.conformant is False
        assert result.rejected >= 1
        assert result.findings
    finally:
        violating_path.unlink(missing_ok=True)


# ============================================================================
# 3. Honest unavailability -- never a fabricated result
# ============================================================================


def test_check_gymact_ocel_conformance_raises_for_missing_ocel_file():
    missing = Path("/nonexistent/path/to/nothing.ocel.json")
    with pytest.raises(GymActConformanceUnavailable, match="OCEL log not found"):
        asyncio.run(check_gymact_ocel_conformance(missing))


# ============================================================================
# 4. Quantified (--mode replay) fitness -- real, confirmed CLI blocker.
#
# Real investigation this session: `wpm model check --mode replay` against
# the real OCEL fixture really exits 2 with real stdout
# `{"error": {"code": "INVALID_INPUT", "message": "--mode replay requires
# an XES/CSV event log; detected format was 'ocel-v2'"}}` -- confirmed by
# running the exact command by hand before writing this test. No CLI verb
# flattens OCEL to a case-centric event log (`wpm log convert` round-trips
# OCEL v2 -> OCEL v2, confirmed live), and the native `wasm4pm` Python
# binding that owns the real `flatten_ocel_to_eventlog` function is not
# importable in this venv (real `ModuleNotFoundError`, confirmed live).
# `check_gymact_ocel_fitness` is expected to hit this real blocker and
# raise honestly -- these tests assert that real, observed behavior, not
# a hoped-for numeric fitness score that this environment cannot produce.
# ============================================================================


@requires_gymact_fixture
@requires_wpm_cli
def test_check_gymact_ocel_fitness_raises_the_real_confirmed_cli_blocker():
    """Real subprocess call to `wpm model check --mode replay` against the
    real OCEL fixture. Confirmed live (see module comment above and the
    module-level comment in `gymact_conformance.py` directly above
    `check_gymact_ocel_fitness`): this real CLI build fail-closes on OCEL
    input for `--mode replay` with a real `INVALID_INPUT` error, and no
    real flattening path (CLI verb or importable native binding) exists in
    this environment to bridge that gap. This is a real, observed, honest
    result -- not a fabricated fitness score."""
    with pytest.raises(GymActConformanceUnavailable) as exc_info:
        asyncio.run(check_gymact_ocel_fitness(_GYMACT_OCEL_FIXTURE))

    message = str(exc_info.value)
    print(f"real check_gymact_ocel_fitness blocker: {message}")
    assert "INVALID_INPUT" in message or "requires an XES/CSV event log" in message


def test_check_gymact_ocel_fitness_raises_for_missing_ocel_file():
    missing = Path("/nonexistent/path/to/nothing.ocel.json")
    with pytest.raises(GymActConformanceUnavailable, match="OCEL log not found"):
        asyncio.run(check_gymact_ocel_fitness(missing))
