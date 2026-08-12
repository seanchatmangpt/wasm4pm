"""Chicago-style tests for :mod:`wasm4pm_dspy.bridge_receipt`. Real BLAKE3
hashing, real objects, real dataclasses throughout. No mocks anywhere. Named
skip (never a mock substitute) if the real worked-example subject
(``gymact_bridge.discover_process_from_gymact_ocel``) isn't available.
"""

from __future__ import annotations

import asyncio
import dataclasses
from pathlib import Path

import pytest

from wasm4pm_dspy.bridge_receipt import (
    BridgeReceipt,
    append,
    make_receipt,
    verify_chain,
    verify_receipt,
)
from wasm4pm_dspy.gymact_bridge import GymActBridgeUnavailable, discover_process_from_gymact_ocel
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


# ============================================================================
# 1. Pure, no-CLI-needed determinism tests
# ============================================================================


def test_make_receipt_differs_for_distinct_objects():
    input_a = {"a": 1, "b": "x"}
    output_a = {"result": "one"}
    input_b = {"a": 2, "b": "y"}
    output_b = {"result": "two"}

    receipt_1 = make_receipt("op.demo", input_a, output_a)
    receipt_2 = make_receipt("op.demo", input_b, output_b)

    assert receipt_1.input_digest != receipt_2.input_digest
    assert receipt_1.output_digest != receipt_2.output_digest
    assert receipt_1.receipt_id != receipt_2.receipt_id


def test_make_receipt_is_deterministic_for_identical_objects():
    input_obj = {"key": [1, 2, 3], "nested": {"z": "y", "a": "b"}}
    output_obj = {"ok": True, "count": 3}

    receipt_1 = make_receipt("op.repeat", input_obj, output_obj)
    receipt_2 = make_receipt("op.repeat", input_obj, output_obj)

    assert receipt_1.input_digest == receipt_2.input_digest
    assert receipt_1.output_digest == receipt_2.output_digest
    assert receipt_1.receipt_id == receipt_2.receipt_id


def test_verify_receipt_passes_on_fresh_receipt():
    receipt = make_receipt("op.verify", {"in": 1}, {"out": 2})
    assert verify_receipt(receipt) is True


def test_verify_receipt_fails_on_corrupted_receipt_id():
    receipt = make_receipt("op.verify", {"in": 1}, {"out": 2})
    corrupted = dataclasses.replace(receipt, receipt_id="deadbeef")
    assert verify_receipt(corrupted) is False


def test_verify_receipt_never_raises_on_corrupted_receipt():
    receipt = make_receipt("op.verify", {"in": 1}, {"out": 2})
    corrupted = dataclasses.replace(receipt, output_digest="0" * 64)
    result = verify_receipt(corrupted)
    assert result is False


# ============================================================================
# 2. Real worked example: wrap a real DiscoveredProcess from gymact_bridge
# ============================================================================


@requires_gymact_fixture
@requires_a_real_discovery_path
def test_make_and_verify_receipt_over_real_gymact_discovery():
    discovered = asyncio.run(discover_process_from_gymact_ocel(_GYMACT_OCEL_FIXTURE))

    receipt = make_receipt(
        "gymact_bridge.discover_process_from_gymact_ocel",
        {"ocel_path": str(_GYMACT_OCEL_FIXTURE)},
        discovered,
    )

    assert verify_receipt(receipt) is True
    assert receipt.operation == "gymact_bridge.discover_process_from_gymact_ocel"
    assert len(receipt.input_digest) == 64
    assert len(receipt.output_digest) == 64
    assert len(receipt.receipt_id) == 64


# ============================================================================
# 3. Chain integrity
# ============================================================================


def test_verify_chain_passes_on_real_chain_of_receipts():
    chain: list[BridgeReceipt] = []
    chain = append(chain, make_receipt("op.step1", {"n": 1}, {"n": 2}))
    chain = append(chain, make_receipt("op.step2", {"n": 2}, {"n": 3}))
    chain = append(chain, make_receipt("op.step3", {"n": 3}, {"n": 4}))

    assert len(chain) == 3
    assert verify_chain(chain) is True


def test_verify_chain_fails_when_middle_entry_corrupted():
    chain: list[BridgeReceipt] = []
    chain = append(chain, make_receipt("op.step1", {"n": 1}, {"n": 2}))
    chain = append(chain, make_receipt("op.step2", {"n": 2}, {"n": 3}))
    chain = append(chain, make_receipt("op.step3", {"n": 3}, {"n": 4}))

    corrupted_middle = dataclasses.replace(chain[1], receipt_id="deadbeef")
    tampered_chain = [chain[0], corrupted_middle, chain[2]]

    assert verify_chain(tampered_chain) is False
