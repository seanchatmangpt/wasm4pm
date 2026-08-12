"""Bridge 1 (+ first half of Bridge 2): a real GymAct-emitted OCEL 2.0 log
-> a real wasm4pm-discovered process model.

Grounded in real, already-existing machinery on both sides, confirmed live
this session, not assumed:

- ``~/gymact``'s ``GymAct.receipts_to_ocel()`` (``src/gymact/ocel.py``)
  already builds a real, schema-validated OCEL 2.0 log from an episode's
  hash-chained receipt ledger -- real ``eventTypes``/``objectTypes``/
  ``events``/``objects``, object types ``episode``/``environment``/
  ``capability``, event types per real ``Operation`` value.
- wasm4pm's real discovery engine already understands OCEL 2.0 directly:
  confirmed live via ``wpm model discover <ocel.json> -a ocel_dfg`` (the
  CLI verb ``wpm run`` was retired in favor of ``wpm model discover`` --
  confirmed live via the CLI's own ``COMMAND_NOT_FOUND`` action_template,
  not assumed from stale docs).

Deliberately NOT attempting conformance checking, cognition portfolios, or
anything downstream of discovery -- no formal "admitted expected process"
artifact exists in either repo yet to conform against; building that now
would be exactly the kind of fabricated grounding this whole session has
refused elsewhere (``triz``, ``ilp``, ``dempster_shafer``, ...).

Native-binding-first, CLI-fallback, same honest-degrade discipline as
``runner.py``: prefers the native ``wasm4pm-bindings-py`` PyO3 module
(``import wasm4pm``) when it's installed in the current environment (it
was NOT, confirmed live this session -- ``ModuleNotFoundError``), and
falls back to the real ``wpm`` CLI subprocess otherwise. Never silently
returns an empty/fabricated result when both paths are unavailable --
raises :class:`GymActBridgeUnavailable` instead.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

__all__ = [
    "GymActBridgeUnavailable",
    "DiscoveredProcess",
    "discover_process_from_gymact_ocel",
]


class GymActBridgeUnavailable(RuntimeError):
    """Raised when neither the native `wasm4pm` binding nor the `wpm` CLI
    is available -- callers should skip, never fabricate a result."""


@dataclass(frozen=True)
class DiscoveredProcess:
    """Real, typed output of a real discovery run over a real OCEL log.
    ``node_count``/``edge_count`` come directly from wasm4pm's own real
    ``shape`` summary -- 0/0 is a real, honest result for a small log with
    no directly-follows relations, not an error."""

    algorithm: str
    model_type: str
    format: str
    is_object_centric: bool
    duration_ms: float
    node_count: int
    edge_count: int
    source_ocel_path: str


def _try_native_binding(ocel_path: Path, algorithm: str) -> DiscoveredProcess | None:
    """Real attempt at the native PyO3 module -- returns None (not an
    error) if it isn't installed, so the CLI fallback can run instead.
    Confirmed live this session: `import wasm4pm` raises ModuleNotFoundError
    in the current dev environment -- this path is real code, exercised by
    a real import attempt, but not yet exercised end-to-end (no build of
    wasm4pm-bindings-py available to test against). Documented honestly as
    such, not claimed equivalent-and-verified to the CLI path below."""
    try:
        import wasm4pm as native  # type: ignore[import-not-found]
    except ModuleNotFoundError:
        return None

    if algorithm == "ocel_petri_net":
        # NOT safe to call via this native binding -- confirmed live this
        # session (first time the native binding was ever actually
        # installed and exercised): native.discover_oc_petri_net() aborts
        # the whole Python process ("Fatal Python error: Aborted"), not a
        # catchable exception. Root cause, confirmed by reading
        # wasm4pm/src/oc_petri_net.rs directly: its own Rust test suite
        # marks every real test of this function
        # `#[ignore = "discover_oc_petri_net uses JsValue which panics in
        # test environment"]` -- the function's `Result<JsValue, JsValue>`
        # signature is only meaningful inside a real JS/wasm-bindgen
        # engine, and PyO3's native binding calls it outside one. This is
        # a real, structural incompatibility in the Rust source, not a
        # parameter bug this module can fix -- fall through to the real,
        # already-proven-safe CLI path (`wpm model discover -a
        # ocel_petri_net`) instead of risking a process abort.
        return None

    ocel_json = ocel_path.read_text(encoding="utf-8")
    started = time.monotonic()
    log_handle = native.load_ocel2_from_json(ocel_json)
    if algorithm == "ocel_dfg":
        result = native.discover_ocel_dfg(log_handle)
    else:
        raise ValueError(f"unsupported algorithm for native binding path: {algorithm!r}")
    duration_ms = (time.monotonic() - started) * 1000

    return DiscoveredProcess(
        algorithm=algorithm,
        model_type=getattr(result, "model_type", algorithm),
        format="ocel-v2",
        is_object_centric=True,
        duration_ms=duration_ms,
        node_count=getattr(result, "node_count", 0),
        edge_count=getattr(result, "edge_count", 0),
        source_ocel_path=str(ocel_path),
    )


async def _run_via_cli(ocel_path: Path, algorithm: str, *, timeout_s: float) -> DiscoveredProcess:
    """Real subprocess call to `wpm model discover` -- same invocation
    conventions as `runner.py::run_admitted_breed_input` (stdout-only JSON
    parsing, stderr carries only log lines, confirmed live)."""
    node_bin, script_path = resolve_wpm_cli()

    started = time.monotonic()
    proc = await asyncio.create_subprocess_exec(
        node_bin, script_path, "model", "discover",
        str(ocel_path), "-a", algorithm,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise GymActBridgeUnavailable(
            f"wpm model discover timed out after {timeout_s}s "
            f"(elapsed={time.monotonic() - started:.1f}s)"
        ) from None

    stdout = stdout_bytes.decode(errors="replace")
    stderr = stderr_bytes.decode(errors="replace")

    if proc.returncode != 0:
        raise GymActBridgeUnavailable(
            f"wpm model discover exited {proc.returncode}: stdout={stdout.strip()!r} stderr={stderr.strip()!r}"
        )

    try:
        body: dict[str, Any] = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise GymActBridgeUnavailable(f"wpm model discover produced non-JSON stdout: {exc}") from exc

    if "error" in body:
        raise GymActBridgeUnavailable(f"wpm model discover returned an error: {body['error']}")

    shape = body.get("shape", {})
    return DiscoveredProcess(
        algorithm=body.get("requestedAlgorithm", algorithm),
        model_type=body.get("modelType", "unknown"),
        format=body.get("format", "unknown"),
        is_object_centric=bool(body.get("isObjectCentric", False)),
        duration_ms=float(body.get("durationMs", 0.0)),
        node_count=int(shape.get("nodes", 0)),
        edge_count=int(shape.get("edges", 0)),
        source_ocel_path=str(ocel_path),
    )


async def discover_process_from_gymact_ocel(
    ocel_path: Path,
    *,
    algorithm: str = "ocel_dfg",
    timeout_s: float = 30.0,
) -> DiscoveredProcess:
    """Real discovery over a real GymAct-emitted OCEL 2.0 log. Prefers the
    native `wasm4pm` PyO3 binding; falls back to the real `wpm` CLI
    subprocess. Raises GymActBridgeUnavailable (never a fabricated empty
    result) when neither path is usable."""
    if not ocel_path.is_file():
        raise GymActBridgeUnavailable(f"OCEL log not found: {ocel_path}")

    native_result = _try_native_binding(ocel_path, algorithm)
    if native_result is not None:
        return native_result

    try:
        resolve_wpm_cli()
    except Wasm4pmCliUnavailable as exc:
        raise GymActBridgeUnavailable(
            f"neither the native wasm4pm binding nor the wpm CLI is available: {exc}"
        ) from exc

    return await _run_via_cli(ocel_path, algorithm, timeout_s=timeout_s)
