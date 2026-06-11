#!/usr/bin/env python3
"""BLAKE3 receipt bridge: .ggen/receipts/latest.json -> .wasm4pm/receipts/ggen-bridge-latest.json"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GGEN_RECEIPT = ROOT / ".ggen/receipts/latest.json"
OUT_DIR = ROOT / ".wasm4pm/receipts"
OUT_FILE = OUT_DIR / "ggen-bridge-latest.json"

DEFAULT_FILES = [
    "crates/wasm4pm-cognition/src/breeds/registration.rs",
    "crates/wasm4pm-cognition/breeds/registry.json",
    "packages/cognition/src/breed-ids.ts",
    "crates/wasm4pm-cognition/tests/paper_pointers_generated.rs",
    "crates/wasm4pm-cognition/tests/universal_anticheat_generated.rs",
]


def make_hasher():
    """Return (algo_name, hash_fn) where hash_fn(bytes) -> hex digest."""
    try:
        import blake3  # type: ignore

        return "blake3", lambda b: blake3.blake3(b).hexdigest()
    except ImportError:
        pass
    try:
        subprocess.run(["b3sum", "--version"], capture_output=True, check=True)

        def b3sum_hash(b: bytes) -> str:
            p = subprocess.run(
                ["b3sum", "--no-names"], input=b, capture_output=True, check=True
            )
            return p.stdout.decode().strip()

        return "blake3", b3sum_hash
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    import hashlib

    return "sha256", lambda b: hashlib.sha256(b).hexdigest()


def main() -> int:
    if not GGEN_RECEIPT.exists():
        print(f"error: missing {GGEN_RECEIPT}", file=sys.stderr)
        return 2

    algo, h = make_hasher()
    receipt_bytes = GGEN_RECEIPT.read_bytes()
    input_hash = h(receipt_bytes)

    receipt = json.loads(receipt_bytes)
    files = []
    for entry in receipt.get("output_hashes", []):
        path = entry.rsplit(":", 1)[0] if ":" in entry else entry
        files.append(path.lstrip("./"))
    if not files:
        files = list(DEFAULT_FILES)
    files = sorted(set(files))

    digests = []
    for rel in files:
        p = ROOT / rel
        if not p.exists():
            print(f"error: missing rendered file {rel}", file=sys.stderr)
            return 2
        digests.append(h(p.read_bytes()))
    output_hash = h("".join(digests).encode())

    assert input_hash and output_hash, "hashes must be non-empty"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(
        json.dumps(
            {
                "kind": "ggen-bridge",
                "input_hash": input_hash,
                "output_hash": output_hash,
                "algo": algo,
                "source_receipt": ".ggen/receipts/latest.json",
                "files": files,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"input_hash:  {input_hash}")
    print(f"output_hash: {output_hash}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
