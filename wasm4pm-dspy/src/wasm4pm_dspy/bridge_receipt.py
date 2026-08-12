"""Bridge 7: a generic, hash-chained evidence/receipt wrapper for bridge
invocations.

This module never causes anything to execute -- it only records evidence
about a real input/output pair produced elsewhere (SELECT != DO). It is the
wasm4pm-dspy-side generic analog of two real, already-standing patterns in
this repo tree:

- ``runner.py::verify_receipt`` -- ``run_id == blake3(breed + "|" +
  output_hash)`` and ``replay_pointer == output_hash[:16]``, re-derived and
  compared rather than trusted. ``BridgeReceipt.receipt_id`` mirrors this
  exact convention: ``blake3(operation + "|" + output_digest).hexdigest()``.
- ``~/gymact/src/gymact/ocel.py``'s hash-chained, append-only
  ``Receipt``/``ReceiptLedger`` concept (see ``~/gymact/README.md`` lines
  ~62-73) -- an append-only evidence log over real operations, generalized
  here to any bridge invocation rather than GymAct episodes specifically.
"""

from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass
from typing import Any

import blake3

__all__ = [
    "BridgeReceipt",
    "make_receipt",
    "verify_receipt",
    "BridgeReceiptChain",
    "append",
    "verify_chain",
]


@dataclass(frozen=True)
class BridgeReceipt:
    """A single piece of hash-anchored evidence that a bridge operation ran
    for real, over a real input, producing a real output. Never a claim
    about causing execution -- only a record of it."""

    operation: str
    input_digest: str
    output_digest: str
    receipt_id: str
    timestamp: str | None = None


def _canonicalize(obj: Any) -> str:
    """Real, reproducible structured serialization -- never ``repr()``-based
    (not stable across runs for some object types). Prefers real structure
    (``.model_dump()`` for Pydantic, ``dataclasses.asdict()`` for
    dataclasses) before falling back to ``json.dumps(..., default=str)`` for
    genuinely opaque objects."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        structured: Any = dataclasses.asdict(obj)
    elif hasattr(obj, "model_dump") and callable(obj.model_dump):
        structured = obj.model_dump()
    else:
        structured = obj
    return json.dumps(structured, sort_keys=True, default=str)


def _digest(canonical: str) -> str:
    return blake3.blake3(canonical.encode("utf-8")).hexdigest()


def make_receipt(
    operation: str,
    input_obj: Any,
    output_obj: Any,
    *,
    timestamp: str | None = None,
) -> BridgeReceipt:
    """Real function: canonicalizes ``input_obj``/``output_obj`` via
    structured serialization, hashes each with BLAKE3, and derives
    ``receipt_id`` the same way ``runner.py::verify_receipt`` derives
    ``run_id``. ``timestamp`` is caller-supplied only -- this module never
    generates wall-clock values internally, so tests stay deterministic."""
    input_digest = _digest(_canonicalize(input_obj))
    output_digest = _digest(_canonicalize(output_obj))
    receipt_id = blake3.blake3(f"{operation}|{output_digest}".encode("utf-8")).hexdigest()
    return BridgeReceipt(
        operation=operation,
        input_digest=input_digest,
        output_digest=output_digest,
        receipt_id=receipt_id,
        timestamp=timestamp,
    )


def verify_receipt(receipt: BridgeReceipt) -> bool:
    """Re-derive, don't trust: recompute ``receipt_id`` from
    ``operation``/``output_digest`` and confirm it matches. Returns
    ``False`` on mismatch -- never raises."""
    expected = blake3.blake3(
        f"{receipt.operation}|{receipt.output_digest}".encode("utf-8")
    ).hexdigest()
    return receipt.receipt_id == expected


class BridgeReceiptChain:
    """A small, real, append-only wrapper around ``list[BridgeReceipt]``."""

    def __init__(self, receipts: list[BridgeReceipt] | None = None) -> None:
        self._receipts: list[BridgeReceipt] = list(receipts) if receipts else []

    def append(self, receipt: BridgeReceipt) -> "BridgeReceiptChain":
        self._receipts.append(receipt)
        return self

    def verify(self) -> bool:
        return verify_chain(self._receipts)

    def __iter__(self):
        return iter(self._receipts)

    def __len__(self) -> int:
        return len(self._receipts)

    def __getitem__(self, index: int) -> BridgeReceipt:
        return self._receipts[index]

    @property
    def receipts(self) -> list[BridgeReceipt]:
        return list(self._receipts)


def append(chain: list[BridgeReceipt], receipt: BridgeReceipt) -> list[BridgeReceipt]:
    """Functional-style append for callers using a plain ``list[BridgeReceipt]``
    instead of :class:`BridgeReceiptChain`. Returns a new list; does not
    mutate the input."""
    return [*chain, receipt]


def verify_chain(chain: list[BridgeReceipt]) -> bool:
    """Real, computed chain-integrity check: calls :func:`verify_receipt` on
    every entry, returns ``True`` only if all pass."""
    return all(verify_receipt(r) for r in chain)
