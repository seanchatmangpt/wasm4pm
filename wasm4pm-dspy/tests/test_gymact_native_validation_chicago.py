"""Chicago-style tests for :mod:`wasm4pm_dspy.gymact_native_validation` --
wasm4pm's own real, native `validate_ocel_v2` semantic validator run
against a real GymAct-emitted OCEL 2.0 log.

Real components throughout: the real GymAct fixture, the real native
`wasm4pm` PyO3 binding when installed. No mocks anywhere. Named skip
(never a mock substitute) if the fixture or the native binding isn't
available -- confirmed unavailable in this dev environment this session
(`import wasm4pm` -> ModuleNotFoundError), matching this repo's other
honest-degrade tests (`test_gymact_bridge_chicago.py`).
"""

from __future__ import annotations

import copy
import importlib
import json
from pathlib import Path

import pytest

from wasm4pm_dspy.gymact_native_validation import (
    NativeValidationResult,
    WasmpmNativeValidationUnavailable,
    validate_gymact_ocel_natively,
)

_GYMACT_OCEL_FIXTURE = Path.home() / "gymact" / "tests" / "fixtures" / "real_episode.ocel.json"

requires_gymact_fixture = pytest.mark.skipif(
    not _GYMACT_OCEL_FIXTURE.is_file(),
    reason=f"real GymAct OCEL fixture not found at {_GYMACT_OCEL_FIXTURE} (checkout ~/gymact to run this)",
)

try:
    importlib.import_module("wasm4pm")
    _NATIVE_BINDING_AVAILABLE = True
except ModuleNotFoundError:
    _NATIVE_BINDING_AVAILABLE = False

requires_native_binding = pytest.mark.skipif(
    not _NATIVE_BINDING_AVAILABLE,
    reason=(
        "native wasm4pm-bindings-py module ('import wasm4pm') is not installed "
        "in this environment -- no CLI-equivalent exists for validate_ocel_v2 "
        "(confirmed: wpm log validate calls the structural-only validate_ocel "
        "export, not validate_ocel_v2); build wasm4pm-bindings-py "
        "(e.g. `maturin develop`) to run this test"
    ),
)


# ============================================================================
# 1. Real positive case: wasm4pm's own real validate_ocel_v2 against the
#    real GymAct fixture, end to end, no mocks.
# ============================================================================


@requires_gymact_fixture
@requires_native_binding
def test_real_gymact_ocel_log_gets_a_real_typed_result():
    result = validate_gymact_ocel_natively(_GYMACT_OCEL_FIXTURE)

    assert isinstance(result, NativeValidationResult)
    assert result.source_path == str(_GYMACT_OCEL_FIXTURE)
    assert isinstance(result.is_valid, bool)
    assert isinstance(result.violations, tuple)
    for v in result.violations:
        assert isinstance(v, str)


# ============================================================================
# 2. Real negative control: a deliberately corrupted copy of the real
#    fixture (dangling object reference injected into the first event's
#    omap) must be REJECTED by the real validator -- confirms it actually
#    enforces referential integrity, not a rubber stamp. Matches the
#    negative-control discipline already proven in gymact_conformance.py
#    and GymAct's own test_a_malformed_log_is_actually_rejected_not_rubber_stamped.
# ============================================================================


@requires_gymact_fixture
@requires_native_binding
def test_a_log_with_a_dangling_object_reference_is_actually_rejected(tmp_path):
    real_ocel = json.loads(_GYMACT_OCEL_FIXTURE.read_text(encoding="utf-8"))
    corrupted = copy.deepcopy(real_ocel)

    assert corrupted["events"], "real fixture must have at least one event to corrupt"
    first_event = corrupted["events"][0]
    dangling_object_id = "__nonexistent_object_id_for_negative_control__"
    # Inject a dangling reference into the first event's object map,
    # whichever real key this OCEL log uses for it.
    omap_key = next(
        (k for k in ("relationships", "omap", "objectIds", "object_ids") if k in first_event),
        None,
    )
    if omap_key is None:
        pytest.fail(
            f"real fixture event has none of the expected object-map keys; keys={sorted(first_event)}"
        )

    existing = first_event[omap_key]
    if isinstance(existing, list) and existing and isinstance(existing[0], dict):
        # e.g. [{"objectId": "...", "qualifier": "..."}]
        bad_entry = dict(existing[0])
        id_key = next((k for k in ("objectId", "object_id", "id") if k in bad_entry), None)
        assert id_key is not None, f"unrecognized relationship entry shape: {bad_entry}"
        bad_entry[id_key] = dangling_object_id
        first_event[omap_key] = existing + [bad_entry]
    elif isinstance(existing, list):
        first_event[omap_key] = existing + [dangling_object_id]
    else:
        pytest.fail(f"unrecognized object-map shape under {omap_key!r}: {existing!r}")

    corrupted_path = tmp_path / "real_episode.dangling-ref.ocel.json"
    corrupted_path.write_text(json.dumps(corrupted), encoding="utf-8")

    result = validate_gymact_ocel_natively(corrupted_path)

    assert isinstance(result, NativeValidationResult)
    assert result.is_valid is False, (
        "wasm4pm's real validate_ocel_v2 should reject a dangling object "
        f"reference, but reported valid=True; violations={result.violations}"
    )
    assert len(result.violations) > 0


# ============================================================================
# 3. Honest-unavailable path: exercised for real regardless of environment
#    (does not depend on the native binding being installed) -- confirms
#    the exception is real, named, and raised on a genuinely missing file,
#    which is the one failure mode always reachable.
# ============================================================================


def test_missing_ocel_file_raises_named_unavailable_exception(tmp_path):
    missing_path = tmp_path / "does-not-exist.ocel.json"

    with pytest.raises(WasmpmNativeValidationUnavailable):
        validate_gymact_ocel_natively(missing_path)
