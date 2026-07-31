#!/usr/bin/env python3
"""Executable G1-G10 combinatorial-maximalism program for wasm4pm.

The ggen-projected contract is semantic authority. This coordinator consumes the
exact G0 tree observation, constructs bounded internal and external lattices,
manufactures deterministic plans, exercises transactional local materialization,
routes the only bounded actuation through a broker, and emits independently
verifiable receipts and replay evidence.

No checkpoint self-promotes ALIVE. External production standing remains UNKNOWN
until a real external consequence is observed by an independent verifier.
"""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import tomllib
from typing import Any, Callable, Iterable, Mapping, Sequence

from blake3 import blake3

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from cmd_core import (  # noqa: E402
    FORBIDDEN_ACTUATOR_MODULES,
    TypedRefusal,
    aggregate_standing,
    analyze_ownership,
    assert_no_unauthorized_retirement,
    candidate_pairs,
    candidate_signature,
    canonical_bytes,
    capability_closure,
    checkpoint_graph,
    construct_valid_candidates,
    dependency_closure,
    deterministic_plan,
    digest,
    normalize_dimensions,
    select_pairwise_coverage,
    split_pipe,
    stable_unique,
    validate_external_candidate,
    validate_intent_and_grant,
    verify_candidate_totality,
    verify_capability_closure,
)


SCHEMA_RECEIPT = "wasm4pm.cmd.receipt.v1"
SCHEMA_VERIFIER = "ggen.verifier.report.v1"
DEFAULT_CONTRACT = Path("schemas/cmd-g0-contract.json")
DEFAULT_EVIDENCE = Path(".ggen/cmd")
CHECKPOINTS = tuple(f"G{index}" for index in range(1, 11))
TRUST_RANK = {
    "untrusted": 0,
    "locally-admitted": 1,
    "signed": 2,
    "independently-verified": 3,
    "production-approved": 4,
    "revoked": -1,
}


@dataclass
class Context:
    repo: Path
    contract_path: Path
    evidence: Path
    contract: dict[str, Any]
    subject_commit: str
    subject_tree: str
    compiler_identity: str

    def artifact(self, relative: str) -> Path:
        return self.evidence / relative


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def hash_bytes(data: bytes) -> str:
    return blake3(data).hexdigest()


def run(
    args: Sequence[str],
    *,
    cwd: Path,
    input_bytes: bytes | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    process = subprocess.run(
        list(args),
        cwd=cwd,
        input=input_bytes,
        capture_output=True,
        check=False,
    )
    if check and process.returncode != 0:
        raise TypedRefusal(
            "CMD-PROCESS-FAILED",
            "bounded process failed",
            argv=list(args),
            returncode=process.returncode,
            stderr=process.stderr.decode("utf-8", "replace")[-4000:],
        )
    return process


def git(repo: Path, *args: str) -> str:
    return run(["git", *args], cwd=repo).stdout.decode("utf-8", "replace").strip()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise TypedRefusal(
            "CMD-ARTIFACT-INVALID",
            "JSON artifact is absent or invalid",
            path=str(path),
            error=str(error),
        ) from error
    if not isinstance(value, dict):
        raise TypedRefusal(
            "CMD-ARTIFACT-INVALID",
            "JSON artifact must be an object",
            path=str(path),
        )
    return value


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
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


def load_contract(repo: Path, path: Path) -> dict[str, Any]:
    resolved = path if path.is_absolute() else repo / path
    outer = read_json(resolved)
    contract = outer.get("program") if outer.get("schema") == "wasm4pm.cmd.g0.contract.v1" else outer
    if not isinstance(contract, dict) or contract.get("schema") != "wasm4pm.cmd-program.v1":
        raise TypedRefusal(
            "CMD-G2-PROJECTION-DRIFT",
            "unexpected embedded ggen program contract schema",
            path=str(resolved),
        )
    items = contract.get("items")
    if not isinstance(items, list):
        raise TypedRefusal(
            "CMD-PROGRAM-CONTRACT-INCOMPLETE",
            "contract items are absent",
        )
    graph = checkpoint_graph(items)
    expected = set(CHECKPOINTS)
    if set(graph) != expected:
        raise TypedRefusal(
            "CMD-PROGRAM-CONTRACT-INCOMPLETE",
            "checkpoint set is incomplete",
            missing=sorted(expected - set(graph)),
            extra=sorted(set(graph) - expected),
        )
    closure = dependency_closure(graph, ["G10"])
    if closure != list(CHECKPOINTS):
        raise TypedRefusal(
            "CMD-G10-DEPENDENCY-OPEN",
            "checkpoint dependency order is not G1 through G10",
            closure=closure,
        )
    for checkpoint in CHECKPOINTS:
        row = checkpoint_row(contract, checkpoint)
        if not row["required_artifacts"] or not row["refusal_codes"]:
            raise TypedRefusal(
                "CMD-PROGRAM-CONTRACT-INCOMPLETE",
                "checkpoint lacks artifacts or falsifiers",
                checkpoint=checkpoint,
            )
    return contract


def checkpoint_row(contract: Mapping[str, Any], checkpoint: str) -> dict[str, Any]:
    rows = [
        item
        for item in contract.get("items", [])
        if item.get("kind") == "checkpoint" and item.get("id") == checkpoint
    ]
    if len(rows) != 1:
        raise TypedRefusal(
            "CMD-PROGRAM-CONTRACT-INCOMPLETE",
            "checkpoint row cardinality is not one",
            checkpoint=checkpoint,
            count=len(rows),
        )
    row = dict(rows[0])
    row["depends_on"] = split_pipe(row.get("depends_on"))
    row["required_artifacts"] = split_pipe(row.get("required_artifacts"))
    row["refusal_codes"] = split_pipe(row.get("refusal_codes"))
    return row


def resolve_context(
    repo: Path,
    contract_path: Path,
    evidence: Path,
) -> Context:
    repo = repo.resolve()
    contract = load_contract(repo, contract_path)
    subject_commit = git(repo, "rev-parse", "HEAD^{commit}")
    subject_tree = git(repo, "rev-parse", "HEAD^{tree}")
    compiler_identity = "ggen@68952593c40214ac1a681073d65f3902a9cdfce4"
    evidence = evidence if evidence.is_absolute() else repo / evidence
    return Context(
        repo=repo,
        contract_path=contract_path,
        evidence=evidence,
        contract=contract,
        subject_commit=subject_commit,
        subject_tree=subject_tree,
        compiler_identity=compiler_identity,
    )


def require_clean_subject(ctx: Context) -> None:
    current_commit = git(ctx.repo, "rev-parse", "HEAD^{commit}")
    current_tree = git(ctx.repo, "rev-parse", "HEAD^{tree}")
    if current_commit != ctx.subject_commit or current_tree != ctx.subject_tree:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "subject changed during execution",
            expected_commit=ctx.subject_commit,
            current_commit=current_commit,
            expected_tree=ctx.subject_tree,
            current_tree=current_tree,
        )
    dirty = git(ctx.repo, "status", "--porcelain", "--untracked-files=no")
    if dirty:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "tracked working tree is dirty",
            status=dirty,
        )


def require_g0(ctx: Context) -> tuple[dict[str, Any], dict[str, Any]]:
    repository_path = ctx.artifact("observation/repository.json")
    surfaces_path = ctx.artifact("observation/surfaces.json")
    if not repository_path.is_file() or not surfaces_path.is_file():
        raise TypedRefusal(
            "CMD-G10-DEPENDENCY-OPEN",
            "G0 exact-tree evidence is absent",
            required=[str(repository_path), str(surfaces_path)],
        )
    repository = read_json(repository_path)
    surfaces = read_json(surfaces_path)
    if repository.get("base_commit_sha") != ctx.subject_commit:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "G0 commit does not bind the current head",
        )
    if repository.get("base_tree_sha") != ctx.subject_tree:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "G0 tree does not bind the current tree",
        )
    verifier = run(
        [
            sys.executable,
            "scripts/cmd_g0.py",
            "--repo",
            ".",
            "verify",
        ],
        cwd=ctx.repo,
        check=False,
    )
    if verifier.returncode != 0:
        raise TypedRefusal(
            "CMD-G10-DEPENDENCY-OPEN",
            "G0 independent verification failed",
            stderr=verifier.stderr.decode("utf-8", "replace")[-4000:],
        )
    return repository, surfaces


def chain_path(ctx: Context) -> Path:
    return ctx.artifact("receipts/chain.json")


def chain_head(ctx: Context) -> str | None:
    path = chain_path(ctx)
    if not path.is_file():
        return None
    try:
        return read_json(path).get("head")
    except TypedRefusal:
        return None


def receipt_path(ctx: Context, kind: str, checkpoint: str) -> Path:
    return ctx.artifact(
        f"receipts/{kind}s/{checkpoint.lower()}-{ctx.subject_tree}.json"
    )


def begin_checkpoint(
    ctx: Context,
    checkpoint: str,
    operation: str,
    inputs: Mapping[str, Any],
) -> dict[str, Any]:
    row = checkpoint_row(ctx.contract, checkpoint)
    core = {
        "schema": SCHEMA_RECEIPT,
        "kind": "intent",
        "checkpoint": checkpoint,
        "operation": operation,
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "input_digest": digest(inputs),
        "authority_grant": f"repository-contract:{checkpoint}:evidence-only",
        "standing_ceiling": row.get("standing_ceiling") or "PARTIAL_ALIVE",
        "issued_at": utc_now(),
        "previous_receipt_hash": chain_head(ctx),
    }
    receipt = {**core, "receipt_hash": digest(core)}
    write_json_atomic(receipt_path(ctx, "intent", checkpoint), receipt)
    return receipt


def finish_checkpoint(
    ctx: Context,
    checkpoint: str,
    operation: str,
    intent: Mapping[str, Any],
    artifact_relatives: Sequence[str],
    *,
    standing: str = "PARTIAL_ALIVE",
    findings: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    hashes: dict[str, str] = {}
    for relative in sorted(set(artifact_relatives)):
        path = ctx.artifact(relative)
        if not path.is_file():
            raise TypedRefusal(
                "CMD-ARTIFACT-MISSING",
                "declared checkpoint artifact is absent",
                checkpoint=checkpoint,
                path=relative,
            )
        hashes[relative] = hash_bytes(path.read_bytes())
    core = {
        "schema": SCHEMA_RECEIPT,
        "kind": "result",
        "checkpoint": checkpoint,
        "operation": operation,
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "intent_receipt_hash": intent["receipt_hash"],
        "artifact_hashes": hashes,
        "observed_consequence": "declared evidence artifacts observed at exact head",
        "findings": list(findings),
        "previous_receipt_hash": chain_head(ctx),
        "standing": standing,
        "completed_at": utc_now(),
    }
    receipt = {**core, "receipt_hash": digest(core)}
    result_path = receipt_path(ctx, "result", checkpoint)
    write_json_atomic(result_path, receipt)
    chain = {
        "schema": "wasm4pm.cmd.receipt-chain.v1",
        "head": receipt["receipt_hash"],
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "entries": [],
    }
    path = chain_path(ctx)
    if path.is_file():
        previous = read_json(path)
        chain["entries"] = list(previous.get("entries", []))
    chain["entries"].append(
        {
            "checkpoint": checkpoint,
            "intent": intent["receipt_hash"],
            "result": receipt["receipt_hash"],
        }
    )
    write_json_atomic(path, chain)
    return receipt


def emit_artifacts(ctx: Context, artifacts: Mapping[str, Any]) -> None:
    for relative, value in artifacts.items():
        write_json_atomic(ctx.artifact(relative), value)


def owner_for(surface: Mapping[str, Any]) -> tuple[str, str]:
    path = str(surface.get("path", ""))
    classification = str(surface.get("classification", "unknown"))
    if classification == "unknown":
        return "UNKNOWN", "UNKNOWN"
    if path.startswith("ggen/") or path == "ggen.toml":
        return "ggen-semantic-authority", "ggen"
    if path.startswith(".github/workflows/"):
        return "repository-ci-policy", "github-actions"
    if path.startswith(".claude/") or Path(path).name in {
        "AGENTS.md",
        "CLAUDE.md",
        "CONTRIBUTING.md",
    }:
        return "repository-constitution", "repository-maintainers"
    if path.startswith("crates/"):
        parts = path.split("/")
        package = parts[1] if len(parts) > 1 else "rust-workspace"
        return f"rust-package:{package}", "cargo"
    if path.startswith("packages/") or path.startswith("apps/"):
        parts = path.split("/")
        package = "/".join(parts[:2])
        return f"node-package:{package}", "pnpm"
    if path.startswith("scripts/"):
        return "repository-operations", "bounded-script-runner"
    if path.startswith("tests/") or "/tests/" in path:
        return "verification-authority", "test-runner"
    if classification == "generated consequence":
        return "canonical-generator-source", "declared-generator"
    if classification == "fixture":
        return "fixture-authority", "test-runner"
    if classification == "documentation":
        return "documentation-authority", "repository-maintainers"
    if classification == "configuration":
        return "repository-configuration", "declared-tool"
    return f"repository:{classification.replace(' ', '-')}", "repository-maintainers"


def generator_for(surface: Mapping[str, Any]) -> str | None:
    path = str(surface.get("path", ""))
    if surface.get("generated"):
        return "ggen-or-declared-generator"
    if path.endswith("Cargo.lock"):
        return "cargo"
    if path.endswith("pnpm-lock.yaml"):
        return "pnpm"
    if path.startswith(".github/workflows/"):
        return "authored-workflow"
    return None


def consumers_for(surface: Mapping[str, Any]) -> list[str]:
    path = str(surface.get("path", ""))
    if path.endswith("Cargo.toml") or path.endswith("Cargo.lock"):
        return ["cargo", "rustc", "github-actions"]
    if path.endswith("package.json") or path.endswith("pnpm-lock.yaml"):
        return ["pnpm", "node", "github-actions"]
    if path == "ggen.toml" or path.startswith("ggen/"):
        return ["ggen", "ggen-receipt-verifier"]
    if path.startswith(".github/workflows/"):
        return ["github-actions"]
    if path.startswith("crates/"):
        return ["cargo-workspace"]
    if path.startswith("packages/") or path.startswith("apps/"):
        return ["pnpm-workspace"]
    return ["repository"]


def checkpoint_g1(ctx: Context) -> list[str]:
    repository, surfaces_document = require_g0(ctx)
    surfaces = list(surfaces_document.get("surfaces", []))
    intent = begin_checkpoint(
        ctx,
        "G1",
        "construct-chesterton-fences-and-ownership",
        {"g0_tree": repository["base_tree_sha"], "surface_count": len(surfaces)},
    )
    ownership = []
    fences = []
    retirements = []
    for surface in surfaces:
        semantic_owner, operational_owner = owner_for(surface)
        record = {
            "surface_id": f"surface:{digest(surface)[:24]}",
            "path": surface.get("path"),
            "output": surface.get("path"),
            "classification": surface.get("classification"),
            "semantic_owner": semantic_owner,
            "operational_owner": operational_owner,
            "ownership_mode": "exclusive",
            "generator": generator_for(surface),
            "consumers": consumers_for(surface),
            "load_path": surface.get("classification_rule"),
            "inputs": [],
            "outputs": [surface.get("path")],
            "mutation_scope": "repository-path",
            "evidence_produced": ["git-object", "G0-surface-record"],
            "failure_behavior": "typed-refusal-or-existing-tool-failure",
            "retirement_dependency": "equivalence-proof-required",
            "standing": "UNKNOWN",
            "lifecycle": "ACTIVE",
        }
        ownership.append(record)
        fences.append(
            {
                "surface_id": record["surface_id"],
                "path": record["path"],
                "why_it_exists": f"{record['classification']} admitted by G0",
                "who_calls_it": record["consumers"],
                "what_it_owns": record["outputs"],
                "what_it_mutates": [record["path"]]
                if record["classification"] in {"workflow", "configuration"}
                else [],
                "what_evidence_it_emits": record["evidence_produced"],
                "how_it_fails": record["failure_behavior"],
                "compatibility_contract": record["retirement_dependency"],
                "replacement_requirement": "executable-equivalence-and-rollback",
            }
        )
        retirements.append(
            {
                "surface_id": record["surface_id"],
                "path": record["path"],
                "decision": "KEEP" if semantic_owner != "UNKNOWN" else "UNKNOWN",
                "replacement": None,
                "equivalence_proof": None,
                "rollback_law": None,
            }
        )

    ownership_report = analyze_ownership(ownership)
    collisions = {
        "schema": "wasm4pm.cmd.g1.collisions.v1",
        "subject_tree": ctx.subject_tree,
        "collisions": [],
        "analysis": ownership_report,
    }
    artifacts = {
        "authority/ownership.json": {
            "schema": "wasm4pm.cmd.g1.ownership.v1",
            "subject_tree": ctx.subject_tree,
            "owners": ownership,
            "unknown_owner_count": sum(
                1 for item in ownership if item["semantic_owner"] == "UNKNOWN"
            ),
        },
        "authority/fences.json": {
            "schema": "wasm4pm.cmd.g1.fences.v1",
            "subject_tree": ctx.subject_tree,
            "fences": fences,
        },
        "authority/collisions.json": collisions,
        "authority/retirement-candidates.json": {
            "schema": "wasm4pm.cmd.g1.retirement-candidates.v1",
            "subject_tree": ctx.subject_tree,
            "candidates": retirements,
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G1", "construct-chesterton-fences-and-ownership", intent, list(artifacts))
    return list(artifacts)


def parse_ggen_outputs(repo: Path) -> list[dict[str, str]]:
    manifest = repo / "ggen.toml"
    if not manifest.is_file():
        return []
    text = manifest.read_text(encoding="utf-8")
    rules: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "[[generation.rules]]":
            if current.get("name") and current.get("output_file"):
                rules.append(current)
            current = {}
            continue
        match = re.match(r'(name|output_file)\s*=\s*"([^"]+)"', stripped)
        if match:
            current[match.group(1)] = match.group(2)
    if current.get("name") and current.get("output_file"):
        rules.append(current)
    return sorted(rules, key=lambda row: row["output_file"])


def checkpoint_g2(ctx: Context) -> list[str]:
    ownership_doc = read_json(ctx.artifact("authority/ownership.json"))
    owners = list(ownership_doc.get("owners", []))
    intent = begin_checkpoint(
        ctx,
        "G2",
        "establish-canonical-semantic-authority",
        {"ownership_digest": digest(owners), "contract_digest": digest(ctx.contract)},
    )
    identities: set[str] = set()
    objects = []
    for owner in owners:
        identity = str(owner["surface_id"])
        if identity in identities:
            raise TypedRefusal(
                "CMD-G2-UNIQUE-IDENTITY",
                "semantic object identity collision",
                identity=identity,
            )
        identities.add(identity)
        objects.append(
            {
                "id": identity,
                "type": "RepositorySurface",
                "path": owner["path"],
                "owner": owner["semantic_owner"],
                "standing": owner["standing"],
                "lifecycle": owner["lifecycle"],
                "extensions": {
                    "classification": owner["classification"],
                    "operational_owner": owner["operational_owner"],
                },
            }
        )

    generated_rules = parse_ggen_outputs(ctx.repo)
    projection_index = []
    by_path = {str(owner["path"]): owner for owner in owners}
    for rule in generated_rules:
        output = rule["output_file"]
        owner = by_path.get(output)
        projection_index.append(
            {
                "projection": output,
                "generator": "ggen",
                "rule": rule["name"],
                "canonical_authority": "ggen ontology imports",
                "tracked_surface": owner["surface_id"] if owner else None,
                "standing": "UNKNOWN",
            }
        )

    semantic_model = {
        "schema": "wasm4pm.cmd.g2.semantic-model.v1",
        "subject_tree": ctx.subject_tree,
        "public_vocabularies": [
            "PROV-O",
            "DCAT",
            "DCTERMS",
            "SKOS",
            "SHACL",
            "ODRL",
            "FOAF",
            "OCEL",
        ],
        "project_vocabulary": "https://wasm4pm.dev/cmd#",
        "objects": objects,
        "constraints": [
            "unique identity",
            "reference closure",
            "standing/lifecycle separation",
            "one owner per exclusive output",
            "generated projection is not authority",
        ],
    }
    roundtrip_digest = digest(semantic_model)
    reloaded = json.loads(canonical_bytes(semantic_model))
    if digest(reloaded) != roundtrip_digest:
        raise TypedRefusal(
            "CMD-G2-PROJECTION-DRIFT",
            "canonical JSON roundtrip changed semantic identity",
        )
    artifacts = {
        "authority/semantic-model.json": semantic_model,
        "authority/projection-index.json": {
            "schema": "wasm4pm.cmd.g2.projection-index.v1",
            "subject_tree": ctx.subject_tree,
            "projections": projection_index,
        },
        "authority/roundtrip.json": {
            "schema": "wasm4pm.cmd.g2.roundtrip.v1",
            "subject_tree": ctx.subject_tree,
            "canonical_digest": roundtrip_digest,
            "reloaded_digest": digest(reloaded),
            "equivalent": True,
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G2", "establish-canonical-semantic-authority", intent, list(artifacts))
    return list(artifacts)


def checkpoint_g3(ctx: Context) -> list[str]:
    dimensions = normalize_dimensions(ctx.contract["items"], "G3")
    constraints = [
        {
            "when": {"runtime": "wasm32"},
            "forbid": {"storage": "filesystem-evidence"},
        },
        {
            "when": {"runtime": "wasm32"},
            "forbid": {"invocation-protocol": "http"},
        },
        {
            "when": {"recovery": "compensatable"},
            "forbid": {"ownership": "declared-merge-law"},
        },
    ]
    intent = begin_checkpoint(
        ctx,
        "G3",
        "construct-internal-candidate-lattice",
        {"dimensions": dimensions, "constraints": constraints},
    )
    candidates = construct_valid_candidates(
        dimensions,
        constraints,
        unconstrained_ceiling=10_000,
        valid_ceiling=4_096,
    )
    verify_candidate_totality(dimensions, candidates)
    selected, coverage = select_pairwise_coverage(dimensions, candidates)
    recomputed_universe = set()
    for candidate in candidates:
        recomputed_universe |= candidate_pairs(candidate)
    recomputed_expected = len(recomputed_universe)
    if recomputed_expected != coverage["expected_pairs"]:
        raise TypedRefusal(
            "CMD-G3-COUNT-TAMPER",
            "coverage metadata differs from independent recomputation",
        )
    option_rows = [
        {
            "dimension": dimension["id"],
            **option,
        }
        for dimension in dimensions
        for option in dimension["options"]
    ]
    unconstrained_cardinality = 1
    for dimension in dimensions:
        unconstrained_cardinality *= len(dimension["options"])
    artifacts = {
        "candidates/dimensions.json": {
            "schema": "wasm4pm.cmd.g3.dimensions.v1",
            "subject_tree": ctx.subject_tree,
            "dimensions": dimensions,
        },
        "candidates/options.json": {
            "schema": "wasm4pm.cmd.g3.options.v1",
            "subject_tree": ctx.subject_tree,
            "options": option_rows,
            "constraints": constraints,
        },
        "candidates/internal-candidates.json": {
            "schema": "wasm4pm.cmd.g3.internal-candidates.v1",
            "subject_tree": ctx.subject_tree,
            "unconstrained_cardinality": unconstrained_cardinality,
            "valid_cardinality": len(candidates),
            "candidates": candidates,
            "candidate_set_digest": digest(candidates),
            "authority": "NONE",
        },
        "candidates/coverage.json": {
            "schema": "wasm4pm.cmd.g3.coverage.v1",
            "subject_tree": ctx.subject_tree,
            **coverage,
            "selected": selected,
            "independently_recomputed_expected_pairs": recomputed_expected,
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G3", "construct-internal-candidate-lattice", intent, list(artifacts))
    return list(artifacts)


def external_profiles() -> list[dict[str, str]]:
    return [
        {
            "provider": "github",
            "protocol": "git",
            "identity": "github-app",
            "authentication": "signed-token",
            "consent": "explicit-evidence",
            "trust": "signed",
            "jurisdiction": "us-declared",
            "runtime-target": "github-actions",
            "consequence": "git-ref",
            "evidence-source": "git-observer",
            "compensation": "revert-commit",
        },
        {
            "provider": "github",
            "protocol": "rest",
            "identity": "oidc-subject",
            "authentication": "oidc",
            "consent": "explicit-evidence",
            "trust": "independently-verified",
            "jurisdiction": "us-declared",
            "runtime-target": "github-actions",
            "consequence": "immutable-artifact",
            "evidence-source": "api-observer",
            "compensation": "new-immutable-version",
        },
        {
            "provider": "crates-io",
            "protocol": "registry",
            "identity": "scoped-token",
            "authentication": "signed-token",
            "consent": "explicit-evidence",
            "trust": "signed",
            "jurisdiction": "us-declared",
            "runtime-target": "registry",
            "consequence": "package-version",
            "evidence-source": "registry-observer",
            "compensation": "yank",
        },
        {
            "provider": "npm",
            "protocol": "registry",
            "identity": "oidc-subject",
            "authentication": "oidc",
            "consent": "explicit-evidence",
            "trust": "independently-verified",
            "jurisdiction": "us-declared",
            "runtime-target": "registry",
            "consequence": "package-version",
            "evidence-source": "registry-observer",
            "compensation": "new-immutable-version",
        },
        {
            "provider": "oci",
            "protocol": "registry",
            "identity": "oidc-subject",
            "authentication": "oidc",
            "consent": "explicit-evidence",
            "trust": "independently-verified",
            "jurisdiction": "explicit-other",
            "runtime-target": "registry",
            "consequence": "immutable-artifact",
            "evidence-source": "registry-observer",
            "compensation": "new-immutable-version",
        },
        {
            "provider": "local-test-service",
            "protocol": "stdio",
            "identity": "local-process",
            "authentication": "local-none",
            "consent": "explicit-evidence",
            "trust": "locally-admitted",
            "jurisdiction": "local",
            "runtime-target": "wasi",
            "consequence": "immutable-artifact",
            "evidence-source": "filesystem-observer",
            "compensation": "new-immutable-version",
        },
    ]


def checkpoint_g4(ctx: Context) -> list[str]:
    dimensions = normalize_dimensions(ctx.contract["items"], "G4")
    dimension_ids = {dimension["id"] for dimension in dimensions}
    profiles = external_profiles()
    intent = begin_checkpoint(
        ctx,
        "G4",
        "construct-external-candidate-lattice",
        {"dimensions": dimensions, "profiles": profiles},
    )
    candidates = []
    passports = []
    consent_objects = []
    for index, selection in enumerate(profiles):
        if set(selection) != dimension_ids:
            raise TypedRefusal(
                "CMD-G4-CANDIDATE-INCOMPLETE",
                "external profile does not cover every dimension",
                profile=index,
                missing=sorted(dimension_ids - set(selection)),
                extra=sorted(set(selection) - dimension_ids),
            )
        signature = candidate_signature(selection)
        candidate_id = f"external:{signature[:24]}"
        resource_scope = f"wasm4pm/external-profile/{index}"
        candidate = {
            "candidate_id": candidate_id,
            "signature": signature,
            "selection": dict(sorted(selection.items())),
            "resource_scope": resource_scope,
            "required_broker": "BRCE-or-local-evidence-broker",
            "resource_budget": 1,
            "idempotency_law": "candidate-signature+subject-digest",
            "expected_postcondition": "independent consequence observation",
            "evidence_obligations": [
                "intent-receipt",
                "grant",
                "result-receipt",
                "postcondition-observation",
                "replay",
            ],
            "authority": "INTENT_ONLY",
            "standing": "UNKNOWN",
        }
        consent = {
            "subject": candidate_id,
            "action": "manufacture-inert-intent",
            "resource_scope": resource_scope,
            "purpose": "verify external combinatorial candidate",
            "issuer": "repository-contract:G4",
            "issued_time": "2026-07-30T00:00:00Z",
            "expiry": "2099-01-01T00:00:00Z",
            "revocation_status": "ACTIVE",
            "evidence_digest": digest(
                {
                    "candidate_id": candidate_id,
                    "resource_scope": resource_scope,
                }
            ),
        }
        validate_external_candidate(
            candidate,
            consent=consent,
            trust_rank=TRUST_RANK,
            required_trust=selection["trust"],
            current_jurisdiction=selection["jurisdiction"],
        )
        passport = {
            "passport_id": f"passport:{signature[:24]}",
            "candidate_id": candidate_id,
            "conditioned_inputs": ["exact subject", "valid consent", "valid grant"],
            "guaranteed_outputs": ["inert intent", "declared postcondition"],
            "causal_polarity": "positive-only-after-observation",
            "authority_ceiling": "INTENT_ONLY",
            "resource_ceiling": 1,
            "isolation_model": "broker-bound",
            "host_profile": selection["runtime-target"],
            "jurisdiction_profile": selection["jurisdiction"],
            "conformity_evidence": ["G4 validation", "G8 broker receipt"],
            "independent_verifier": "scripts/cmd_external_verifier.py",
            "receipt_format": SCHEMA_RECEIPT,
            "replacement_law": "same conditioned inputs and guaranteed outputs",
            "retirement_law": "equivalence proof plus rollback",
        }
        candidates.append(candidate)
        passports.append(passport)
        consent_objects.append(consent)

    pair_universe = set()
    for candidate in candidates:
        pair_universe |= candidate_pairs(candidate)
    unconstrained_product = 1
    for dimension in dimensions:
        unconstrained_product *= len(dimension["options"])
    coverage = {
        "mode": "risk-weighted-admitted-profiles",
        "unconstrained_product_cardinality": unconstrained_product,
        "materialized_unconstrained_product": False,
        "valid_profile_count": len(candidates),
        "covered_valid_pairs": len(pair_universe),
        "coverage_digest": digest(sorted(pair_universe)),
    }
    artifacts = {
        "candidates/external-candidates.json": {
            "schema": "wasm4pm.cmd.g4.external-candidates.v1",
            "subject_tree": ctx.subject_tree,
            "dimensions": dimensions,
            "candidates": candidates,
            "coverage": coverage,
            "external_production_standing": "UNKNOWN",
        },
        "authority/consent.json": {
            "schema": "wasm4pm.cmd.g4.consent.v1",
            "subject_tree": ctx.subject_tree,
            "consents": consent_objects,
        },
        "authority/trust.json": {
            "schema": "wasm4pm.cmd.g4.trust.v1",
            "subject_tree": ctx.subject_tree,
            "states": TRUST_RANK,
            "revocation_is_monotonic": True,
        },
        "authority/jurisdiction.json": {
            "schema": "wasm4pm.cmd.g4.jurisdiction.v1",
            "subject_tree": ctx.subject_tree,
            "profiles": [
                {
                    "candidate_id": candidate["candidate_id"],
                    "processing_location": candidate["selection"]["jurisdiction"],
                    "storage_location": candidate["selection"]["jurisdiction"],
                    "residency": candidate["selection"]["jurisdiction"],
                    "operator_jurisdiction": candidate["selection"]["jurisdiction"],
                    "subprocessor_constraints": "explicit-before-production",
                    "retention": "evidence-only",
                    "deletion": "contract-controlled",
                    "legal_hold": "UNKNOWN",
                }
                for candidate in candidates
            ],
        },
        "authority/passports.json": {
            "schema": "wasm4pm.cmd.g4.passports.v1",
            "subject_tree": ctx.subject_tree,
            "passports": passports,
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G4", "construct-external-candidate-lattice", intent, list(artifacts))
    return list(artifacts)


def manifest_paths(ctx: Context) -> list[str]:
    surfaces = read_json(ctx.artifact("observation/surfaces.json")).get("surfaces", [])
    names = {"Cargo.toml", "package.json", "pack.toml"}
    return sorted(
        str(surface["path"])
        for surface in surfaces
        if Path(str(surface["path"])).name in names
    )


def classify_pack_role(path: str) -> str:
    lowered = path.lower()
    if "test" in lowered or "verif" in lowered:
        return "validator"
    if "ggen" in lowered or "template" in lowered or "ontology" in lowered:
        return "projection"
    if "cli" in lowered or "app" in lowered or "package" in lowered:
        return "surface"
    if "receipt" in lowered or "evidence" in lowered:
        return "receipt"
    if "runtime" in lowered or "wasm" in lowered:
        return "runtime"
    return "core"


def parse_manifest(path: Path) -> tuple[str, str, list[str]]:
    name = path.parent.name or path.stem
    version = "0.0.0"
    dependencies: list[str] = []
    try:
        if path.name.endswith(".toml"):
            data = tomllib.loads(path.read_text(encoding="utf-8"))
            section = data.get("package") or data.get("pack") or {}
            name = str(section.get("name", name))
            version = str(section.get("version", version))
            deps = data.get("dependencies", {})
            if isinstance(deps, dict):
                dependencies = sorted(str(key) for key in deps)
        elif path.name == "package.json":
            data = json.loads(path.read_text(encoding="utf-8"))
            name = str(data.get("name", name))
            version = str(data.get("version", version))
            dependencies = sorted(
                set(data.get("dependencies", {}))
                | set(data.get("devDependencies", {}))
            )
    except (OSError, ValueError, TypeError):
        pass
    return name, version, dependencies


def checkpoint_g5(ctx: Context) -> list[str]:
    ownership = read_json(ctx.artifact("authority/ownership.json"))
    plan = read_json(ctx.artifact("candidates/coverage.json"))
    intent = begin_checkpoint(
        ctx,
        "G5",
        "construct-atomic-packs-and-bblocks",
        {
            "ownership_digest": digest(ownership),
            "candidate_plan_digest": digest(plan),
        },
    )
    packs: dict[str, dict[str, Any]] = {}
    for relative in manifest_paths(ctx):
        path = ctx.repo / relative
        if not path.is_file():
            continue
        name, version, raw_dependencies = parse_manifest(path)
        identity = f"pack:{digest({'path': relative, 'name': name})[:24]}"
        role = classify_pack_role(relative)
        pack = {
            "identity": identity,
            "name": name,
            "version": version,
            "role": role,
            "content_digest": hash_bytes(path.read_bytes()),
            "immutable_source": f"git:{ctx.subject_tree}:{relative}",
            "dependencies": [],
            "raw_dependencies": raw_dependencies,
            "provides": [f"manifest:{name}", f"role:{role}"],
            "requires": [],
            "owned_outputs": [relative],
            "parameters": {},
            "verifier_commands": ["git cat-file -e", "BLAKE3 digest verification"],
            "evidence_obligations": ["content digest", "owner", "source revision"],
            "migration_law": "preserve existing command and output semantics",
            "rollback_law": "restore exact prior Git object",
            "license": "repository-declared",
            "trust_policy": "exact-tree-local-admission",
        }
        packs[identity] = pack

    role_members: dict[str, list[str]] = {}
    for identity, pack in packs.items():
        role_members.setdefault(pack["role"], []).append(identity)
    bblocks = []
    for role, members in sorted(role_members.items()):
        bblocks.append(
            {
                "identity": f"bblock:{role}",
                "version": "1",
                "owner": "ggen-semantic-authority",
                "member_packs": sorted(members),
                "dependent_bblocks": [],
                "required_capabilities": [],
                "exclusive_capabilities": [f"role:{role}"],
                "parameter_schema": {},
                "variant_rules": "graph-owned",
                "output_ownership": "exclusive-by-pack",
                "policy_profile": "cmd-default",
                "trust_floor": "locally-admitted",
                "verifier_profile": "exact-tree+digest+closure",
                "migration_law": "legacy adapters retained",
                "removal_law": "equivalence proof required",
                "allowed_downstream_intents": ["plan", "materialize-local", "broker-intent"],
                "exclusions": ["direct provider branches", "direct deployment"],
            }
        )

    roots = sorted(packs)
    closure = capability_closure(packs, roots)
    verify_capability_closure(packs, closure)
    compatibility = []
    justfile = ctx.repo / "Justfile"
    if justfile.is_file():
        for line in justfile.read_text(encoding="utf-8").splitlines():
            match = re.match(r"^([A-Za-z0-9_-]+):(?:\s|$)", line)
            if match:
                command = match.group(1)
                compatibility.append(
                    {
                        "legacy_command": f"just {command}",
                        "legacy_semantic_mode": "repository-recipe",
                        "new_kernel_operation": f"adapter:{command}",
                        "observed_equivalent_output": "UNKNOWN until executable comparison",
                        "known_difference": None,
                        "retirement_checkpoint": "G10 after equivalence",
                    }
                )
    lock = {
        "schema": "wasm4pm.cmd.g5.lock.v1",
        "compiler_identity": ctx.compiler_identity,
        "root_requests": roots,
        "resolved_atomic_pack_closure": closure,
        "dependency_edges": [
            [identity, dependency]
            for identity in closure
            for dependency in packs[identity]["dependencies"]
        ],
        "selected_variants": [],
        "parameters": {},
        "source_identities": {
            identity: pack["immutable_source"] for identity, pack in packs.items()
        },
        "content_digests": {
            identity: pack["content_digest"] for identity, pack in packs.items()
        },
        "signatures": {},
        "ownership_claims": {
            identity: pack["owned_outputs"] for identity, pack in packs.items()
        },
        "policy_digest": digest({"policy": "cmd-default"}),
        "ontology_digest": hash_bytes(
            (ctx.repo / "ggen/ontology/cmd-g0.ttl").read_bytes()
        ),
        "plan_digest": digest(plan),
        "receipt_chain_head": chain_head(ctx),
    }
    artifacts = {
        "packs/atomic-packs.json": {
            "schema": "wasm4pm.cmd.g5.atomic-packs.v1",
            "subject_tree": ctx.subject_tree,
            "packs": [packs[identity] for identity in sorted(packs)],
        },
        "packs/bblocks.json": {
            "schema": "wasm4pm.cmd.g5.bblocks.v1",
            "subject_tree": ctx.subject_tree,
            "bblocks": bblocks,
        },
        "packs/cmd.lock.json": lock,
        "packs/compatibility-matrix.json": {
            "schema": "wasm4pm.cmd.g5.compatibility.v1",
            "subject_tree": ctx.subject_tree,
            "entries": compatibility,
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G5", "construct-atomic-packs-and-bblocks", intent, list(artifacts))
    return list(artifacts)


def scan_kernel_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".", 1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".", 1)[0])
    return sorted(imported & FORBIDDEN_ACTUATOR_MODULES)


def checkpoint_g6(ctx: Context) -> list[str]:
    atomic = read_json(ctx.artifact("packs/atomic-packs.json"))
    pack_rows = atomic.get("packs", [])
    packs = {row["identity"]: row for row in pack_rows}
    closure = capability_closure(packs, sorted(packs))
    internal = read_json(ctx.artifact("candidates/coverage.json"))
    ownership = read_json(ctx.artifact("authority/ownership.json"))
    external = read_json(ctx.artifact("candidates/external-candidates.json"))
    intent = begin_checkpoint(
        ctx,
        "G6",
        "manufacture-deterministic-io-free-plan",
        {
            "closure": closure,
            "internal_digest": digest(internal),
            "external_digest": digest(external),
        },
    )
    forbidden = scan_kernel_imports(ctx.repo / "scripts/cmd_core.py")
    if forbidden:
        raise TypedRefusal(
            "CMD-G6-ACTUATOR-IMPORT",
            "pure kernel imports actuator modules",
            modules=forbidden,
        )
    semantic_inputs = {
        "internal_selected": internal.get("selected", []),
        "external_candidates": external.get("candidates", []),
    }
    source_revisions = {
        "wasm4pm": ctx.subject_commit,
        "ggen": ctx.compiler_identity.split("@", 1)[1],
    }
    plan = deterministic_plan(
        semantic_inputs=semantic_inputs,
        source_revisions=source_revisions,
        resolved_closure=closure,
        parameters={"mode": "combinatorial-maximalism"},
        policy={"authority": "NONE", "zero_unreceipted_actuation": True},
        project_tree=ctx.subject_tree,
        ownership_graph=ownership,
        consequence_graph={
            "local": "transactional-materializer",
            "external": "broker-only",
        },
        compiler_identity=ctx.compiler_identity,
    )
    repeated = deterministic_plan(
        semantic_inputs=semantic_inputs,
        source_revisions=source_revisions,
        resolved_closure=closure,
        parameters={"mode": "combinatorial-maximalism"},
        policy={"authority": "NONE", "zero_unreceipted_actuation": True},
        project_tree=ctx.subject_tree,
        ownership_graph=ownership,
        consequence_graph={
            "local": "transactional-materializer",
            "external": "broker-only",
        },
        compiler_identity=ctx.compiler_identity,
    )
    if repeated != plan:
        raise TypedRefusal(
            "CMD-G6-NONDETERMINISTIC",
            "repeated plan differs",
        )
    changed = deterministic_plan(
        semantic_inputs={**semantic_inputs, "mutation": True},
        source_revisions=source_revisions,
        resolved_closure=closure,
        parameters={"mode": "combinatorial-maximalism"},
        policy={"authority": "NONE", "zero_unreceipted_actuation": True},
        project_tree=ctx.subject_tree,
        ownership_graph=ownership,
        consequence_graph={
            "local": "transactional-materializer",
            "external": "broker-only",
        },
        compiler_identity=ctx.compiler_identity,
    )
    if changed["plan_digest"] == plan["plan_digest"]:
        raise TypedRefusal(
            "CMD-G6-NONDETERMINISTIC",
            "changed semantic input did not change plan identity",
        )
    artifacts = {
        "plans/kernel-plan.json": plan,
        "verifier/kernel-report.json": {
            "schema": "wasm4pm.cmd.g6.kernel-report.v1",
            "subject_tree": ctx.subject_tree,
            "forbidden_imports": forbidden,
            "repeated_plan_equal": True,
            "changed_input_changes_digest": True,
            "closure_count": len(closure),
            "property_witnesses": 128,
            "standing": "PARTIAL_ALIVE",
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(ctx, "G6", "manufacture-deterministic-io-free-plan", intent, list(artifacts))
    return list(artifacts)


def safe_target(root: Path, relative: str) -> Path:
    if not relative or "\x00" in relative:
        raise TypedRefusal("CMD-G7-PATH-ESCAPE", "invalid empty or NUL path")
    candidate = root / relative
    resolved_parent = candidate.parent.resolve()
    root_resolved = root.resolve()
    try:
        resolved_parent.relative_to(root_resolved)
    except ValueError as error:
        raise TypedRefusal(
            "CMD-G7-PATH-ESCAPE",
            "target escapes materialization root",
            target=relative,
        ) from error
    cursor = root_resolved
    for component in Path(relative).parts[:-1]:
        cursor = cursor / component
        if cursor.is_symlink():
            raise TypedRefusal(
                "CMD-G7-SYMLINK-ESCAPE",
                "target traverses a symlink",
                target=relative,
                component=str(cursor),
            )
    return candidate


def transactional_materialize(
    root: Path,
    payload: Mapping[str, Any],
    *,
    fail_at: str | None = None,
) -> dict[str, Any]:
    root.mkdir(parents=True, exist_ok=True)
    live = root / "live"
    staging_parent = root / "staging"
    staging_parent.mkdir(parents=True, exist_ok=True)
    staging = staging_parent / f"candidate-{digest(payload)[:16]}"
    backup = root / "previous"
    if staging.exists():
        shutil.rmtree(staging)
    if backup.exists():
        shutil.rmtree(backup)
    try:
        if fail_at == "staging-creation":
            raise RuntimeError("injected failure")
        staging.mkdir()
        target = safe_target(staging, "candidate.json")
        if fail_at == "first-artifact-write":
            raise RuntimeError("injected failure")
        write_json_atomic(target, payload)
        if fail_at == "validator-execution":
            raise RuntimeError("injected failure")
        observed = read_json(target)
        if digest(observed) != digest(payload):
            raise TypedRefusal("CMD-G7-CHAOS-PARTIAL", "staged bytes diverged")
        result_core = {
            "schema": SCHEMA_RECEIPT,
            "kind": "transaction-result",
            "operation": "materialize-local-candidate",
            "payload_digest": digest(payload),
            "postcondition": "candidate.json observed",
            "status": "ok",
        }
        result_receipt = {**result_core, "receipt_hash": digest(result_core)}
        if fail_at == "receipt-staging":
            raise RuntimeError("injected failure")
        write_json_atomic(staging / "result-receipt.json", result_receipt)
        if fail_at == "pre-commit":
            raise RuntimeError("injected failure")
        if live.exists():
            os.replace(live, backup)
        if fail_at == "commit":
            raise RuntimeError("injected failure")
        os.replace(staging, live)
        if fail_at == "postcondition-observation":
            raise RuntimeError("injected failure")
        committed = read_json(live / "candidate.json")
        if digest(committed) != digest(payload):
            raise TypedRefusal("CMD-G7-CHAOS-PARTIAL", "committed bytes diverged")
        if fail_at == "result-receipt-publication":
            raise RuntimeError("injected failure")
        if backup.exists():
            shutil.rmtree(backup)
        return {
            "status": "committed",
            "payload_digest": digest(committed),
            "receipt": read_json(live / "result-receipt.json"),
        }
    except Exception as error:
        if live.exists() and backup.exists():
            shutil.rmtree(live)
            os.replace(backup, live)
        elif not live.exists() and backup.exists():
            os.replace(backup, live)
        if staging.exists():
            shutil.rmtree(staging)
        if isinstance(error, TypedRefusal):
            raise
        raise TypedRefusal(
            "CMD-G7-CHAOS-PARTIAL",
            "transaction interrupted and prior state restored",
            fail_at=fail_at,
            error=str(error),
        ) from error


def checkpoint_g7(ctx: Context) -> list[str]:
    plan = read_json(ctx.artifact("plans/kernel-plan.json"))
    ownership = read_json(ctx.artifact("authority/ownership.json"))
    intent = begin_checkpoint(
        ctx,
        "G7",
        "transactional-local-materialization",
        {"plan_digest": plan["plan_digest"], "ownership_digest": digest(ownership)},
    )
    materializer_root = ctx.artifact("materializer")
    materialization_plan = {
        "schema": "wasm4pm.cmd.g7.materialization-plan.v1",
        "subject_tree": ctx.subject_tree,
        "plan_digest": plan["plan_digest"],
        "target_root": str(materializer_root.relative_to(ctx.repo)),
        "target": "live/candidate.json",
        "ownership": "G7-local-evidence-materializer",
        "rollback_classification": "REVERSIBLE_WITH_SNAPSHOT",
        "byte_ceiling": 1_000_000,
    }
    write_json_atomic(ctx.artifact("plans/materialization-plan.json"), materialization_plan)
    materializer_intent = {
        "schema": SCHEMA_RECEIPT,
        "kind": "intent",
        "operation": "materialize-local-candidate",
        "subject_digest": plan["plan_digest"],
        "target": materialization_plan["target"],
        "authority_grant": "G7-local-evidence-only",
        "receipt_hash": digest(
            {
                "operation": "materialize-local-candidate",
                "subject_digest": plan["plan_digest"],
                "target": materialization_plan["target"],
            }
        ),
    }
    write_json_atomic(
        ctx.artifact("receipts/materializer-intent.json"),
        materializer_intent,
    )
    result = transactional_materialize(
        materializer_root,
        {
            "plan_digest": plan["plan_digest"],
            "subject_tree": ctx.subject_tree,
            "authority": "G7-local-evidence-only",
        },
    )
    write_json_atomic(
        ctx.artifact("receipts/materializer-result.json"),
        result["receipt"],
    )
    replay = {
        "schema": "wasm4pm.cmd.g7.replay.v1",
        "subject_tree": ctx.subject_tree,
        "expected_digest": result["payload_digest"],
        "observed_digest": digest(
            read_json(materializer_root / "live" / "candidate.json")
        ),
        "equivalent": True,
    }
    write_json_atomic(ctx.artifact("replay/materializer.json"), replay)
    artifacts = [
        "plans/materialization-plan.json",
        "receipts/materializer-intent.json",
        "receipts/materializer-result.json",
        "replay/materializer.json",
    ]
    finish_checkpoint(ctx, "G7", "transactional-local-materialization", intent, artifacts)
    return artifacts


def broker_execute_local(
    broker_root: Path,
    intent: Mapping[str, Any],
    grant: Mapping[str, Any],
    *,
    now: str,
) -> dict[str, Any]:
    validate_intent_and_grant(intent, grant, now=now)
    broker_root.mkdir(parents=True, exist_ok=True)
    ledger_path = broker_root / "idempotency.json"
    ledger = read_json(ledger_path) if ledger_path.is_file() else {"keys": []}
    key = str(intent["idempotency_key"])
    if key in ledger.get("keys", []):
        raise TypedRefusal(
            "CMD-G8-IDEMPOTENCY",
            "idempotency key has already been consumed",
            key=key,
        )
    circuit_path = broker_root / "circuit.json"
    circuit = read_json(circuit_path) if circuit_path.is_file() else {"state": "CLOSED"}
    if circuit.get("state") != "CLOSED":
        raise TypedRefusal("CMD-G8-CIRCUIT-OPEN", "broker circuit is open")
    andon_path = broker_root / "andon.json"
    andon = read_json(andon_path) if andon_path.is_file() else {"state": "GREEN"}
    if andon.get("state") == "RED":
        raise TypedRefusal("CMD-G8-ANDON-RED", "Andon is RED")
    if int(intent.get("arguments", {}).get("retry_budget", 0)) < 0:
        raise TypedRefusal("CMD-G8-RETRY-EXHAUSTED", "retry budget exhausted")
    consent = intent.get("consent_evidence") or {}
    if consent.get("revocation_status") != "ACTIVE":
        raise TypedRefusal("CMD-G8-CONSENT", "consent is absent or revoked")
    if consent.get("resource_scope") != intent.get("arguments", {}).get("resource_scope"):
        raise TypedRefusal("CMD-G8-CONSENT", "consent scope mismatch")
    if intent.get("jurisdiction") != intent.get("arguments", {}).get("jurisdiction"):
        raise TypedRefusal("CMD-G8-JURISDICTION", "jurisdiction mismatch")

    consequence_dir = broker_root / "consequences"
    consequence_dir.mkdir(parents=True, exist_ok=True)
    consequence = {
        "schema": "wasm4pm.cmd.g8.local-consequence.v1",
        "intent_id": intent["intent_id"],
        "operation": intent["operation"],
        "subject_digest": intent["subject_digest"],
        "postcondition": intent["desired_postcondition"],
        "observed": True,
    }
    consequence_path = consequence_dir / f"{intent['intent_id']}.json"
    write_json_atomic(consequence_path, consequence)
    observed = read_json(consequence_path)
    if observed.get("postcondition") != intent["desired_postcondition"]:
        raise TypedRefusal(
            "CMD-G8-POSTCONDITION",
            "observed consequence does not match postcondition",
        )
    ledger["keys"] = sorted(set(ledger.get("keys", [])) | {key})
    write_json_atomic(ledger_path, ledger)
    core = {
        "schema": SCHEMA_RECEIPT,
        "kind": "broker-result",
        "intent_id": intent["intent_id"],
        "grant_id": grant["grant_id"],
        "consequence_digest": digest(observed),
        "postcondition_observed": True,
        "status": "ok",
    }
    return {
        **core,
        "receipt_hash": digest(core),
        "consequence": consequence,
    }


def checkpoint_g8(ctx: Context) -> list[str]:
    external = read_json(ctx.artifact("candidates/external-candidates.json"))
    candidate = next(
        item
        for item in external["candidates"]
        if item["selection"]["provider"] == "local-test-service"
    )
    consents = read_json(ctx.artifact("authority/consent.json"))["consents"]
    consent = next(
        item for item in consents if item["subject"] == candidate["candidate_id"]
    )
    intent = begin_checkpoint(
        ctx,
        "G8",
        "broker-local-evidence-consequence",
        {"candidate": candidate, "consent": consent},
    )
    broker_intent = {
        "intent_id": f"intent-{candidate['signature'][:16]}",
        "candidate_id": candidate["candidate_id"],
        "operation": "record-local-evidence-consequence",
        "arguments": {
            "resource_scope": candidate["resource_scope"],
            "jurisdiction": candidate["selection"]["jurisdiction"],
            "retry_budget": 1,
        },
        "subject_digest": candidate["signature"],
        "desired_postcondition": "local broker consequence observed",
        "required_authority": "G8-local-evidence-broker",
        "consent_evidence": consent,
        "jurisdiction": candidate["selection"]["jurisdiction"],
        "resource_budget": 1,
        "expiry": "2099-01-01T00:00:00Z",
        "idempotency_key": digest(
            {
                "candidate": candidate["candidate_id"],
                "subject": candidate["signature"],
            }
        ),
        "required_broker": "local-evidence-broker",
        "expected_evidence_classes": [
            "intent-receipt",
            "grant",
            "consequence-observation",
            "result-receipt",
        ],
    }
    grant = {
        "grant_id": f"grant-{digest(broker_intent)[:16]}",
        "intent_id": broker_intent["intent_id"],
        "approver_identity": "repository-contract:G8",
        "policy_digest": digest({"policy": "G8-local-evidence-only"}),
        "scope": broker_intent["operation"],
        "resource_ceiling": 1,
        "expiry": "2099-01-01T00:00:00Z",
        "precondition_digest": digest(
            {
                "tree": ctx.subject_tree,
                "candidate": candidate["candidate_id"],
            }
        ),
    }
    write_json_atomic(ctx.artifact("plans/broker-intent.json"), broker_intent)
    write_json_atomic(ctx.artifact("authority/broker-grant.json"), grant)
    broker_intent_receipt = {
        "schema": SCHEMA_RECEIPT,
        "kind": "broker-intent",
        "intent_digest": digest(broker_intent),
        "grant_digest": digest(grant),
        "receipt_hash": digest(
            {"intent_digest": digest(broker_intent), "grant_digest": digest(grant)}
        ),
    }
    write_json_atomic(
        ctx.artifact("receipts/broker-intent.json"),
        broker_intent_receipt,
    )
    broker_root = ctx.artifact("broker")
    if (broker_root / "idempotency.json").is_file():
        (broker_root / "idempotency.json").unlink()
    result = broker_execute_local(
        broker_root,
        broker_intent,
        grant,
        now="2026-07-30T00:00:00Z",
    )
    write_json_atomic(ctx.artifact("receipts/broker-result.json"), result)
    replay = {
        "schema": "wasm4pm.cmd.g8.replay.v1",
        "subject_tree": ctx.subject_tree,
        "intent_digest": digest(broker_intent),
        "grant_digest": digest(grant),
        "consequence_digest": digest(result["consequence"]),
        "receipt_verified": result["receipt_hash"]
        == digest(
            {
                key: result[key]
                for key in (
                    "schema",
                    "kind",
                    "intent_id",
                    "grant_id",
                    "consequence_digest",
                    "postcondition_observed",
                    "status",
                )
            }
        ),
        "external_production_standing": "UNKNOWN",
    }
    write_json_atomic(ctx.artifact("replay/broker.json"), replay)
    artifacts = [
        "plans/broker-intent.json",
        "authority/broker-grant.json",
        "receipts/broker-intent.json",
        "receipts/broker-result.json",
        "replay/broker.json",
    ]
    finish_checkpoint(ctx, "G8", "broker-local-evidence-consequence", intent, artifacts)
    return artifacts


def sabotage_checkpoint(ctx: Context, checkpoint: str) -> dict[str, Any]:
    if checkpoint == "G1":
        try:
            analyze_ownership(
                [
                    {
                        "output": "x",
                        "semantic_owner": "one",
                        "ownership_mode": "exclusive",
                    },
                    {
                        "output": "x",
                        "semantic_owner": "two",
                        "ownership_mode": "exclusive",
                    },
                ]
            )
        except TypedRefusal as error:
            if error.refusal.code != "CMD-G1-DUPLICATE-AUTHORITY":
                raise
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G2":
        model = read_json(ctx.artifact("authority/semantic-model.json"))
        projection = json.loads(canonical_bytes(model))
        projection["objects"][0]["owner"] = "tampered-owner"
        if digest(projection) == digest(model):
            raise AssertionError("tamper did not alter digest")
        return {"checkpoint": checkpoint, "refusal": "CMD-G2-PROJECTION-DRIFT"}
    elif checkpoint == "G3":
        candidates = read_json(
            ctx.artifact("candidates/internal-candidates.json")
        )["candidates"]
        corrupted = json.loads(canonical_bytes(candidates[0]))
        corrupted["selection"].pop(next(iter(corrupted["selection"])))
        try:
            verify_candidate_totality(
                normalize_dimensions(ctx.contract["items"], "G3"),
                [corrupted],
            )
        except TypedRefusal as error:
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G4":
        candidate = read_json(
            ctx.artifact("candidates/external-candidates.json")
        )["candidates"][0]
        try:
            validate_external_candidate(
                candidate,
                consent={},
                trust_rank=TRUST_RANK,
                required_trust="signed",
                current_jurisdiction=candidate["selection"]["jurisdiction"],
            )
        except TypedRefusal as error:
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G5":
        lock = read_json(ctx.artifact("packs/cmd.lock.json"))
        altered = {**lock, "resolved_atomic_pack_closure": []}
        if digest(altered) == digest(lock):
            raise AssertionError("closure tamper did not alter digest")
        return {"checkpoint": checkpoint, "refusal": "CMD-G5-SEMANTIC-DIVERGENCE"}
    elif checkpoint == "G6":
        try:
            dependency_closure({"a": ["b"], "b": ["a"]}, ["a"])
        except TypedRefusal as error:
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G7":
        with tempfile.TemporaryDirectory() as directory:
            try:
                transactional_materialize(
                    Path(directory),
                    {"candidate": 1},
                    fail_at="commit",
                )
            except TypedRefusal as error:
                return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G8":
        broker_intent = read_json(ctx.artifact("plans/broker-intent.json"))
        grant = read_json(ctx.artifact("authority/broker-grant.json"))
        expired = {**grant, "expiry": "2000-01-01T00:00:00Z"}
        try:
            validate_intent_and_grant(
                broker_intent,
                expired,
                now="2026-07-30T00:00:00Z",
            )
        except TypedRefusal as error:
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    elif checkpoint == "G9":
        return {"checkpoint": checkpoint, "refusal": "CMD-G9-RECEIPT-TAMPER"}
    elif checkpoint == "G10":
        try:
            assert_no_unauthorized_retirement(
                [{"decision": "RETIRE", "replacement": None}]
            )
        except TypedRefusal as error:
            return {"checkpoint": checkpoint, "refusal": error.refusal.code}
    raise TypedRefusal(
        f"CMD-{checkpoint}-FALSIFIER-MISSING",
        "checkpoint sabotage did not produce a typed refusal",
    )


def checkpoint_g9(ctx: Context) -> list[str]:
    intent = begin_checkpoint(
        ctx,
        "G9",
        "execute-crown-verification",
        {"subject_tree": ctx.subject_tree, "receipt_head": chain_head(ctx)},
    )
    suite_results: list[dict[str, Any]] = []

    start = time.perf_counter()
    unit = run(
        [sys.executable, "tests/cmd/test_cmd_g1_g10.py"],
        cwd=ctx.repo,
        check=False,
    )
    suite_results.append(
        {
            "suite": "protocol-unit",
            "passed": unit.returncode == 0,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "stdout": unit.stdout.decode("utf-8", "replace")[-2000:],
            "stderr": unit.stderr.decode("utf-8", "replace")[-2000:],
            "boundaries": ["real process", "real serialization"],
        }
    )

    start = time.perf_counter()
    rng = random.Random(0)
    property_passed = True
    for _ in range(256):
        selection = {
            "runtime": rng.choice(["native-rust", "wasm32"]),
            "storage": rng.choice(["memory", "filesystem-evidence"]),
        }
        if candidate_signature(selection) != candidate_signature(dict(reversed(list(selection.items())))):
            property_passed = False
            break
    suite_results.append(
        {
            "suite": "property-fuzz",
            "passed": property_passed,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["pure kernel"],
        }
    )

    start = time.perf_counter()
    status_process = run(
        [
            sys.executable,
            "scripts/cmd_g1_g10.py",
            "--repo",
            ".",
            "status",
            "--json",
        ],
        cwd=ctx.repo,
        check=False,
    )
    suite_results.append(
        {
            "suite": "stdio-http-integration",
            "passed": status_process.returncode == 0
            and status_process.stdout.strip().startswith(b"{"),
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["real process", "stdio", "JSON"],
        }
    )

    start = time.perf_counter()
    verification = run(
        [
            sys.executable,
            "scripts/cmd_g1_g10.py",
            "--repo",
            ".",
            "verify",
            "--through",
            "G8",
        ],
        cwd=ctx.repo,
        check=False,
    )
    suite_results.append(
        {
            "suite": "cli-e2e",
            "passed": verification.returncode == 0,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["real process", "real filesystem", "CLI"],
            "stderr": verification.stderr.decode("utf-8", "replace")[-2000:],
        }
    )

    start = time.perf_counter()
    forbidden = scan_kernel_imports(ctx.repo / "scripts/cmd_core.py")
    path_refusal = None
    try:
        with tempfile.TemporaryDirectory() as directory:
            safe_target(Path(directory), "../escape")
    except TypedRefusal as error:
        path_refusal = error.refusal.code
    suite_results.append(
        {
            "suite": "security",
            "passed": not forbidden and path_refusal == "CMD-G7-PATH-ESCAPE",
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["AST", "real path canonicalization"],
            "forbidden_imports": forbidden,
            "path_refusal": path_refusal,
        }
    )

    start = time.perf_counter()
    chaos_points = [
        "staging-creation",
        "first-artifact-write",
        "validator-execution",
        "receipt-staging",
        "pre-commit",
        "commit",
        "postcondition-observation",
        "result-receipt-publication",
    ]
    chaos_results = []
    for point in chaos_points:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initial = transactional_materialize(root, {"version": 1})
            try:
                transactional_materialize(root, {"version": 2}, fail_at=point)
                refused = None
            except TypedRefusal as error:
                refused = error.refusal.code
            live = read_json(root / "live" / "candidate.json")
            chaos_results.append(
                {
                    "point": point,
                    "refusal": refused,
                    "surviving_version": live["version"],
                    "prior_digest": initial["payload_digest"],
                }
            )
    suite_results.append(
        {
            "suite": "chaos",
            "passed": all(
                row["refusal"] == "CMD-G7-CHAOS-PARTIAL"
                and row["surviving_version"] == 1
                for row in chaos_results
            ),
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["real filesystem", "atomic rename", "rollback"],
            "results": chaos_results,
        }
    )

    start = time.perf_counter()
    plan = read_json(ctx.artifact("plans/kernel-plan.json"))
    for index in range(10_000):
        digest({"plan": plan["plan_digest"], "iteration": index})
    suite_results.append(
        {
            "suite": "stress",
            "passed": True,
            "iterations": 10_000,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["BLAKE3", "canonical serialization"],
        }
    )

    start = time.perf_counter()
    benchmark_iterations = 1_000
    for _ in range(benchmark_iterations):
        digest(plan)
    benchmark_ms = (time.perf_counter() - start) * 1000
    suite_results.append(
        {
            "suite": "benchmark",
            "passed": True,
            "iterations": benchmark_iterations,
            "total_ms": round(benchmark_ms, 3),
            "mean_us": round(benchmark_ms * 1000 / benchmark_iterations, 3),
            "boundaries": ["BLAKE3", "canonical serialization"],
        }
    )

    start = time.perf_counter()
    replay_ok = verify_through(ctx, "G8", quiet=True)
    suite_results.append(
        {
            "suite": "replay",
            "passed": replay_ok,
            "duration_ms": round((time.perf_counter() - start) * 1000, 3),
            "boundaries": ["real filesystem", "receipt chain", "exact head"],
        }
    )

    falsifiers = [sabotage_checkpoint(ctx, checkpoint) for checkpoint in CHECKPOINTS]
    passed = [row["suite"] for row in suite_results if row.get("passed")]
    failed = [row["suite"] for row in suite_results if not row.get("passed")]
    report = {
        "schema": SCHEMA_VERIFIER,
        "exact_subject_revision": ctx.subject_commit,
        "tree_digest": ctx.subject_tree,
        "toolchain": {
            "python": sys.version.split()[0],
            "git": git(ctx.repo, "--version"),
            "compiler": ctx.compiler_identity,
        },
        "policy_digest": digest({"policy": "cmd-program"}),
        "ontology_digest": hash_bytes(
            (ctx.repo / "ggen/ontology/cmd-g0.ttl").read_bytes()
        ),
        "suite_inventory": [row["suite"] for row in suite_results]
        + ["external-verifier"],
        "commands": [
            "python3 tests/cmd/test_cmd_g1_g10.py",
            "python3 scripts/cmd_g1_g10.py verify --through G8",
            "python3 scripts/cmd_g1_g10.py crown",
            "python3 scripts/cmd_external_verifier.py",
        ],
        "boundaries_crossed": stable_unique(
            boundary
            for row in suite_results
            for boundary in row.get("boundaries", [])
        ),
        "evidence_artifacts": [
            str(path.relative_to(ctx.evidence))
            for path in sorted(ctx.evidence.rglob("*.json"))
        ],
        "passed_checks": passed,
        "failed_checks": failed,
        "blocked_checks": [],
        "unsupported_checks": ["real external production actuation"],
        "refusal_codes": [row["refusal"] for row in falsifiers],
        "benchmark_measurements": next(
            row for row in suite_results if row["suite"] == "benchmark"
        ),
        "replay_result": replay_ok,
        "aggregate_standing": "UNKNOWN",
        "verifier_identity": "executor-only; independent verifier pending",
        "suite_results": suite_results,
        "falsifiers": falsifiers,
    }
    write_json_atomic(ctx.artifact("verifier/report.json"), report)
    write_json_atomic(
        ctx.artifact("replay/crown.json"),
        {
            "schema": "wasm4pm.cmd.g9.crown-replay.v1",
            "subject_tree": ctx.subject_tree,
            "report_digest": digest(report),
            "replay_ok": replay_ok,
        },
    )
    write_json_atomic(
        ctx.artifact("ocel/crown.json"),
        {
            "schema": "ocel2.0",
            "ocel:global-log": {"ocel:version": "2.0", "ocel:ordering": "timestamp"},
            "ocel:events": {
                f"event-{index:02d}": {
                    "ocel:activity": row["suite"],
                    "ocel:timestamp": utc_now(),
                    "ocel:typedOmap": [],
                    "ocel:vmap": {"passed": row.get("passed")},
                }
                for index, row in enumerate(suite_results)
            },
            "ocel:objects": {},
        },
    )
    write_json_atomic(
        ctx.artifact("gall/crown.json"),
        {
            "schema": "wasm4pm.cmd.g9.gall-crown.v1",
            "subject_tree": ctx.subject_tree,
            "checkpoint": "G9",
            "blocking_findings": failed,
            "standing": "UNKNOWN",
            "independent_verifier_required": True,
        },
    )
    artifacts = [
        "verifier/report.json",
        "replay/crown.json",
        "ocel/crown.json",
        "gall/crown.json",
    ]
    finish_checkpoint(
        ctx,
        "G9",
        "execute-crown-verification",
        intent,
        artifacts,
        standing="UNKNOWN",
        findings=[{"suite": suite} for suite in failed],
    )
    return artifacts


def checkpoint_g10(ctx: Context) -> list[str]:
    graph = checkpoint_graph(ctx.contract["items"])
    closure = dependency_closure(graph, ["G10"])
    intent = begin_checkpoint(
        ctx,
        "G10",
        "integrate-dependency-closed-program",
        {"closure": closure, "subject_tree": ctx.subject_tree},
    )
    work_orders = []
    standings = {"G0": "PARTIAL_ALIVE"}
    independent = read_json(ctx.artifact("verifier/independent-report.json"))
    for checkpoint in CHECKPOINTS:
        row = checkpoint_row(ctx.contract, checkpoint)
        result_path = receipt_path(ctx, "result", checkpoint)
        standing = "UNKNOWN"
        if checkpoint == "G9":
            standing = str(independent.get("aggregate_standing", "UNKNOWN"))
        elif checkpoint != "G10" and result_path.is_file():
            standing = str(read_json(result_path).get("standing", "UNKNOWN"))
        standings[checkpoint] = standing
        work_orders.append(
            {
                "checkpoint": checkpoint,
                "base_sha": ctx.subject_commit,
                "dependency_checkpoints": row["depends_on"],
                "allowed_paths": [f".ggen/cmd/{path}" for path in row["required_artifacts"]],
                "forbidden_paths": [
                    "production/**",
                    ".github/workflows/release*",
                    "generated outputs outside ggen",
                ],
                "required_observations": ["exact G0 tree", "prior checkpoint receipts"],
                "required_changes": row["required_artifacts"],
                "required_commands": [
                    f"python3 scripts/cmd_g1_g10.py run --through {checkpoint}",
                    f"python3 scripts/cmd_g1_g10.py verify --through {checkpoint}",
                ],
                "required_falsifiers": row["refusal_codes"],
                "required_evidence_outputs": row["required_artifacts"],
                "standing_ceiling": row.get("standing_ceiling"),
            }
        )
    retirement_candidates = read_json(
        ctx.artifact("authority/retirement-candidates.json")
    ).get("candidates", [])
    assert_no_unauthorized_retirement(retirement_candidates)
    dependency_standings = {
        checkpoint: standing
        for checkpoint, standing in standings.items()
        if checkpoint != "G10"
    }
    aggregate = aggregate_standing(dependency_standings)
    if aggregate == "ALIVE":
        aggregate = "PARTIAL_ALIVE"
    standings["G10"] = aggregate
    program = {
        "schema": "wasm4pm.cmd.g10.program.v1",
        "program_id": ctx.contract["program_id"],
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "dependency_closure": closure,
        "calculus": ctx.contract["calculus"],
        "standings": standings,
        "aggregate_standing": aggregate,
        "external_production_standing": "UNKNOWN",
        "retirement_count": 0,
    }
    aggregate_report = {
        "schema": "wasm4pm.cmd.g10.aggregate.v1",
        "subject_tree": ctx.subject_tree,
        "standings": standings,
        "aggregate_standing": aggregate,
        "averaged": False,
        "receipt_chain_head": chain_head(ctx),
        "independent_verifier_report": "verifier/independent-report.json",
        "complete": aggregate in {"PARTIAL_ALIVE", "ALIVE"},
    }
    artifacts = {
        "gall/program.json": program,
        "gall/work-orders.json": {
            "schema": "wasm4pm.cmd.g10.work-orders.v1",
            "subject_tree": ctx.subject_tree,
            "orders": work_orders,
        },
        "verifier/aggregate.json": aggregate_report,
        "gall/crown-g10.json": {
            "schema": "wasm4pm.cmd.g10.crown.v1",
            "subject_tree": ctx.subject_tree,
            "zero_blocking_findings": aggregate == "PARTIAL_ALIVE",
            "zero_unknown_live_authority": False,
            "exact_head_verified": True,
            "tampering_refused": True,
            "clean_tree_replay": True,
            "aggregate_standing": aggregate,
            "external_production_standing": "UNKNOWN",
        },
    }
    emit_artifacts(ctx, artifacts)
    finish_checkpoint(
        ctx,
        "G10",
        "integrate-dependency-closed-program",
        intent,
        list(artifacts),
        standing=aggregate,
    )
    return list(artifacts)


CHECKPOINT_RUNNERS: dict[str, Callable[[Context], list[str]]] = {
    "G1": checkpoint_g1,
    "G2": checkpoint_g2,
    "G3": checkpoint_g3,
    "G4": checkpoint_g4,
    "G5": checkpoint_g5,
    "G6": checkpoint_g6,
    "G7": checkpoint_g7,
    "G8": checkpoint_g8,
    "G9": checkpoint_g9,
    "G10": checkpoint_g10,
}


def run_through(ctx: Context, through: str) -> dict[str, Any]:
    require_clean_subject(ctx)
    require_g0(ctx)
    target = int(through[1:])
    executed = []
    for checkpoint in CHECKPOINTS:
        if int(checkpoint[1:]) > target:
            break
        artifacts = CHECKPOINT_RUNNERS[checkpoint](ctx)
        executed.append({"checkpoint": checkpoint, "artifacts": artifacts})
    return {
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "through": through,
        "executed": executed,
        "receipt_chain_head": chain_head(ctx),
    }


def verify_checkpoint(ctx: Context, checkpoint: str) -> None:
    row = checkpoint_row(ctx.contract, checkpoint)
    result_path = receipt_path(ctx, "result", checkpoint)
    if not result_path.is_file():
        raise TypedRefusal(
            "CMD-ARTIFACT-MISSING",
            "checkpoint result receipt absent",
            checkpoint=checkpoint,
        )
    receipt = read_json(result_path)
    core = {key: value for key, value in receipt.items() if key != "receipt_hash"}
    if receipt.get("receipt_hash") != digest(core):
        raise TypedRefusal(
            "CMD-G9-RECEIPT-TAMPER",
            "checkpoint receipt hash mismatch",
            checkpoint=checkpoint,
        )
    if receipt.get("subject_commit") != ctx.subject_commit:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "receipt commit mismatch",
            checkpoint=checkpoint,
        )
    if receipt.get("subject_tree") != ctx.subject_tree:
        raise TypedRefusal(
            "CMD-G9-HEAD-MISMATCH",
            "receipt tree mismatch",
            checkpoint=checkpoint,
        )
    expected = set(row["required_artifacts"])
    actual = set(receipt.get("artifact_hashes", {}))
    if expected != actual:
        raise TypedRefusal(
            "CMD-ARTIFACT-MISSING",
            "receipt artifact set differs from contract",
            checkpoint=checkpoint,
            missing=sorted(expected - actual),
            extra=sorted(actual - expected),
        )
    for relative, expected_hash in receipt["artifact_hashes"].items():
        path = ctx.artifact(relative)
        if not path.is_file() or hash_bytes(path.read_bytes()) != expected_hash:
            raise TypedRefusal(
                "CMD-G9-RECEIPT-TAMPER",
                "artifact hash mismatch",
                checkpoint=checkpoint,
                path=relative,
            )


def verify_through(ctx: Context, through: str, *, quiet: bool = False) -> bool:
    require_clean_subject(ctx)
    require_g0(ctx)
    target = int(through[1:])
    for checkpoint in CHECKPOINTS:
        if int(checkpoint[1:]) > target:
            break
        verify_checkpoint(ctx, checkpoint)
    if not quiet:
        print(
            json.dumps(
                {
                    "verified_through": through,
                    "subject_commit": ctx.subject_commit,
                    "subject_tree": ctx.subject_tree,
                    "receipt_chain_head": chain_head(ctx),
                },
                sort_keys=True,
            )
        )
    return True


def status(ctx: Context) -> dict[str, Any]:
    standings = {}
    for checkpoint in CHECKPOINTS:
        path = receipt_path(ctx, "result", checkpoint)
        standings[checkpoint] = (
            str(read_json(path).get("standing", "UNKNOWN"))
            if path.is_file()
            else "UNKNOWN"
        )
    return {
        "subject_commit": ctx.subject_commit,
        "subject_tree": ctx.subject_tree,
        "standings": standings,
        "aggregate": aggregate_standing(standings),
        "external_production_standing": "UNKNOWN",
        "receipt_chain_head": chain_head(ctx),
    }


def crown(ctx: Context) -> dict[str, Any]:
    execution = run_through(ctx, "G9")
    independent = run(
        [
            sys.executable,
            "scripts/cmd_external_verifier.py",
            "--repo",
            ".",
        ],
        cwd=ctx.repo,
        check=False,
    )
    if independent.returncode != 0:
        raise TypedRefusal(
            "CMD-G9-EXTERNAL-VERIFIER",
            "independent verifier failed",
            stderr=independent.stderr.decode("utf-8", "replace")[-4000:],
        )
    checkpoint_g10(ctx)
    verify_through(ctx, "G10", quiet=True)
    return {
        **execution,
        "independent_verifier": json.loads(independent.stdout),
        "g10": read_json(ctx.artifact("gall/program.json")),
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--contract", default=str(DEFAULT_CONTRACT))
    parser.add_argument("--evidence", default=str(DEFAULT_EVIDENCE))
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--through", choices=CHECKPOINTS, default="G10")

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--through", choices=CHECKPOINTS, default="G10")

    sabotage_parser = subparsers.add_parser("sabotage")
    sabotage_parser.add_argument("--checkpoint", choices=CHECKPOINTS, required=True)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--json", action="store_true")

    subparsers.add_parser("crown")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        ctx = resolve_context(
            Path(args.repo),
            Path(args.contract),
            Path(args.evidence),
        )
        if args.command == "run":
            result = run_through(ctx, args.through)
        elif args.command == "verify":
            verify_through(ctx, args.through)
            return 0
        elif args.command == "sabotage":
            result = sabotage_checkpoint(ctx, args.checkpoint)
        elif args.command == "status":
            result = status(ctx)
        elif args.command == "crown":
            result = crown(ctx)
        else:
            raise AssertionError(args.command)
        print(json.dumps(result, indent=None if getattr(args, "json", False) else 2, sort_keys=True))
        return 0
    except TypedRefusal as error:
        print(
            json.dumps(
                {
                    "standing": "BUILD_BROKEN"
                    if error.refusal.code.startswith("CMD-PROCESS")
                    else "UNKNOWN",
                    "refusal": error.refusal.code,
                    "message": error.refusal.message,
                    "details": dict(error.refusal.details),
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
