#!/usr/bin/env python3
"""
update_substrate_cert.py — Add SHA-256 artifact hashes to substrate-certificate.json.

Usage:
    python3 scripts/update_substrate_cert.py \
        --cert path/to/substrate-certificate.json \
        --artifacts path/to/file1.json path/to/file2.json ...
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path


def sha256_of_file(path: str) -> tuple[str, int]:
    """Return (hex_digest, size_bytes) for the file at path."""
    h = hashlib.sha256()
    size = 0
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


def evidence_pack_hash(artifact_hashes: list[dict]) -> str:
    """SHA-256 of the sorted JSON representation of all artifact hash records."""
    # Sort by path for determinism
    sorted_records = sorted(artifact_hashes, key=lambda r: r["path"])
    canonical = json.dumps(sorted_records, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update substrate-certificate.json with SHA-256 artifact hashes."
    )
    parser.add_argument(
        "--cert",
        required=True,
        metavar="PATH",
        help="Path to the existing substrate-certificate.json file.",
    )
    parser.add_argument(
        "--artifacts",
        required=True,
        nargs="+",
        metavar="PATH",
        help="One or more artifact file paths to hash.",
    )
    args = parser.parse_args()

    cert_path = Path(args.cert)
    if not cert_path.exists():
        print(f"error: certificate file not found: {cert_path}", file=sys.stderr)
        sys.exit(1)

    with cert_path.open("r", encoding="utf-8") as fh:
        cert = json.load(fh)

    artifact_hashes: list[dict] = []
    for artifact_path in args.artifacts:
        if os.path.exists(artifact_path):
            digest, size = sha256_of_file(artifact_path)
            artifact_hashes.append(
                {
                    "path": artifact_path,
                    "hash_algorithm": "sha256",
                    "hash": digest,
                    "size_bytes": size,
                    "exists": True,
                }
            )
        else:
            artifact_hashes.append(
                {
                    "path": artifact_path,
                    "exists": False,
                }
            )

    cert["artifact_hashes"] = artifact_hashes
    cert["evidence_pack_hash"] = evidence_pack_hash(artifact_hashes)

    updated_json = json.dumps(cert, indent=2, sort_keys=False)
    cert_path.write_text(updated_json + "\n", encoding="utf-8")

    pack_hash_prefix = cert["evidence_pack_hash"][:16]
    print(
        f"substrate-cert: updated with {len(artifact_hashes)} artifact hashes, "
        f"evidence_pack_hash={pack_hash_prefix}..."
    )


if __name__ == "__main__":
    main()
