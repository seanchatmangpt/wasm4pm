#!/usr/bin/env python3
"""CMD G0 exact-tree observer and independent verifier.

This checkpoint does not change runtime behavior. It observes the exact Git tree,
classifies every tracked leaf through the ggen-projected contract, records
untracked paths separately, emits BLAKE3 intent/result receipts, and proves the
mandatory omission falsifier.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence

SCHEMA_REPOSITORY = "wasm4pm.cmd.g0.repository.v1"
SCHEMA_SURFACES = "wasm4pm.cmd.g0.surfaces.v1"
SCHEMA_LOAD_PATHS = "wasm4pm.cmd.g0.load-paths.v1"
SCHEMA_UNKNOWNS = "wasm4pm.cmd.g0.unknowns.v1"
SCHEMA_RECEIPT = "wasm4pm.cmd.receipt.v1"
DEFAULT_OUTPUT = Path(".ggen/cmd/observation")
DEFAULT_CONTRACT = Path("schemas/cmd-g0-contract.json")
REQUIRED_ARTIFACTS = (
    "repository.json",
    "surfaces.json",
    "load-paths.json",
    "unknowns.json",
)


class CmdRefusal(RuntimeError):
    """Typed checkpoint refusal."""

    def __init__(self, code: str, detail: str):
        super().__init__(f"REFUSED: {code}: {detail}")
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class GitLeaf:
    path: str
    mode: str
    object_type: str
    object_id: str


def run_git(repo: Path, *args: str, text: bool = True) -> str | bytes:
    process = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=text,
        check=False,
    )
    if process.returncode != 0:
        stderr = process.stderr if text else process.stderr.decode("utf-8", "replace")
        raise CmdRefusal("CMD-G0-GIT", f"git {' '.join(args)} failed: {stderr.strip()}")
    return process.stdout


def make_blake3() -> Callable[[bytes], str]:
    try:
        import blake3  # type: ignore

        return lambda data: blake3.blake3(data).hexdigest()
    except ImportError:
        pass

    try:
        subprocess.run(["b3sum", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as error:
        raise CmdRefusal(
            "CMD-G0-BLAKE3-UNAVAILABLE",
            "install the Python blake3 package or b3sum",
        ) from error

    def b3sum(data: bytes) -> str:
        process = subprocess.run(
            ["b3sum", "--no-names"],
            input=data,
            capture_output=True,
            check=True,
        )
        return process.stdout.decode("ascii").strip()

    return b3sum


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def write_json_atomic(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def load_contract(repo: Path, contract_path: Path) -> dict:
    resolved = contract_path if contract_path.is_absolute() else repo / contract_path
    if not resolved.is_file():
        raise CmdRefusal(
            "CMD-G0-CONTRACT-MISSING",
            f"ggen-projected contract is absent: {resolved}",
        )
    try:
        contract = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CmdRefusal("CMD-G0-CONTRACT-INVALID", str(error)) from error

    if contract.get("checkpoint") != "G0":
        raise CmdRefusal("CMD-G0-CONTRACT-INVALID", "checkpoint must be G0")
    if tuple(contract.get("required_artifacts", ())) != REQUIRED_ARTIFACTS:
        raise CmdRefusal(
            "CMD-G0-CONTRACT-INVALID",
            "required artifact set does not match the constitutional G0 set",
        )
    if "CMD-G0-EXACT-SET" not in contract.get("refusal_codes", []):
        raise CmdRefusal(
            "CMD-G0-CONTRACT-INVALID",
            "CMD-G0-EXACT-SET refusal is missing",
        )
    rules = contract.get("classifications")
    if not isinstance(rules, list) or not rules:
        raise CmdRefusal("CMD-G0-CONTRACT-INVALID", "classification rules are missing")
    return contract


def resolve_subject(repo: Path, base: str) -> dict:
    commit = str(run_git(repo, "rev-parse", "--verify", f"{base}^{{commit}}")).strip()
    tree = str(run_git(repo, "rev-parse", f"{commit}^{{tree}}")).strip()
    commit_time = str(run_git(repo, "show", "-s", "--format=%cI", commit)).strip()
    remote = str(run_git(repo, "remote", "get-url", "origin")).strip()
    return {
        "base_ref": base,
        "base_commit_sha": commit,
        "base_tree_sha": tree,
        "observation_time": commit_time,
        "repository_remote": remote,
        "toolchain": {
            "git": str(run_git(repo, "--version")).strip(),
            "python": platform.python_version(),
            "observer": "scripts/cmd_g0.py",
        },
    }


def parse_index(repo: Path) -> list[GitLeaf]:
    raw = run_git(repo, "ls-files", "-s", "-z", text=False)
    leaves: list[GitLeaf] = []
    assert isinstance(raw, bytes)
    for record in raw.split(b"\0"):
        if not record:
            continue
        metadata, path_bytes = record.split(b"\t", 1)
        mode, object_id, stage = metadata.decode("ascii").split()
        if stage != "0":
            raise CmdRefusal(
                "CMD-G0-INDEX-STAGE",
                f"non-zero index stage {stage} for {os.fsdecode(path_bytes)}",
            )
        object_type = "commit" if mode == "160000" else "blob"
        leaves.append(
            GitLeaf(
                path=os.fsdecode(path_bytes),
                mode=mode,
                object_type=object_type,
                object_id=object_id,
            )
        )
    return sorted(leaves, key=lambda leaf: leaf.path)


def parse_tree(repo: Path, commit: str) -> tuple[list[GitLeaf], list[dict]]:
    raw = run_git(repo, "ls-tree", "-r", "-t", "-z", commit, text=False)
    leaves: list[GitLeaf] = []
    entries: list[dict] = []
    assert isinstance(raw, bytes)
    for record in raw.split(b"\0"):
        if not record:
            continue
        metadata, path_bytes = record.split(b"\t", 1)
        mode, object_type, object_id = metadata.decode("ascii").split()
        path = os.fsdecode(path_bytes)
        entries.append(
            {
                "path": path,
                "mode": mode,
                "object_type": object_type,
                "object_id": object_id,
            }
        )
        if object_type != "tree":
            leaves.append(
                GitLeaf(
                    path=path,
                    mode=mode,
                    object_type=object_type,
                    object_id=object_id,
                )
            )
    return sorted(leaves, key=lambda leaf: leaf.path), sorted(
        entries, key=lambda entry: entry["path"]
    )


def parse_untracked(repo: Path) -> list[str]:
    raw = run_git(
        repo,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        text=False,
    )
    assert isinstance(raw, bytes)
    paths: list[str] = []
    for record in raw.split(b"\0"):
        if record.startswith(b"?? "):
            paths.append(os.fsdecode(record[3:]))
    return sorted(paths)


def classify_path(path: str, contract: Mapping[str, object]) -> tuple[str, str]:
    raw_rules = contract["classifications"]
    assert isinstance(raw_rules, list)
    rules = sorted(
        raw_rules,
        key=lambda rule: (
            int(rule["precedence"]),
            str(rule["classification"]),
            str(rule["pattern"]),
        ),
    )
    for rule in rules:
        pattern = str(rule["pattern"])
        if fnmatch.fnmatchcase(path, pattern):
            return str(rule["classification"]), pattern
    return "unknown", "<fallback>"


def is_load_path(path: str) -> bool:
    name = Path(path).name
    return (
        name
        in {
            "Cargo.toml",
            "Cargo.lock",
            "package.json",
            "pnpm-workspace.yaml",
            "pnpm-lock.yaml",
            "ggen.toml",
            "Justfile",
            "Makefile",
            "Makefile.toml",
            "rust-toolchain.toml",
            "rust-toolchain",
            "AGENTS.md",
            "CLAUDE.md",
        }
        or path.startswith(".github/workflows/")
        or path.startswith(".claude/rules/")
        or path.endswith("/mod.rs")
        or path.endswith("/lib.rs")
        or path.endswith("/main.rs")
    )


def surface_record(leaf: GitLeaf, contract: Mapping[str, object]) -> dict:
    classification, matched_pattern = classify_path(leaf.path, contract)
    kind = {
        "100644": "regular_file",
        "100755": "executable_file",
        "120000": "symlink",
        "160000": "gitlink",
    }.get(leaf.mode, "unknown_git_mode")
    return {
        "path": leaf.path,
        "mode": leaf.mode,
        "git_kind": kind,
        "object_type": leaf.object_type,
        "object_id": leaf.object_id,
        "classification": classification,
        "classification_rule": matched_pattern,
        "generated": classification == "generated consequence",
    }


def artifact_hashes(output_dir: Path, hasher: Callable[[bytes], str]) -> dict[str, str]:
    hashes: dict[str, str] = {}
    for name in REQUIRED_ARTIFACTS:
        path = output_dir / name
        if not path.is_file():
            raise CmdRefusal("CMD-G0-ARTIFACT-MISSING", str(path))
        hashes[name] = hasher(path.read_bytes())
    return hashes


def receipt_paths(repo: Path, tree_sha: str) -> tuple[Path, Path, Path]:
    root = repo / ".ggen/cmd/receipts"
    return (
        root / "intents" / f"g0-{tree_sha}.json",
        root / "results" / f"g0-{tree_sha}.json",
        root / "chain.json",
    )


def emit_intent(
    repo: Path,
    subject: Mapping[str, object],
    output_dir: Path,
    hasher: Callable[[bytes], str],
) -> dict:
    intent_path, _, _ = receipt_paths(repo, str(subject["base_tree_sha"]))
    core = {
        "schema": SCHEMA_RECEIPT,
        "kind": "intent",
        "checkpoint": "G0",
        "operation": "observe-exact-tree",
        "subject_commit": subject["base_commit_sha"],
        "subject_tree": subject["base_tree_sha"],
        "output_scope": str(output_dir.relative_to(repo)),
        "authority_grant": "repository-contract:G0-observation-only",
        "standing_ceiling": "PARTIAL_ALIVE",
    }
    receipt = {**core, "receipt_hash": hasher(canonical_json(core))}
    write_json_atomic(intent_path, receipt)
    return receipt


def emit_result(
    repo: Path,
    subject: Mapping[str, object],
    intent: Mapping[str, object],
    output_dir: Path,
    hasher: Callable[[bytes], str],
) -> dict:
    _, result_path, chain_path = receipt_paths(repo, str(subject["base_tree_sha"]))
    previous_hash = None
    if chain_path.is_file():
        try:
            previous_hash = json.loads(chain_path.read_text(encoding="utf-8")).get("head")
        except (OSError, json.JSONDecodeError):
            previous_hash = None
    core = {
        "schema": SCHEMA_RECEIPT,
        "kind": "result",
        "checkpoint": "G0",
        "operation": "observe-exact-tree",
        "subject_commit": subject["base_commit_sha"],
        "subject_tree": subject["base_tree_sha"],
        "intent_receipt_hash": intent["receipt_hash"],
        "artifact_hashes": artifact_hashes(output_dir, hasher),
        "observed_consequence": "exact-tree evidence committed atomically per artifact",
        "previous_receipt_hash": previous_hash,
        "standing": "PARTIAL_ALIVE",
    }
    receipt = {**core, "receipt_hash": hasher(canonical_json(core))}
    write_json_atomic(result_path, receipt)
    write_json_atomic(
        chain_path,
        {
            "schema": "wasm4pm.cmd.receipt-chain.v1",
            "head": receipt["receipt_hash"],
            "subject_tree": subject["base_tree_sha"],
        },
    )
    return receipt


def observe(
    repo: Path,
    base: str,
    output_dir: Path,
    contract_path: Path,
    hasher: Callable[[bytes], str] | None = None,
) -> dict:
    repo = repo.resolve()
    output_dir = output_dir if output_dir.is_absolute() else repo / output_dir
    hasher = hasher or make_blake3()
    contract = load_contract(repo, contract_path)
    subject = resolve_subject(repo, base)
    intent = emit_intent(repo, subject, output_dir, hasher)

    index_leaves = parse_index(repo)
    tree_leaves, tree_entries = parse_tree(repo, str(subject["base_commit_sha"]))
    if index_leaves != tree_leaves:
        raise CmdRefusal(
            "CMD-G0-INDEX-TREE-DIVERGENCE",
            "index leaves differ from the declared commit tree",
        )

    surfaces = [surface_record(leaf, contract) for leaf in tree_leaves]
    untracked = parse_untracked(repo)
    load_paths = [
        {
            "path": surface["path"],
            "classification": surface["classification"],
            "reason": "repository entrypoint or load-bearing manifest/module",
        }
        for surface in surfaces
        if is_load_path(str(surface["path"]))
    ]
    unknowns = [
        {
            "path": surface["path"],
            "reason": "no admitted classification rule matched",
        }
        for surface in surfaces
        if surface["classification"] == "unknown"
    ]

    repository_document = {
        "schema": SCHEMA_REPOSITORY,
        **subject,
        "index_leaf_count": len(index_leaves),
        "tree_leaf_count": len(tree_leaves),
        "tree_entry_count": len(tree_entries),
        "tracked_set_hash": hasher(
            canonical_json(
                [
                    [leaf.path, leaf.mode, leaf.object_type, leaf.object_id]
                    for leaf in tree_leaves
                ]
            )
        ),
        "untracked_paths": untracked,
        "untracked_count": len(untracked),
        "standing": "PARTIAL_ALIVE",
    }
    surfaces_document = {
        "schema": SCHEMA_SURFACES,
        "subject_commit": subject["base_commit_sha"],
        "subject_tree": subject["base_tree_sha"],
        "surfaces": surfaces,
    }
    load_paths_document = {
        "schema": SCHEMA_LOAD_PATHS,
        "subject_tree": subject["base_tree_sha"],
        "load_paths": load_paths,
    }
    unknowns_document = {
        "schema": SCHEMA_UNKNOWNS,
        "subject_tree": subject["base_tree_sha"],
        "unknowns": unknowns,
        "unknown_count": len(unknowns),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    write_json_atomic(output_dir / "repository.json", repository_document)
    write_json_atomic(output_dir / "surfaces.json", surfaces_document)
    write_json_atomic(output_dir / "load-paths.json", load_paths_document)
    write_json_atomic(output_dir / "unknowns.json", unknowns_document)
    result = emit_result(repo, subject, intent, output_dir, hasher)
    return {
        "subject_commit": subject["base_commit_sha"],
        "subject_tree": subject["base_tree_sha"],
        "surface_count": len(surfaces),
        "unknown_count": len(unknowns),
        "result_receipt_hash": result["receipt_hash"],
    }


def verify(
    repo: Path,
    observation_dir: Path,
    contract_path: Path,
    hasher: Callable[[bytes], str] | None = None,
) -> dict:
    repo = repo.resolve()
    observation_dir = observation_dir if observation_dir.is_absolute() else repo / observation_dir
    hasher = hasher or make_blake3()
    load_contract(repo, contract_path)

    documents: dict[str, dict] = {}
    for name in REQUIRED_ARTIFACTS:
        path = observation_dir / name
        if not path.is_file():
            raise CmdRefusal("CMD-G0-ARTIFACT-MISSING", str(path))
        try:
            documents[name] = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CmdRefusal("CMD-G0-ARTIFACT-INVALID", f"{path}: {error}") from error

    repository_document = documents["repository.json"]
    expected_commit = str(repository_document["base_commit_sha"])
    expected_tree = str(repository_document["base_tree_sha"])
    current_commit = str(run_git(repo, "rev-parse", "HEAD^{commit}")).strip()
    current_tree = str(run_git(repo, "rev-parse", "HEAD^{tree}")).strip()
    if current_commit != expected_commit or current_tree != expected_tree:
        raise CmdRefusal(
            "CMD-G0-BASE-CHANGED",
            f"observed {expected_commit}/{expected_tree}, current {current_commit}/{current_tree}",
        )

    tree_leaves, _ = parse_tree(repo, expected_commit)
    expected_rows = [
        [leaf.path, leaf.mode, leaf.object_type, leaf.object_id] for leaf in tree_leaves
    ]
    observed_surfaces = documents["surfaces.json"].get("surfaces", [])
    observed_rows = [
        [surface["path"], surface["mode"], surface["object_type"], surface["object_id"]]
        for surface in observed_surfaces
    ]
    if observed_rows != expected_rows:
        expected_paths = {row[0] for row in expected_rows}
        observed_paths = {row[0] for row in observed_rows}
        missing = sorted(expected_paths - observed_paths)
        extra = sorted(observed_paths - expected_paths)
        raise CmdRefusal(
            "CMD-G0-EXACT-SET",
            f"missing={missing[:10]} extra={extra[:10]} or metadata mismatch",
        )

    tracked_set_hash = hasher(canonical_json(expected_rows))
    if repository_document.get("tracked_set_hash") != tracked_set_hash:
        raise CmdRefusal(
            "CMD-G0-EXACT-SET",
            "tracked-set digest does not match the exact Git leaf set",
        )

    _, result_path, _ = receipt_paths(repo, expected_tree)
    if not result_path.is_file():
        raise CmdRefusal("CMD-G0-RESULT-RECEIPT-MISSING", str(result_path))
    result = json.loads(result_path.read_text(encoding="utf-8"))
    if result.get("artifact_hashes") != artifact_hashes(observation_dir, hasher):
        raise CmdRefusal(
            "CMD-G0-RECEIPT-TAMPER",
            "artifact hashes do not match the result receipt",
        )
    receipt_core = {key: value for key, value in result.items() if key != "receipt_hash"}
    if result.get("receipt_hash") != hasher(canonical_json(receipt_core)):
        raise CmdRefusal("CMD-G0-RECEIPT-TAMPER", "result receipt hash mismatch")

    return {
        "subject_commit": expected_commit,
        "subject_tree": expected_tree,
        "surface_count": len(observed_rows),
        "tracked_set_hash": tracked_set_hash,
        "standing": "PARTIAL_ALIVE",
    }


def falsify_omission(
    repo: Path,
    observation_dir: Path,
    contract_path: Path,
    hasher: Callable[[bytes], str] | None = None,
) -> dict:
    repo = repo.resolve()
    source = observation_dir if observation_dir.is_absolute() else repo / observation_dir
    hasher = hasher or make_blake3()
    if not source.is_dir():
        raise CmdRefusal("CMD-G0-ARTIFACT-MISSING", str(source))

    with tempfile.TemporaryDirectory(prefix="cmd-g0-falsifier-") as temporary:
        copy = Path(temporary) / "observation"
        shutil.copytree(source, copy)
        surfaces_path = copy / "surfaces.json"
        document = json.loads(surfaces_path.read_text(encoding="utf-8"))
        surfaces = document.get("surfaces", [])
        if not surfaces:
            raise CmdRefusal("CMD-G0-FALSIFIER-INVALID", "surface set is empty")
        removed = surfaces.pop(len(surfaces) // 2)
        write_json_atomic(surfaces_path, document)
        try:
            verify(repo, copy, contract_path, hasher)
        except CmdRefusal as refusal:
            if refusal.code != "CMD-G0-EXACT-SET":
                raise CmdRefusal(
                    "CMD-G0-FALSIFIER-WRONG-REFUSAL",
                    f"expected CMD-G0-EXACT-SET, got {refusal.code}",
                ) from refusal
            return {
                "falsifier": "tracked-path-omission",
                "removed_path": removed["path"],
                "observed_refusal": refusal.code,
                "standing": "PARTIAL_ALIVE",
            }
    raise CmdRefusal(
        "CMD-G0-FALSIFIER-ADMITTED",
        "omitted tracked path was incorrectly admitted",
    )


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument("--repo", type=Path, default=Path("."))
    command.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    subcommands = command.add_subparsers(dest="command", required=True)

    observe_parser = subcommands.add_parser("observe")
    observe_parser.add_argument("--base", default="HEAD")
    observe_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)

    verify_parser = subcommands.add_parser("verify")
    verify_parser.add_argument("--observation", type=Path, default=DEFAULT_OUTPUT)

    falsifier_parser = subcommands.add_parser("falsify-omission")
    falsifier_parser.add_argument("--observation", type=Path, default=DEFAULT_OUTPUT)

    crown_parser = subcommands.add_parser("crown")
    crown_parser.add_argument("--base", default="HEAD")
    crown_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return command


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "observe":
            result = observe(args.repo, args.base, args.output, args.contract)
        elif args.command == "verify":
            result = verify(args.repo, args.observation, args.contract)
        elif args.command == "falsify-omission":
            result = falsify_omission(args.repo, args.observation, args.contract)
        elif args.command == "crown":
            observe(args.repo, args.base, args.output, args.contract)
            verified = verify(args.repo, args.output, args.contract)
            falsified = falsify_omission(args.repo, args.output, args.contract)
            result = {"verification": verified, "falsifier": falsified}
        else:  # pragma: no cover
            raise AssertionError(args.command)
    except CmdRefusal as refusal:
        print(str(refusal), file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
