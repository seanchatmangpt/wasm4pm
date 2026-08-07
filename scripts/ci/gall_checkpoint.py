#!/usr/bin/env python3
"""GALL: fail-closed execution checkpoints with replayable receipts.

GALL never promotes inspection, workflow metadata, or a named artifact to ALIVE.
A checkpoint is ALIVE only after its exact command executes successfully against
the admitted subject identity and its receipt verifies.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import json
import os
import pathlib
import platform
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from enum import Enum
from typing import Any, Iterable, Sequence


SCHEMA = "wasm4pm.gall.checkpoint.v1"
CROWN_SCHEMA = "wasm4pm.gall.crown.v1"


class Standing(str, Enum):
    UNKNOWN = "UNKNOWN"
    PARTIAL_ALIVE = "PARTIAL_ALIVE"
    ALIVE = "ALIVE"
    BLOCKED = "BLOCKED"
    BUILD_BROKEN = "BUILD_BROKEN"
    UNSUPPORTED = "UNSUPPORTED"
    REFUSED = "REFUSED"


@dataclasses.dataclass(frozen=True)
class Checkpoint:
    checkpoint_id: str
    title: str
    command: tuple[str, ...]
    cwd: str
    timeout_seconds: int
    required_receipts: tuple[str, ...]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def digest_json(value: dict[str, Any]) -> str:
    unsigned = dict(value)
    unsigned.pop("receipt_sha256", None)
    return hashlib.sha256(canonical_bytes(unsigned)).hexdigest()


def atomic_write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as handle:
        handle.write(payload)
        temp_name = handle.name
    os.replace(temp_name, path)


def file_sha256(path: pathlib.Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def git_output(root: pathlib.Path, *args: str) -> str | None:
    git = shutil.which("git")
    if not git:
        return None
    completed = subprocess.run(
        [git, "-C", str(root), *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return completed.stdout.strip() if completed.returncode == 0 else None


def observed_subject(root: pathlib.Path) -> dict[str, Any]:
    head = git_output(root, "rev-parse", "HEAD")
    tree = git_output(root, "rev-parse", "HEAD^{tree}")
    dirty = git_output(root, "status", "--porcelain=v1")
    return {
        "git_head": head,
        "git_tree": tree,
        "worktree_clean": dirty == "" if dirty is not None else None,
        "root": str(root.resolve()),
    }


def tool_identity(command: Sequence[str]) -> dict[str, Any]:
    executable = shutil.which(command[0]) if command else None
    identity: dict[str, Any] = {
        "requested": command[0] if command else None,
        "resolved": executable,
    }
    if executable:
        path = pathlib.Path(executable)
        try:
            identity["sha256"] = file_sha256(path)
            identity["bytes"] = path.stat().st_size
        except OSError as exc:
            identity["identity_error"] = f"{type(exc).__name__}: {exc}"
    return identity


def read_receipt(path: pathlib.Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    expected = value.get("receipt_sha256")
    observed = digest_json(value)
    if expected != observed:
        raise ValueError(
            f"RECEIPT_DIGEST_MISMATCH path={path} expected={expected} observed={observed}"
        )
    return value


def base_evidence() -> dict[str, list[Any]]:
    return {
        "observed": [],
        "admitted": [],
        "executed": [],
        "changed": [],
        "verified": [],
        "inferred": [],
        "refused": [],
        "blocked": [],
        "unsupported": [],
    }


def checkpoint_output_path(artifact_dir: pathlib.Path, checkpoint_id: str) -> pathlib.Path:
    safe = "".join(
        character if character.isalnum() or character in "._-" else "_"
        for character in checkpoint_id
    )
    if not safe or safe != checkpoint_id:
        raise ValueError(
            "CHECKPOINT_ID_REFUSED: use only letters, digits, dot, underscore, and dash"
        )
    return artifact_dir / f"{safe}.receipt.json"


def make_receipt(
    *,
    checkpoint: Checkpoint,
    subject_sha: str,
    subject: dict[str, Any],
    standing: Standing,
    evidence: dict[str, list[Any]],
    started_at: str,
    finished_at: str,
    duration_ms: int,
    exit_code: int | None,
    stdout_path: pathlib.Path | None,
    stderr_path: pathlib.Path | None,
    blocker: dict[str, Any] | None,
) -> dict[str, Any]:
    receipt: dict[str, Any] = {
        "schema": SCHEMA,
        "checkpoint": {
            "id": checkpoint.checkpoint_id,
            "title": checkpoint.title,
            "required": True,
        },
        "subject": {
            "admitted_git_head": subject_sha,
            **subject,
        },
        "command": {
            "argv": list(checkpoint.command),
            "display": shlex.join(checkpoint.command),
            "cwd": checkpoint.cwd,
            "timeout_seconds": checkpoint.timeout_seconds,
            "tool": tool_identity(checkpoint.command),
        },
        "dependencies": list(checkpoint.required_receipts),
        "standing": standing.value,
        "evidence": evidence,
        "execution": {
            "started_at": started_at,
            "finished_at": finished_at,
            "duration_ms": duration_ms,
            "exit_code": exit_code,
        },
        "streams": {
            "stdout": (
                {
                    "path": str(stdout_path),
                    "sha256": file_sha256(stdout_path),
                    "bytes": stdout_path.stat().st_size,
                }
                if stdout_path and stdout_path.exists()
                else None
            ),
            "stderr": (
                {
                    "path": str(stderr_path),
                    "sha256": file_sha256(stderr_path),
                    "bytes": stderr_path.stat().st_size,
                }
                if stderr_path and stderr_path.exists()
                else None
            ),
        },
        "blocker": blocker,
        "replay": {
            "argv": list(checkpoint.command),
            "cwd": checkpoint.cwd,
            "subject_sha": subject_sha,
        },
        "environment": {
            "platform": platform.platform(),
            "python": sys.version,
            "pid": os.getpid(),
        },
    }
    receipt["receipt_sha256"] = digest_json(receipt)
    return receipt


def refused_receipt(
    *,
    checkpoint: Checkpoint,
    subject_sha: str,
    subject: dict[str, Any],
    artifact_dir: pathlib.Path,
    code: str,
    message: str,
    evidence_bucket: str,
) -> tuple[dict[str, Any], pathlib.Path]:
    now = utc_now()
    evidence = base_evidence()
    evidence["observed"].append(subject)
    evidence[evidence_bucket].append({"code": code, "message": message})
    receipt = make_receipt(
        checkpoint=checkpoint,
        subject_sha=subject_sha,
        subject=subject,
        standing=(
            Standing.UNSUPPORTED
            if evidence_bucket == "unsupported"
            else Standing.BLOCKED
            if evidence_bucket == "blocked"
            else Standing.REFUSED
        ),
        evidence=evidence,
        started_at=now,
        finished_at=now,
        duration_ms=0,
        exit_code=None,
        stdout_path=None,
        stderr_path=None,
        blocker={"code": code, "message": message},
    )
    output_path = checkpoint_output_path(artifact_dir, checkpoint.checkpoint_id)
    atomic_write_json(output_path, receipt)
    return receipt, output_path


def validate_dependencies(
    dependency_paths: Iterable[str], subject_sha: str
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    receipts: list[dict[str, Any]] = []
    for raw_path in dependency_paths:
        path = pathlib.Path(raw_path)
        try:
            receipt = read_receipt(path)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            return receipts, {
                "code": "DEPENDENCY_RECEIPT_REFUSED",
                "path": str(path),
                "message": f"{type(exc).__name__}: {exc}",
            }
        if receipt.get("subject", {}).get("admitted_git_head") != subject_sha:
            return receipts, {
                "code": "DEPENDENCY_SUBJECT_MISMATCH",
                "path": str(path),
                "expected": subject_sha,
                "observed": receipt.get("subject", {}).get("admitted_git_head"),
            }
        if receipt.get("standing") != Standing.ALIVE.value:
            return receipts, {
                "code": "DEPENDENCY_NOT_ALIVE",
                "path": str(path),
                "standing": receipt.get("standing"),
            }
        receipts.append(receipt)
    return receipts, None


def execute_checkpoint(
    checkpoint: Checkpoint,
    *,
    root: pathlib.Path,
    artifact_dir: pathlib.Path,
    subject_sha: str,
) -> tuple[dict[str, Any], pathlib.Path]:
    root = root.resolve()
    artifact_dir = artifact_dir.resolve()
    subject = observed_subject(root)
    if not checkpoint.command:
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code="EMPTY_COMMAND_REFUSED",
            message="a checkpoint requires an explicit argv",
            evidence_bucket="refused",
        )
    if subject["git_head"] != subject_sha:
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code="SUBJECT_IDENTITY_MISMATCH",
            message=f"expected={subject_sha} observed={subject['git_head']}",
            evidence_bucket="refused",
        )
    executable = shutil.which(checkpoint.command[0])
    if executable is None:
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code="EXECUTABLE_NOT_FOUND",
            message=checkpoint.command[0],
            evidence_bucket="unsupported",
        )
    dependencies, dependency_error = validate_dependencies(
        checkpoint.required_receipts, subject_sha
    )
    if dependency_error:
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code=dependency_error["code"],
            message=json.dumps(dependency_error, sort_keys=True),
            evidence_bucket="blocked",
        )

    cwd = (root / checkpoint.cwd).resolve()
    try:
        cwd.relative_to(root)
    except ValueError:
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code="CWD_ESCAPE_REFUSED",
            message=str(cwd),
            evidence_bucket="refused",
        )
    if not cwd.is_dir():
        return refused_receipt(
            checkpoint=checkpoint,
            subject_sha=subject_sha,
            subject=subject,
            artifact_dir=artifact_dir,
            code="CWD_MISSING",
            message=str(cwd),
            evidence_bucket="blocked",
        )

    artifact_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = artifact_dir / f"{checkpoint.checkpoint_id}.stdout.log"
    stderr_path = artifact_dir / f"{checkpoint.checkpoint_id}.stderr.log"
    started_at = utc_now()
    started = time.monotonic()
    exit_code: int | None = None
    blocker: dict[str, Any] | None = None
    standing = Standing.UNKNOWN
    evidence = base_evidence()
    evidence["observed"].append(subject)
    evidence["admitted"].append(
        {
            "subject_sha": subject_sha,
            "argv": list(checkpoint.command),
            "cwd": str(cwd),
            "dependency_receipts": [
                dependency["receipt_sha256"] for dependency in dependencies
            ],
        }
    )

    try:
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            completed = subprocess.run(
                checkpoint.command,
                cwd=cwd,
                check=False,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                timeout=checkpoint.timeout_seconds,
                env=os.environ.copy(),
            )
        exit_code = completed.returncode
        evidence["executed"].append(
            {
                "argv": list(checkpoint.command),
                "exit_code": exit_code,
            }
        )
        if exit_code == 0:
            standing = Standing.ALIVE
            evidence["verified"].append(
                {
                    "law": "exact_command_zero_exit",
                    "subject_sha": subject_sha,
                }
            )
        else:
            standing = Standing.BUILD_BROKEN
            blocker = {
                "code": "COMMAND_NONZERO",
                "exit_code": exit_code,
                "stderr_sha256": file_sha256(stderr_path),
            }
            evidence["blocked"].append(blocker)
    except subprocess.TimeoutExpired:
        standing = Standing.BLOCKED
        blocker = {
            "code": "COMMAND_TIMEOUT",
            "timeout_seconds": checkpoint.timeout_seconds,
        }
        evidence["blocked"].append(blocker)
    except OSError as exc:
        standing = Standing.UNSUPPORTED
        blocker = {
            "code": "EXECUTION_UNSUPPORTED",
            "message": f"{type(exc).__name__}: {exc}",
        }
        evidence["unsupported"].append(blocker)

    finished_at = utc_now()
    duration_ms = int((time.monotonic() - started) * 1000)
    receipt = make_receipt(
        checkpoint=checkpoint,
        subject_sha=subject_sha,
        subject=subject,
        standing=standing,
        evidence=evidence,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=duration_ms,
        exit_code=exit_code,
        stdout_path=stdout_path,
        stderr_path=stderr_path,
        blocker=blocker,
    )
    output_path = checkpoint_output_path(artifact_dir, checkpoint.checkpoint_id)
    atomic_write_json(output_path, receipt)
    read_receipt(output_path)
    return receipt, output_path


def aggregate_standing(
    receipts: Sequence[dict[str, Any]], missing: Sequence[str]
) -> Standing:
    if not receipts and missing:
        return Standing.UNKNOWN
    standings = {receipt.get("standing") for receipt in receipts}
    if Standing.REFUSED.value in standings:
        return Standing.REFUSED
    if Standing.BUILD_BROKEN.value in standings:
        return Standing.BUILD_BROKEN
    if Standing.BLOCKED.value in standings:
        return Standing.BLOCKED
    if Standing.UNSUPPORTED.value in standings:
        return Standing.UNSUPPORTED
    if missing:
        return Standing.PARTIAL_ALIVE if receipts else Standing.UNKNOWN
    if standings == {Standing.ALIVE.value}:
        return Standing.ALIVE
    return Standing.UNKNOWN


def crown_receipts(
    *,
    receipt_paths: Sequence[pathlib.Path],
    required_ids: Sequence[str],
    subject_sha: str,
    output_path: pathlib.Path,
) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    by_id: dict[str, dict[str, Any]] = {}
    for path in receipt_paths:
        try:
            receipt = read_receipt(path)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            errors.append(
                {
                    "code": "LEAF_RECEIPT_REFUSED",
                    "path": str(path),
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )
            continue
        checkpoint_id = receipt.get("checkpoint", {}).get("id")
        if receipt.get("schema") != SCHEMA or not checkpoint_id:
            errors.append(
                {
                    "code": "LEAF_SCHEMA_REFUSED",
                    "path": str(path),
                }
            )
            continue
        if checkpoint_id in by_id:
            errors.append(
                {
                    "code": "DUPLICATE_CHECKPOINT_REFUSED",
                    "checkpoint_id": checkpoint_id,
                }
            )
            continue
        if receipt.get("subject", {}).get("admitted_git_head") != subject_sha:
            errors.append(
                {
                    "code": "LEAF_SUBJECT_MISMATCH",
                    "checkpoint_id": checkpoint_id,
                    "expected": subject_sha,
                    "observed": receipt.get("subject", {}).get("admitted_git_head"),
                }
            )
            continue
        by_id[checkpoint_id] = receipt

    missing = [checkpoint_id for checkpoint_id in required_ids if checkpoint_id not in by_id]
    unexpected = sorted(set(by_id) - set(required_ids))
    selected = [by_id[checkpoint_id] for checkpoint_id in required_ids if checkpoint_id in by_id]
    standing = aggregate_standing(selected, missing)
    if errors or unexpected:
        standing = Standing.REFUSED

    crown: dict[str, Any] = {
        "schema": CROWN_SCHEMA,
        "subject": {"admitted_git_head": subject_sha},
        "standing": standing.value,
        "required_checkpoints": list(required_ids),
        "missing_checkpoints": missing,
        "unexpected_checkpoints": unexpected,
        "errors": errors,
        "leaves": [
            {
                "id": receipt["checkpoint"]["id"],
                "standing": receipt["standing"],
                "receipt_sha256": receipt["receipt_sha256"],
                "exit_code": receipt["execution"]["exit_code"],
                "blocker": receipt.get("blocker"),
            }
            for receipt in selected
        ],
        "evidence": {
            "observed": [{"receipt_count": len(receipt_paths)}],
            "admitted": [{"required_checkpoints": list(required_ids)}],
            "executed": [],
            "changed": [],
            "verified": [
                {
                    "checkpoint_id": receipt["checkpoint"]["id"],
                    "receipt_sha256": receipt["receipt_sha256"],
                }
                for receipt in selected
            ],
            "inferred": [],
            "refused": errors,
            "blocked": [{"missing_checkpoints": missing}] if missing else [],
            "unsupported": [],
        },
        "replay": {
            "argv": [
                sys.executable,
                "scripts/ci/gall_checkpoint.py",
                "crown",
                "--subject-sha",
                subject_sha,
                "--required",
                *required_ids,
                "--receipts",
                *[str(path) for path in receipt_paths],
            ]
        },
    }
    crown["receipt_sha256"] = digest_json(crown)
    atomic_write_json(output_path, crown)
    return crown


def print_summary(receipt: dict[str, Any]) -> None:
    if receipt.get("schema") == SCHEMA:
        checkpoint = receipt["checkpoint"]["id"]
        exit_code = receipt["execution"]["exit_code"]
        print(
            f"GALL checkpoint={checkpoint} standing={receipt['standing']} "
            f"exit={exit_code} receipt={receipt['receipt_sha256']}"
        )
    else:
        print(
            f"GALL crown standing={receipt['standing']} "
            f"leaves={len(receipt.get('leaves', []))} "
            f"receipt={receipt['receipt_sha256']}"
        )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    subparsers = root.add_subparsers(dest="action", required=True)

    run = subparsers.add_parser("run", help="Execute one exact checkpoint")
    run.add_argument("--id", required=True, dest="checkpoint_id")
    run.add_argument("--title")
    run.add_argument("--subject-sha", required=True)
    run.add_argument("--root", default=".")
    run.add_argument("--cwd", default=".")
    run.add_argument("--artifact-dir", default="artifacts/gall")
    run.add_argument("--timeout", type=int, default=3600)
    run.add_argument("--requires", nargs="*", default=[])
    run.add_argument("command", nargs=argparse.REMAINDER)

    crown = subparsers.add_parser("crown", help="Verify and crown exact receipts")
    crown.add_argument("--subject-sha", required=True)
    crown.add_argument("--required", nargs="+", required=True)
    crown.add_argument("--receipts", nargs="+", required=True)
    crown.add_argument("--output", default="artifacts/gall/crown.receipt.json")

    verify = subparsers.add_parser("verify", help="Verify a receipt digest")
    verify.add_argument("receipt")
    return root


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.action == "verify":
        try:
            receipt = read_receipt(pathlib.Path(args.receipt))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            print(f"GALL_RECEIPT_REFUSED {type(exc).__name__}: {exc}", file=sys.stderr)
            return 2
        print_summary(receipt)
        return 0 if receipt.get("standing") == Standing.ALIVE.value else 1

    if args.action == "run":
        command = tuple(args.command)
        if command and command[0] == "--":
            command = command[1:]
        checkpoint = Checkpoint(
            checkpoint_id=args.checkpoint_id,
            title=args.title or args.checkpoint_id,
            command=command,
            cwd=args.cwd,
            timeout_seconds=args.timeout,
            required_receipts=tuple(args.requires),
        )
        try:
            receipt, output_path = execute_checkpoint(
                checkpoint,
                root=pathlib.Path(args.root),
                artifact_dir=pathlib.Path(args.artifact_dir),
                subject_sha=args.subject_sha,
            )
        except ValueError as exc:
            print(f"GALL_CHECKPOINT_REFUSED {exc}", file=sys.stderr)
            return 2
        print_summary(receipt)
        print(f"GALL receipt_path={output_path}")
        return 0 if receipt["standing"] == Standing.ALIVE.value else 1

    receipt_paths = [pathlib.Path(value) for value in args.receipts]
    crown = crown_receipts(
        receipt_paths=receipt_paths,
        required_ids=args.required,
        subject_sha=args.subject_sha,
        output_path=pathlib.Path(args.output),
    )
    print_summary(crown)
    return 0 if crown["standing"] == Standing.ALIVE.value else 1


if __name__ == "__main__":
    raise SystemExit(main())
