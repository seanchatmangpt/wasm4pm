#!/usr/bin/env python3
"""Bridge the current ggen receipt into wasm4pm's mandatory BLAKE3 receipt rail."""

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable, Tuple

ROOT = Path(__file__).resolve().parent.parent
GGEN_RECEIPT_CANDIDATES = [
    ROOT / ".ggen-v2/receipt.json",
    ROOT / ".ggen/receipts/latest.json",
]
OUT_DIR = ROOT / ".wasm4pm/receipts"
OUT_FILE = OUT_DIR / "ggen-bridge-latest.json"

GENERATED_FILES = [
    "crates/wasm4pm-cognition/src/breeds/registration.rs",
    "crates/wasm4pm-cognition/breeds/registry.json",
    "packages/cognition/src/breed-ids.ts",
    "crates/wasm4pm-cognition/tests/paper_pointers_generated.rs",
    "crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs",
    "crates/wasm4pm-cognition/tests/phd_lifecycle_generated.rs",
    "crates/wasm4pm-cognition/tests/phd_paper_oracles_generated.rs",
    "crates/wasm4pm-cli/src/commands/evidence.rs",
    "crates/wasm4pm-cli/tests/phd_mining_contracts_generated.rs",
    "crates/wasm4pm-cli/tests/phd_cli_cases_generated.rs",
    "wasm4pm/algorithm-registry.json",
]


def make_hasher() -> Tuple[str, Callable[[bytes], str]]:
    """Return a real BLAKE3 implementation or refuse; never downgrade the law."""
    try:
        import blake3  # type: ignore

        return "blake3", lambda data: blake3.blake3(data).hexdigest()
    except ImportError:
        pass

    try:
        subprocess.run(["b3sum", "--version"], capture_output=True, check=True)

        def b3sum_hash(data: bytes) -> str:
            process = subprocess.run(
                ["b3sum", "--no-names"],
                input=data,
                capture_output=True,
                check=True,
            )
            return process.stdout.decode().strip()

        return "blake3", b3sum_hash
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        raise RuntimeError(
            "BLAKE3_UNAVAILABLE: install the Python blake3 package or b3sum"
        ) from error


def git_output(*args: str) -> str:
    process = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return process.stdout.strip()


def resolve_source_receipt() -> Path:
    for candidate in GGEN_RECEIPT_CANDIDATES:
        if candidate.exists():
            return candidate
    rendered = ", ".join(str(path.relative_to(ROOT)) for path in GGEN_RECEIPT_CANDIDATES)
    raise FileNotFoundError(f"missing ggen receipt; checked {rendered}")


def main() -> int:
    try:
        source_receipt = resolve_source_receipt()
        algorithm, hash_bytes = make_hasher()
        git_revision = git_output("rev-parse", "HEAD")
        git_tree = git_output("rev-parse", "HEAD^{tree}")
        generated_status = git_output("status", "--porcelain", "--", *GENERATED_FILES)
    except (FileNotFoundError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if generated_status:
        print(
            "error: GENERATED_DRIFT_REFUSED — generated evidence surfaces are not clean:\n"
            + generated_status,
            file=sys.stderr,
        )
        return 2

    receipt_bytes = source_receipt.read_bytes()
    try:
        json.loads(receipt_bytes)
    except json.JSONDecodeError as error:
        print(f"error: invalid ggen receipt {source_receipt}: {error}", file=sys.stderr)
        return 2

    input_hash = hash_bytes(receipt_bytes)
    file_hashes = []
    for relative_path in GENERATED_FILES:
        rendered = ROOT / relative_path
        if not rendered.is_file():
            print(f"error: missing rendered file {relative_path}", file=sys.stderr)
            return 2
        file_hashes.append(
            {
                "path": relative_path,
                "hash": hash_bytes(rendered.read_bytes()),
            }
        )

    output_hash = hash_bytes(
        "".join(item["hash"] for item in file_hashes).encode("ascii")
    )
    if len(input_hash) != 64 or len(output_hash) != 64:
        print("error: BLAKE3 hashes must be 64 hexadecimal characters", file=sys.stderr)
        return 2

    previous_receipt_hash = None
    if OUT_FILE.exists():
        previous_receipt_hash = hash_bytes(OUT_FILE.read_bytes())

    payload = {
        "kind": "ggen-bridge",
        "schema": "wasm4pm.ggen-bridge-receipt.v1",
        "service_name": "ggen",
        "status": "ok",
        "algorithm": algorithm,
        "git_revision": git_revision,
        "git_tree": git_tree,
        "source_receipt": str(source_receipt.relative_to(ROOT)),
        "input_hash": input_hash,
        "output_hash": output_hash,
        "previous_receipt_hash": previous_receipt_hash,
        "files": file_hashes,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload["receipt_hash"] = hash_bytes(canonical)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(f"git_revision: {git_revision}")
    print(f"git_tree:     {git_tree}")
    print(f"input_hash:   {input_hash}")
    print(f"output_hash:  {output_hash}")
    print(f"receipt_hash: {payload['receipt_hash']}")
    print(f"receipt:      {OUT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
