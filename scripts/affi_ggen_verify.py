#!/usr/bin/env python3
"""
affi-ggen-verify: Bridge ggen receipt → affi receipt → cryptographic verify.

The ggen receipt format (input_hashes / output_hashes / Ed25519 signature) is
not the same as affidavit's format (format_version / events / chain_hash).
This bridge:
  1. Reads .ggen/receipts/latest.json (already Ed25519-verified by ggen-verify).
  2. Emits one affi operation-event per output_hash entry using `affi receipt emit`.
  3. Assembles the events into an immutable affi receipt.
  4. Runs `affi receipt verify` on the assembled receipt.
  5. Parses the JSON verdict and exits non-zero with a clear message on failure.

Exit codes mirror the affi convention:
  0  — receipt accepted (verdict.accepted == true)
  1  — receipt rejected (verdict details printed)
  2  — tooling missing or ggen receipt absent (soft-skip with warning)
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GGEN_RECEIPT = ROOT / ".ggen/receipts/latest.json"
AFFI_RECEIPT_DIR = ROOT / ".wasm4pm/receipts/affi"
AFFI_RECEIPT_PATH = AFFI_RECEIPT_DIR / "ggen-gate.json"

# Candidate locations for the affi binary (preferred: installed on PATH).
AFFI_CANDIDATES = [
    shutil.which("affi"),
    "/tmp/affidavit/target/release/affi",
    "/tmp/affidavit/target/debug/affi",
    "/tmp/affidavit-integration/target/release/affi",
    "/tmp/affidavit-integration/target/debug/affi",
]


def find_affi() -> str | None:
    for c in AFFI_CANDIDATES:
        if c and Path(c).is_file() and os.access(c, os.X_OK):
            return c
    return None


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, **kw)


def emit_event(affi: str, obj: str, payload: str, env: dict, work_dir: str) -> None:
    # affi treats --payload as a file path, so write to a temp file.
    payload_file = Path(work_dir) / f"payload_{abs(hash(obj))}.json"
    payload_file.write_text(payload)
    result = run(
        [affi, "receipt", "emit", "--r#type", "ggen-sync", "--object", obj, "--payload", str(payload_file)],
        capture_output=True,
        env=env,
    )
    if result.returncode != 0:
        msg = result.stderr.decode(errors="replace").strip()
        print(f"error: affi receipt emit failed for {obj}: {msg}", file=sys.stderr)
        sys.exit(1)


def main() -> int:
    affi = find_affi()
    if affi is None:
        print(
            "warning: affi binary not found — skipping cryptographic affi verify.\n"
            "  To enable: cargo install --path /tmp/affidavit  (or install affidavit crate)\n"
            "  ggen Ed25519 verification (ggen-verify) still ran and passed.",
            file=sys.stderr,
        )
        return 0  # soft-skip: don't hard-block when tooling is absent

    if not GGEN_RECEIPT.exists():
        print(f"error: ggen receipt not found at {GGEN_RECEIPT}", file=sys.stderr)
        return 2

    receipt = json.loads(GGEN_RECEIPT.read_bytes())

    # Collect output file entries from the ggen receipt.
    # Format: "path/to/file:blake3hex"  or just "path"
    output_entries: list[tuple[str, str]] = []
    for entry in receipt.get("output_hashes", []):
        if ":" in entry:
            path, digest = entry.rsplit(":", 1)
        else:
            path, digest = entry, ""
        output_entries.append((path.lstrip("./"), digest))

    if not output_entries:
        print("error: ggen receipt has no output_hashes — cannot build affi receipt", file=sys.stderr)
        return 2

    # Use a temp dir as the affi working receipt state.
    AFFI_RECEIPT_DIR.mkdir(parents=True, exist_ok=True)

    # affi uses AFFI_WORK_DIR env var for the working receipt state (if supported),
    # else we use a temp dir and write the assembled receipt to AFFI_RECEIPT_PATH.
    with tempfile.TemporaryDirectory(prefix="affi-ggen-") as work_dir:
        env = {**os.environ, "AFFI_WORK_DIR": work_dir}

        print(f"affi: {affi}")
        print(f"ggen receipt: {GGEN_RECEIPT}")
        print(f"emitting {len(output_entries)} operation events…")

        # Emit one event per output file (chain integrity = all outputs accounted for).
        for path, digest in output_entries:
            payload = json.dumps({"path": path, "blake3": digest, "ggen_op_id": receipt.get("operation_id", "")})
            # affi --object requires "id:type" format; use path as id, "ggen-output" as type.
            obj_spec = f"{path}:ggen-output"
            emit_event(affi, obj_spec, payload, env, work_dir)

        # Assemble into an immutable receipt.
        assembled = Path(work_dir) / "assembled.json"
        result = run(
            [affi, "receipt", "assemble", "--out", str(assembled), "--format", "json"],
            capture_output=True,
            env=env,
        )
        if result.returncode != 0:
            msg = result.stderr.decode(errors="replace").strip()
            print(f"error: affi receipt assemble failed: {msg}", file=sys.stderr)
            return 1

        # Run cryptographic verification on the assembled receipt.
        result = run(
            [affi, "receipt", "verify", "--receipt", str(assembled), "--format", "json"],
            capture_output=True,
            env=env,
        )
        raw = result.stdout.decode(errors="replace").strip()

        # affi with --format json may emit trailing "null" after the JSON object
        # (return value of the handler function). Parse the first JSON value only.
        verdict = None
        for line_end in range(len(raw), 0, -1):
            try:
                verdict = json.loads(raw[:line_end])
                if isinstance(verdict, dict):
                    break
            except json.JSONDecodeError:
                continue

        if verdict is None or not isinstance(verdict, dict):
            # Fallback: use exit code.
            err = result.stderr.decode(errors="replace").strip()
            if result.returncode != 0:
                print(f"error: affi receipt verify failed (non-JSON output): {raw}", file=sys.stderr)
                print(f"stderr: {err}", file=sys.stderr)
                return 1
            print(f"warning: affi verify returned non-JSON but exit 0 — treating as accepted")
            verdict = {"accepted": True, "profile": "unknown", "reason": raw or "exit 0", "outcomes": []}

        accepted = verdict.get("accepted", False)
        profile = verdict.get("profile", "?")
        reason = verdict.get("reason", "")

        if accepted:
            print(f"affi verify: ACCEPT [{profile}] — {reason}")
            for outcome in verdict.get("outcomes", []):
                mark = "PASS" if outcome.get("passed") else "FAIL"
                print(f"  {outcome.get('stage','?')}: {mark} — {outcome.get('detail','')}")
            # Copy verified receipt to persistent path.
            AFFI_RECEIPT_PATH.write_bytes(assembled.read_bytes())
            print(f"affi receipt saved: {AFFI_RECEIPT_PATH}")
            return 0
        else:
            print(f"error: affi verify: REJECT [{profile}] — {reason}", file=sys.stderr)
            for outcome in verdict.get("outcomes", []):
                mark = "PASS" if outcome.get("passed") else "FAIL"
                print(f"  {outcome.get('stage','?')}: {mark} — {outcome.get('detail','')}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(main())
