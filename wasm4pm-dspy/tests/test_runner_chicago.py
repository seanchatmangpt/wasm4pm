"""Chicago-style tests for the RUN stage: real subprocess against the real,
built ``apps/wasm4pm`` CLI, which loads and executes the real wasm-bindgen
cognition kernel. No LM needed -- a hand-built, already-admitted candidate is
fed straight through, mirroring
``test_wasm4pm_cognition_bridge_chicago.py``'s pattern in autofde-lab (built
and verified live in the prior session).

Skipped (not failed) when the CLI isn't built.
"""

from __future__ import annotations

import asyncio

import pytest

from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.runner import (
    NoEvidence,
    Wasm4pmCliUnavailable,
    resolve_wpm_cli,
    run_admitted_breed_input,
    verify_receipt,
)

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)

_EBL_CANDIDATE = {
    "breed": "ebl",
    "payload": {
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
    },
}


def test_real_ebl_run_returns_verified_result():
    admitted = admit_breed_input(_EBL_CANDIDATE)
    result = asyncio.run(run_admitted_breed_input(admitted))

    assert result.breed == "ebl"
    assert result.status == "ok"
    assert result.selected == "has_handle(?y_g1), concave(?y_g1) => drinkable(?y_g1)"
    assert len(result.run_id) == 64
    assert result.replay_pointer == result.output_hash[:16]
    assert len(result.inference_trace) > 0


def test_tampered_receipt_fails_verification():
    admitted = admit_breed_input(_EBL_CANDIDATE)
    result = asyncio.run(run_admitted_breed_input(admitted))

    assert verify_receipt(
        result.breed, result.run_id, result.output_hash, result.replay_pointer
    ) is True

    forged_run_id = ("0" if result.run_id[0] != "0" else "1") + result.run_id[1:]
    assert verify_receipt(
        result.breed, forged_run_id, result.output_hash, result.replay_pointer
    ) is False


def test_unknown_breed_never_reaches_runner():
    """Belt-and-suspenders: admission should refuse before the runner is even
    called -- confirmed here by asserting admit_breed_input raises, not by
    calling the runner directly with an unadmitted candidate (the runner's
    type signature already requires an AdmittedBreedInput, so this is a
    compile-time guarantee as much as a runtime one)."""
    from wasm4pm_dspy.admission import AdmissionRefused

    with pytest.raises(AdmissionRefused):
        admit_breed_input({"breed": "not_a_real_breed", "payload": _EBL_CANDIDATE["payload"]})


def test_domain_precondition_failure_raises_no_evidence():
    """A real domain-level rejection (EBL with no goal) surfaces as NoEvidence
    with the real WASM error message, not a generic failure."""
    candidate = {
        "breed": "ebl",
        "payload": {**_EBL_CANDIDATE["payload"], "goals": []},
    }
    admitted = admit_breed_input(candidate)

    with pytest.raises(NoEvidence, match="at least one goal"):
        asyncio.run(run_admitted_breed_input(admitted))
