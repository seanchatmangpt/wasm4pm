#!/usr/bin/env python3
"""Regression guard for ggen's run-scoped Ed25519 receipt identity.

The repository must never track a signing or verifying key. A real sync creates
an ephemeral pair; ggen verifies the signed receipt with that pair; the public
key is then bound into the BLAKE3 bridge receipt for independent replay.
"""

from __future__ import annotations

import json
import stat
import subprocess
from pathlib import Path

from blake3 import blake3


ROOT = Path(__file__).resolve().parents[2]
KEYS = {
    "signing": ROOT / ".ggen/keys/signing.key",
    "verifying": ROOT / ".ggen/keys/verifying.key",
}
BRIDGE = ROOT / ".wasm4pm/receipts/ggen-bridge-latest.json"


def git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read_hex_key(path: Path) -> str:
    require(path.is_file(), f"missing run-scoped key: {path.relative_to(ROOT)}")
    value = path.read_text(encoding="utf-8").strip().lower()
    require(len(value) == 64, f"key must be 32 bytes: {path.relative_to(ROOT)}")
    try:
        bytes.fromhex(value)
    except ValueError as error:
        raise AssertionError(f"key is not hexadecimal: {path.relative_to(ROOT)}") from error
    return value


def main() -> int:
    tracked = git("ls-files", "--", ".ggen/keys/signing.key", ".ggen/keys/verifying.key")
    require(tracked.returncode == 0, tracked.stderr.strip())
    require(not tracked.stdout.strip(), "ggen key material must not be tracked")

    for name, path in KEYS.items():
        ignored = git("check-ignore", "-q", str(path.relative_to(ROOT)))
        require(ignored.returncode == 0, f"{name} key is not ignored")

    signing_key = read_hex_key(KEYS["signing"])
    verifying_key = read_hex_key(KEYS["verifying"])
    require(signing_key != verifying_key, "private seed must not equal public key bytes")

    permissions = stat.S_IMODE(KEYS["signing"].stat().st_mode)
    require(
        permissions & 0o077 == 0,
        f"signing key permissions expose group/other bits: {permissions:o}",
    )

    require(BRIDGE.is_file(), f"missing bridge receipt: {BRIDGE.relative_to(ROOT)}")
    bridge = json.loads(BRIDGE.read_text(encoding="utf-8"))
    require(bridge.get("schema") == "wasm4pm.ggen-bridge-receipt.v2", "bridge schema drift")
    require(bridge.get("signature_algorithm") == "ed25519", "signature algorithm drift")
    require(
        bridge.get("verifying_key_scope") == "exact-workflow-run",
        "verifying-key scope is not exact-workflow-run",
    )
    require(bridge.get("verifying_key_hex") == verifying_key, "bridge public key mismatch")
    require(
        bridge.get("verifying_key_hash") == blake3(bytes.fromhex(verifying_key)).hexdigest(),
        "bridge public-key BLAKE3 mismatch",
    )
    require(len(str(bridge.get("receipt_hash", ""))) == 64, "bridge receipt hash missing")

    print(
        json.dumps(
            {
                "schema": "wasm4pm.ggen-key-identity-test.v1",
                "tracked_keys": 0,
                "key_scope": "exact-workflow-run",
                "signature_algorithm": "ed25519",
                "verifying_key_hash": bridge["verifying_key_hash"],
                "standing": "ALIVE",
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
