"""Chicago-style tests for ocel_schema_validation.py.

Real jsonschema validation against the real vendored OCEL 2.0 schema, real
file I/O against a real fixture (or a temp file derived from it). No mocking:
`grep -rn "unittest\\.mock\\|MagicMock\\|Mock(\\|  patch(\\|monkeypatch\\."`
over this file and the module under test must return zero matches.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from wasm4pm_dspy.ocel_schema_validation import (
    SchemaValidationResult,
    validate_ocel_schema,
)

_FIXTURE_PATH = Path.home() / "gymact" / "tests" / "fixtures" / "real_episode.ocel.json"
_SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schemas" / "ocel20-schema.json"
_GYMACT_SCHEMA_PATH = (
    Path.home() / "gymact" / "src" / "gymact" / "schemas" / "ocel20-schema.json"
)


@pytest.mark.skipif(not _FIXTURE_PATH.exists(), reason=f"fixture not found at {_FIXTURE_PATH}")
def test_a_real_valid_ocel_log_passes_schema_validation() -> None:
    result = validate_ocel_schema(_FIXTURE_PATH)

    assert result.is_valid is True
    assert result.errors == ()
    assert result.source_path == str(_FIXTURE_PATH)


@pytest.mark.skipif(not _FIXTURE_PATH.exists(), reason=f"fixture not found at {_FIXTURE_PATH}")
def test_a_malformed_ocel_log_is_actually_rejected_not_rubber_stamped(tmp_path: Path) -> None:
    log = json.loads(_FIXTURE_PATH.read_text())

    # Real schema-invalid mutation: drop a required top-level key.
    assert "objectTypes" in log, "fixture must actually contain objectTypes to test its removal"
    del log["objectTypes"]

    malformed_path = tmp_path / "malformed.ocel.json"
    malformed_path.write_text(json.dumps(log))

    result = validate_ocel_schema(malformed_path)

    assert result.is_valid is False
    assert result.errors != ()
    assert result.source_path == str(malformed_path)


@pytest.mark.skipif(not _FIXTURE_PATH.exists(), reason=f"fixture not found at {_FIXTURE_PATH}")
def test_a_non_string_event_type_is_actually_rejected(tmp_path: Path) -> None:
    log = json.loads(_FIXTURE_PATH.read_text())

    assert log["events"], "fixture must actually contain events to test type corruption"
    log["events"][0]["type"] = 12345

    malformed_path = tmp_path / "bad_event_type.ocel.json"
    malformed_path.write_text(json.dumps(log))

    result = validate_ocel_schema(malformed_path)

    assert result.is_valid is False
    assert result.errors != ()


@pytest.mark.skipif(not _FIXTURE_PATH.exists(), reason=f"fixture not found at {_FIXTURE_PATH}")
def test_two_simultaneous_real_violations_both_surface_as_errors(tmp_path: Path) -> None:
    log = json.loads(_FIXTURE_PATH.read_text())

    # First real, independent violation: drop a required top-level key.
    assert "objectTypes" in log, "fixture must actually contain objectTypes to test its removal"
    del log["objectTypes"]

    # Second real, independent violation: corrupt an event's type to a non-string.
    assert log["events"], "fixture must actually contain events to test type corruption"
    log["events"][0]["type"] = 12345

    malformed_path = tmp_path / "double_malformed.ocel.json"
    malformed_path.write_text(json.dumps(log))

    result = validate_ocel_schema(malformed_path)

    assert result.is_valid is False
    assert len(result.errors) >= 2, (
        f"expected >=2 real, distinct schema violations, got: {result.errors!r}"
    )


def test_result_is_a_frozen_dataclass() -> None:
    result = SchemaValidationResult(is_valid=True, errors=(), source_path="x")

    with pytest.raises(Exception):
        result.is_valid = False  # type: ignore[misc]


@pytest.mark.skipif(
    not _GYMACT_SCHEMA_PATH.exists(),
    reason=f"gymact schema not found at {_GYMACT_SCHEMA_PATH}",
)
def test_vendored_schema_is_byte_identical_to_gymact_except_provenance_comment() -> None:
    ours = json.loads(_SCHEMA_PATH.read_text())
    theirs = json.loads(_GYMACT_SCHEMA_PATH.read_text())

    assert set(ours.keys()) == set(theirs.keys())
    for key in ours:
        if key == "$comment":
            continue
        assert ours[key] == theirs[key], f"drift detected in schema key {key!r}"

    # The one field allowed to differ actually differs (real provenance edit,
    # not an accidental untouched copy) and both are real, non-empty strings.
    assert isinstance(ours["$comment"], str) and ours["$comment"]
    assert isinstance(theirs["$comment"], str) and theirs["$comment"]
    assert ours["$comment"] != theirs["$comment"]
