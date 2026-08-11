"""Chicago-style tests for the deterministic ADMIT gate.

No LM, no subprocess, no skip: exercises real registry data
(``crates/wasm4pm-cognition/breeds/registry.json``, loaded for real, not a
canned fixture) and real hand-built candidate dicts, asserting on the actual
accept/refuse outcome and its reason -- never an interaction assertion.
"""

from __future__ import annotations

import pytest

from wasm4pm_dspy.admission import AdmissionRefused, AdmittedBreedInput, admit_breed_input
from wasm4pm_dspy.registry import load_registry


def _valid_ebl_payload() -> dict:
    return {
        "intent": "learn",
        "facts": [
            {"key": "has_handle(obj1)", "value": "true"},
            {"key": "concave(obj1)", "value": "true"},
        ],
        "rules": [
            {"id": "r1", "premise": ["cup(?x)"], "conclusion": "drinkable(?x)", "certainty": 1.0},
            {
                "id": "r2",
                "premise": ["has_handle(?y)", "concave(?y)"],
                "conclusion": "cup(?y)",
                "certainty": 1.0,
            },
        ],
        "goals": [{"id": "g1", "predicate": "drinkable(obj1)", "value": "true"}],
        "cases": [],
        "candidates": [],
        "state": [],
    }


def test_real_registry_loads_and_contains_ebl():
    """Grounds every other test: the real registry file parses and has the
    breed used throughout this suite and the wasm4pm_cognition bridge tests."""
    records = load_registry()
    assert len(records) >= 50  # the 55-breed cognition layer, give or take drift
    assert "ebl" in {r.breed_id for r in records}


def test_valid_candidate_is_admitted():
    candidate = {"breed": "ebl", "payload": _valid_ebl_payload()}
    admitted = admit_breed_input(candidate)

    assert isinstance(admitted, AdmittedBreedInput)
    assert admitted.breed == "ebl"
    assert admitted.authority == "SELECT_ONLY"
    assert admitted.actuation == "PENDING_RUN"
    assert admitted.payload == candidate["payload"]


def test_unknown_breed_is_refused():
    candidate = {"breed": "totally_not_a_real_breed", "payload": _valid_ebl_payload()}
    with pytest.raises(AdmissionRefused, match="UNKNOWN_BREED"):
        admit_breed_input(candidate)


def test_missing_breed_field_is_refused():
    candidate = {"payload": _valid_ebl_payload()}
    with pytest.raises(AdmissionRefused, match="MISSING_BREED"):
        admit_breed_input(candidate)


def test_missing_payload_field_is_refused():
    payload = _valid_ebl_payload()
    del payload["goals"]
    candidate = {"breed": "ebl", "payload": payload}
    with pytest.raises(AdmissionRefused, match="SCHEMA_INVALID"):
        admit_breed_input(candidate)


def test_llm_invented_extra_field_is_refused():
    """An LM proposing a field outside the BreedInput schema (e.g. hallucinating
    a 'confidence' or 'notes' field) must be refused, not silently dropped or
    silently passed through to the Rust kernel."""
    payload = _valid_ebl_payload()
    payload["notes"] = "the LM's own commentary"
    candidate = {"breed": "ebl", "payload": payload}
    with pytest.raises(AdmissionRefused, match="SCHEMA_INVALID"):
        admit_breed_input(candidate)


def test_wrong_typed_field_is_refused():
    payload = _valid_ebl_payload()
    payload["facts"] = "not a list"
    candidate = {"breed": "ebl", "payload": payload}
    with pytest.raises(AdmissionRefused, match="SCHEMA_INVALID"):
        admit_breed_input(candidate)
