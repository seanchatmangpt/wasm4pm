"""Run wasm4pm's own real, native ``validate_ocel_v2`` semantic validator
(OCEDO/OCPQ invariants) against a real GymAct-emitted OCEL 2.0 log.

Grounded in real, already-confirmed facts, not assumed:

- ``validate_ocel_v2`` is exposed by the ``wasm4pm-bindings-py`` PyO3 module
  as ``wasm4pm.validate_ocel_v2(json: str, cardinality_json: str = "")``
  (``crates/wasm4pm-bindings-py/src/exports_generated.rs:1837-1842``,
  ``#[pyfunction(signature = (json, cardinality_json=""))]``). It shells
  into ``wasm4pm::ocel_v2::validate_ocel_v2``, which parses the OCEL JSON,
  parses an optional cardinality JSON, and returns a ``ValidationReport``
  serialized as ``{"valid": bool, "errors": [{"code": str, ...}, ...]}``
  (confirmed live against real usage in
  ``crates/wasm4pm-bindings-py/tests/test_bindings.py:60-82``, including a
  real negative case, ``test_validate_ocel_v2_rejects_e2o_empty``, that
  asserts ``report["valid"] is False`` and a specific error ``code``).
- The native module is NOT installed in this dev environment -- confirmed
  live this session: ``import wasm4pm`` raises ``ModuleNotFoundError``.
- No equivalent CLI verb exists. ``wpm log validate`` (the only OCEL-shaped
  CLI validate command; see ``apps/wasm4pm/src/commands/validate.ts``,
  function ``validateOcel``) calls a *different* WASM export,
  ``validate_ocel`` (structural: required top-level keys + referential
  integrity via ``wasm4pm::ocel_io::validate_ocel``), not
  ``validate_ocel_v2``'s OCEDO/OCPQ semantic invariants. Confirmed by
  searching the whole JS/TS tree for any reference to ``validate_ocel_v2``
  or ``validateOcelV2``: zero matches. There is therefore no honest CLI
  fallback for this specific function -- unlike ``gymact_bridge.py``'s
  ``wpm model discover``, which does have a real CLI-verb equivalent.

Given that, this module deliberately does NOT build a CLI-fallback path
(there is nothing real to fall back to). It tries only the native binding
and raises :class:`WasmpmNativeValidationUnavailable` -- honest degrade,
never a fabricated or narrated result -- when it isn't importable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

__all__ = [
    "WasmpmNativeValidationUnavailable",
    "NativeValidationResult",
    "validate_gymact_ocel_natively",
]


class WasmpmNativeValidationUnavailable(RuntimeError):
    """Raised when the native `wasm4pm` PyO3 binding's `validate_ocel_v2`
    isn't importable in this environment, and no equivalent CLI verb
    exists (confirmed: `wpm log validate` calls a different, structural-
    only WASM export, not `validate_ocel_v2`). Callers should skip, never
    fabricate a result."""


@dataclass(frozen=True)
class NativeValidationResult:
    """Real, typed output of a real `validate_ocel_v2` run over a real
    GymAct OCEL log. `violations` holds each error's real `code` (falling
    back to the raw JSON of an error entry if it has no `code` field), in
    the order wasm4pm's own report returned them."""

    is_valid: bool
    violations: tuple[str, ...]
    source_path: str


def validate_gymact_ocel_natively(
    ocel_path: Path,
    *,
    cardinality_json: str = "",
) -> NativeValidationResult:
    """Real call into wasm4pm's own native `validate_ocel_v2` against a
    real GymAct-produced OCEL 2.0 log at `ocel_path`.

    Raises `WasmpmNativeValidationUnavailable` if the native `wasm4pm`
    PyO3 module isn't installed in this environment -- never returns a
    fabricated/empty result to paper over that gap.
    """
    if not ocel_path.is_file():
        raise WasmpmNativeValidationUnavailable(f"OCEL log not found: {ocel_path}")

    try:
        import wasm4pm as native  # type: ignore[import-not-found]
    except ModuleNotFoundError as exc:
        raise WasmpmNativeValidationUnavailable(
            "native wasm4pm-bindings-py module ('import wasm4pm') is not installed "
            "in this environment, and no equivalent wpm CLI verb exists for "
            "validate_ocel_v2 (wpm log validate calls the structural-only "
            "validate_ocel export instead) -- build wasm4pm-bindings-py "
            "(e.g. `maturin develop`) to close this gap"
        ) from exc

    ocel_json = ocel_path.read_text(encoding="utf-8")
    report: dict[str, Any] = native.validate_ocel_v2(ocel_json, cardinality_json)

    is_valid = bool(report.get("valid", False))
    raw_errors = report.get("errors", [])
    violations: list[str] = []
    for err in raw_errors:
        if isinstance(err, dict) and "code" in err:
            violations.append(str(err["code"]))
        else:
            violations.append(json.dumps(err, sort_keys=True))

    return NativeValidationResult(
        is_valid=is_valid,
        violations=tuple(violations),
        source_path=str(ocel_path),
    )
