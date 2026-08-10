"""RUN: shells out to the real ``wpm lab cognition run`` CLI for an admitted
candidate, then independently re-verifies the returned receipt.

Mirrors ``autofde_lab.receipts.wasm4pm_cognition.run_cognition`` /
``verify_cognition_evidence`` (built and verified live against this exact CLI
contract in that session) -- same invocation, same envelope parsing, same two
BLAKE3 checks -- but resolves the CLI path directly relative to this package
(``wasm4pm-dspy`` lives inside the wasm4pm repo itself, at
``~/wasm4pm/wasm4pm-dspy``), so no sibling-repo env var convention is needed.

As of the 2026-08-10 session, ``wpm cognition run`` was retired in favor of
``wpm lab cognition run`` (same JSON shape, nested in a result envelope) --
confirmed live, not assumed from source. On success stdout is
``{"command", "status": "ok", "message", "exit_code": 0, "payload": {...}}``;
on failure the process exits non-zero and stdout is
``{"error": {"code", "message"}}`` with the real rejection detail in stdout,
not stderr (stderr carries only an ``[experimental] ...`` banner).
"""

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from wasm4pm_dspy.admission import AdmittedBreedInput

__all__ = [
    "Wasm4pmCliUnavailable",
    "NoEvidence",
    "CognitionRunResult",
    "resolve_wpm_cli",
    "run_admitted_breed_input",
    "verify_receipt",
]


class Wasm4pmCliUnavailable(RuntimeError):
    """Raised when no built ``apps/wasm4pm`` Node CLI can be found."""


class NoEvidence(RuntimeError):
    """Raised for any non-trustworthy outcome: non-zero exit, malformed JSON,
    non-"ok" status, or a receipt that fails :func:`verify_receipt`. Never
    caught and silently replaced with an empty/default result."""


@dataclass(frozen=True)
class CognitionRunResult:
    breed: str
    run_id: str
    output_hash: str
    replay_pointer: str
    status: str
    selected: str | None
    explanation: str | None
    inference_trace: list[dict[str, Any]] = field(default_factory=list)
    raw_output: dict[str, Any] = field(default_factory=dict)


def _repo_root() -> Path:
    """``wasm4pm-dspy/`` sits directly under the wasm4pm repo root."""
    return Path(__file__).resolve().parents[3]


def resolve_wpm_cli() -> tuple[str, str]:
    """Locate ``node`` and ``apps/wasm4pm/dist/bin/wpm.js`` relative to this repo.

    Returns ``(node_bin, script_path)``. Raises :class:`Wasm4pmCliUnavailable`
    if either is missing -- callers (tests included) should skip, not fabricate
    a result, when this raises.
    """
    node_bin = shutil.which("node")
    if not node_bin:
        raise Wasm4pmCliUnavailable("no 'node' binary found on PATH")

    script_path = _repo_root() / "apps" / "wasm4pm" / "dist" / "bin" / "wpm.js"
    if not script_path.is_file():
        raise Wasm4pmCliUnavailable(
            f"apps/wasm4pm CLI not built (expected {script_path}) -- "
            "run 'pnpm build' inside apps/wasm4pm"
        )

    return node_bin, str(script_path)


def verify_receipt(breed: str, run_id: str, output_hash: str, replay_pointer: str) -> bool:
    """Re-derive, don't trust: the same two checks as
    ``packages/cognition/src/receipt/chain.ts::verifyCausalConsistency`` /
    ``autofde_lab.receipts.wasm4pm_cognition.verify_cognition_evidence``,
    verified byte-for-byte against a real ``wpm lab cognition run`` output.

    1. ``run_id == blake3(breed + "|" + output_hash)``
    2. ``replay_pointer == output_hash[:16]``
    """
    import blake3 as blake3_lib

    expected_run_id = blake3_lib.blake3(f"{breed}|{output_hash}".encode("utf-8")).hexdigest()
    if run_id != expected_run_id:
        return False
    return replay_pointer == output_hash[:16]


async def run_admitted_breed_input(
    admitted: AdmittedBreedInput,
    *,
    verify: bool = True,
    timeout_s: float = 30.0,
) -> CognitionRunResult:
    """Execute an already-admitted candidate for real via the ``wpm`` CLI.

    Takes an :class:`~wasm4pm_dspy.admission.AdmittedBreedInput` specifically
    (not a bare dict) -- the type itself is the proof that
    ``admit_breed_input`` already ran and passed, so this function never has
    to re-check breed validity or schema shape, only execution and receipt
    trustworthiness.
    """
    node_bin, script_path = resolve_wpm_cli()

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(admitted.payload, tmp)
        tmp_path = tmp.name

    try:
        started = time.monotonic()
        proc = await asyncio.create_subprocess_exec(
            node_bin, script_path, "lab", "cognition", "run",
            "--contract", admitted.breed, "--input", tmp_path,
            "--format", "json", "--no-save",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_s
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise NoEvidence(
                f"cognition run for breed={admitted.breed!r} timed out after "
                f"{timeout_s}s (elapsed={time.monotonic() - started:.1f}s)"
            ) from None
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    stdout = stdout_bytes.decode(errors="replace")
    stderr = stderr_bytes.decode(errors="replace")

    if proc.returncode != 0:
        # The real rejection detail lives in stdout, not stderr (confirmed
        # live) -- surface both so a caller never has to guess which stream
        # carries the actual reason.
        raise NoEvidence(
            f"cognition run for breed={admitted.breed!r} exited "
            f"{proc.returncode}: stdout={stdout.strip()!r} stderr={stderr.strip()!r}"
        )

    try:
        envelope = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise NoEvidence(
            f"cognition run for breed={admitted.breed!r} produced non-JSON stdout: {exc}"
        ) from exc

    if "error" in envelope or envelope.get("status") != "ok":
        raise NoEvidence(
            f"cognition run for breed={admitted.breed!r} returned no evidence: "
            f"{envelope.get('error', envelope)}"
        )

    body = envelope.get("payload", {})
    if body.get("status") != "ok":
        raise NoEvidence(
            f"cognition run for breed={admitted.breed!r} envelope ok but payload "
            f"status={body.get('status')!r}: {body}"
        )

    result = CognitionRunResult(
        breed=body["breed"],
        run_id=body["run_id"],
        output_hash=body["output_hash"],
        replay_pointer=body["replay_pointer"],
        status=body["status"],
        selected=(body.get("output") or {}).get("selected"),
        explanation=(body.get("output") or {}).get("explanation"),
        inference_trace=(body.get("output") or {}).get("inference_trace", []),
        raw_output=body.get("output", {}),
    )

    if verify and not verify_receipt(
        result.breed, result.run_id, result.output_hash, result.replay_pointer
    ):
        raise NoEvidence(
            f"cognition run for breed={admitted.breed!r} produced a receipt that "
            f"failed causal-consistency verification (run_id={result.run_id[:16]}...)"
        )

    return result
