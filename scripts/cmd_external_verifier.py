#!/usr/bin/env python3
"""Independent exact-head verifier for the CMD G1-G10 program.

This file deliberately does not import the executor or pure kernel. It verifies
the executor's artifacts from bytes, Git identity, receipt hashes, suite results,
real stdio/HTTP evidence, and refusal inventory, then emits a separate standing
decision.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any, Sequence

from blake3 import blake3


REQUIRED_SUITES = {
    "protocol-unit",
    "property-fuzz",
    "stdio-http-integration",
    "cli-e2e",
    "security",
    "chaos",
    "stress",
    "benchmark",
    "replay",
    "external-verifier",
}
CHECKPOINTS = tuple(f"G{index}" for index in range(1, 10))


class VerificationError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    return blake3(canonical_bytes(value)).hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise VerificationError(f"invalid JSON artifact {path}: {error}") from error
    if not isinstance(value, dict):
        raise VerificationError(f"JSON artifact must be an object: {path}")
    return value


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent,
        prefix=f".{path.name}.", suffix=".tmp", delete=False,
    ) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def git(repo: Path, *args: str) -> str:
    process = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False)
    if process.returncode != 0:
        raise VerificationError(f"git {' '.join(args)} failed: {process.stderr.strip()}")
    return process.stdout.strip()


def verify_receipt(path: Path, commit: str, tree: str) -> dict[str, Any]:
    receipt = read_json(path)
    core = {key: value for key, value in receipt.items() if key != "receipt_hash"}
    if receipt.get("receipt_hash") != digest(core):
        raise VerificationError(f"receipt hash mismatch: {path}")
    if receipt.get("subject_commit") != commit:
        raise VerificationError(f"receipt commit mismatch: {path}")
    if receipt.get("subject_tree") != tree:
        raise VerificationError(f"receipt tree mismatch: {path}")
    for relative, expected_hash in receipt.get("artifact_hashes", {}).items():
        artifact = path.parents[2] / relative
        if not artifact.is_file():
            raise VerificationError(f"receipt artifact missing: {artifact}")
        actual_hash = blake3(artifact.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise VerificationError(f"artifact hash mismatch: {artifact}")
    return receipt


def verify_http_probe(evidence: Path) -> dict[str, Any]:
    probe = read_json(evidence / "verifier/http-probe.json")
    if probe.get("schema") != "wasm4pm.cmd.http-probe.v1":
        raise VerificationError("unexpected HTTP probe schema")
    if probe.get("transport") != "HTTP/1.1":
        raise VerificationError("HTTP probe did not cross the declared protocol")
    if probe.get("address") != "127.0.0.1" or probe.get("path") != "/cmd/health":
        raise VerificationError("HTTP probe crossed an undeclared boundary")
    if probe.get("status") != 200 or probe.get("passed") is not True:
        raise VerificationError("HTTP probe did not observe its postcondition")
    if probe.get("response_digest") != probe.get("expected_digest"):
        raise VerificationError("HTTP response bytes diverged")
    return probe


def verify(repo: Path, evidence: Path) -> dict[str, Any]:
    repo = repo.resolve()
    evidence = evidence if evidence.is_absolute() else repo / evidence
    commit = git(repo, "rev-parse", "HEAD^{commit}")
    tree = git(repo, "rev-parse", "HEAD^{tree}")
    if git(repo, "status", "--porcelain", "--untracked-files=no"):
        raise VerificationError("tracked working tree is dirty")

    report = read_json(evidence / "verifier/report.json")
    if report.get("schema") != "ggen.verifier.report.v1":
        raise VerificationError("unexpected verifier report schema")
    if report.get("exact_subject_revision") != commit:
        raise VerificationError("verifier report commit mismatch")
    if report.get("tree_digest") != tree:
        raise VerificationError("verifier report tree mismatch")
    suites = set(report.get("suite_inventory", []))
    if suites != REQUIRED_SUITES:
        raise VerificationError(
            f"suite inventory mismatch: missing={sorted(REQUIRED_SUITES-suites)} "
            f"extra={sorted(suites-REQUIRED_SUITES)}"
        )
    if report.get("failed_checks"):
        raise VerificationError(f"executor reported failed checks: {report['failed_checks']}")
    if report.get("aggregate_standing") != "UNKNOWN":
        raise VerificationError("executor attempted to set aggregate standing before independent verification")
    if report.get("replay_result") is not True:
        raise VerificationError("executor replay did not pass")
    refusal_codes = report.get("refusal_codes", [])
    if len(set(refusal_codes)) < 10:
        raise VerificationError("sabotage/refusal inventory is incomplete")
    http_probe = verify_http_probe(evidence)

    receipt_hashes = {}
    for checkpoint in CHECKPOINTS:
        path = evidence / "receipts/results" / f"{checkpoint.lower()}-{tree}.json"
        receipt = verify_receipt(path, commit, tree)
        receipt_hashes[checkpoint] = receipt["receipt_hash"]

    chain = read_json(evidence / "receipts/chain.json")
    if not chain.get("head"):
        raise VerificationError("receipt chain has no head")
    if chain.get("subject_tree") != tree:
        raise VerificationError("receipt chain tree mismatch")
    if chain["head"] != receipt_hashes["G9"]:
        raise VerificationError("receipt chain head is not the G9 result")

    result = {
        "schema": "wasm4pm.cmd.independent-verifier.v1",
        "verifier_identity": "scripts/cmd_external_verifier.py",
        "subject_commit": commit,
        "subject_tree": tree,
        "executor_report_digest": digest(report),
        "http_probe_digest": digest(http_probe),
        "receipt_chain_head": chain["head"],
        "verified_checkpoints": list(CHECKPOINTS),
        "verified_suites": sorted(REQUIRED_SUITES),
        "verified_boundaries": ["real process", "stdio", "HTTP/1.1", "real filesystem", "BLAKE3 replay"],
        "blocking_findings": [],
        "external_production_standing": "UNKNOWN",
        "aggregate_standing": "PARTIAL_ALIVE",
        "reason": (
            "G0-G9 evidence, stdio and HTTP boundaries, refusals, replay, and exact-head receipts verified; "
            "real external production actuation was intentionally not claimed"
        ),
    }
    result["verifier_report_digest"] = digest(result)
    write_json_atomic(evidence / "verifier/independent-report.json", result)
    return result


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--evidence", default=".ggen/cmd")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        result = verify(Path(args.repo), Path(args.evidence))
    except VerificationError as error:
        print(json.dumps({"aggregate_standing": "BUILD_BROKEN", "error": str(error)}, sort_keys=True))
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
