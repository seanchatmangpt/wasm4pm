#!/usr/bin/env python3
"""Verify wasm4pm ontology namespace policy.

The verifier is intentionally dependency-free. It inspects semantic source files,
extracts namespace declarations and embedded IRIs, and refuses:

* example-domain identifiers in semantic artifacts;
* undeclared wasm4pm/chatmangpt namespace variants;
* legacy namespaces without an explicit replacement in namespaces.json;
* malformed namespace policy files.

Legacy identifiers are reported but remain accepted during the staged migration.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse


PREFIX_PATTERNS = (
    re.compile(r"@prefix\s+[A-Za-z][\w-]*:\s*<([^>]+)>", re.IGNORECASE),
    re.compile(r"\bPREFIX\s+[A-Za-z][\w-]*:\s*<([^>]+)>", re.IGNORECASE),
)
ANGLE_IRI_PATTERN = re.compile(r"<((?:https?|urn):[^>]+)>")
JSON_IRI_PATTERN = re.compile(r'"((?:https?|urn):[^"\\]+)"')

SEMANTIC_SUFFIXES = {".ttl", ".rq", ".sparql", ".jsonld", ".owl", ".rdf"}
EXTRA_SEMANTIC_FILES = {"ggen.toml"}
EXCLUDED_PARTS = {".git", "node_modules", "target", "dist", "coverage", ".venv"}
EXAMPLE_HOSTS = {"example.com", "example.org", "example.net"}


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    iri: str
    classification: str
    detail: str


def load_policy(path: Path) -> dict:
    try:
        policy = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot load namespace policy {path}: {exc}") from exc

    canonical = policy.get("canonical")
    legacy = policy.get("legacy")
    external = policy.get("external_vocabularies")
    if not isinstance(canonical, dict) or not canonical:
        raise RuntimeError("namespace policy requires a non-empty canonical object")
    if not isinstance(legacy, dict):
        raise RuntimeError("namespace policy requires a legacy object")
    if not isinstance(external, list):
        raise RuntimeError("namespace policy requires external_vocabularies array")

    for legacy_iri, declaration in legacy.items():
        replacement = declaration.get("replacement") if isinstance(declaration, dict) else None
        if not isinstance(replacement, str) or not replacement.startswith("https://chatmangpt.com/"):
            raise RuntimeError(
                f"legacy namespace {legacy_iri!r} lacks a chatmangpt.com replacement"
            )

    return policy


def semantic_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        if path.suffix.lower() in SEMANTIC_SUFFIXES or path.name in EXTRA_SEMANTIC_FILES:
            yield path


def extract_iris(line: str) -> set[str]:
    iris: set[str] = set()
    for pattern in PREFIX_PATTERNS:
        iris.update(pattern.findall(line))
    iris.update(ANGLE_IRI_PATTERN.findall(line))
    if "@context" in line or "CONSTRUCT" in line or "WHERE" in line or "namespace" in line.lower():
        iris.update(JSON_IRI_PATTERN.findall(line))
    return iris


def starts_with_any(iri: str, prefixes: Iterable[str]) -> bool:
    return any(iri.startswith(prefix) for prefix in prefixes)


def classify_iri(iri: str, policy: dict) -> tuple[str, str]:
    canonical = tuple(policy["canonical"].values())
    legacy = policy["legacy"]
    external = tuple(policy["external_vocabularies"])

    if starts_with_any(iri, canonical):
        return "canonical", "chatmangpt.com canonical namespace"
    if starts_with_any(iri, legacy.keys()):
        matching = next(prefix for prefix in legacy if iri.startswith(prefix))
        return "legacy", f"declared legacy namespace; replacement={legacy[matching]['replacement']}"
    if starts_with_any(iri, external):
        return "external", "approved public vocabulary"

    parsed = urlparse(iri) if not iri.startswith("urn:") else None
    host = (parsed.hostname or "").lower() if parsed else ""

    if host in EXAMPLE_HOSTS or host.endswith(".example.com"):
        return "error", "example-domain identifier is forbidden in semantic artifacts"

    if iri.startswith("urn:wasm4pm:"):
        return "legacy", "declared legacy instance namespace"

    if "wasm4pm" in iri.lower() or "chatmangpt" in iri.lower():
        return "error", "undeclared repo-owned namespace variant"

    return "other", "external identifier or citation not governed by this namespace policy"


def audit(root: Path, policy: dict) -> tuple[list[Finding], dict[str, int]]:
    findings: list[Finding] = []
    counts = {"canonical": 0, "legacy": 0, "external": 0, "other": 0, "error": 0}

    for path in sorted(semantic_files(root)):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue

        for line_number, line in enumerate(lines, start=1):
            for iri in sorted(extract_iris(line)):
                classification, detail = classify_iri(iri, policy)
                counts[classification] += 1
                if classification in {"legacy", "error"}:
                    findings.append(
                        Finding(
                            path=str(path.relative_to(root)),
                            line=line_number,
                            iri=iri,
                            classification=classification,
                            detail=detail,
                        )
                    )

    return findings, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--policy",
        type=Path,
        default=Path("ontology/chatmangpt/namespaces.json"),
    )
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    root = args.root.resolve()
    policy_path = args.policy if args.policy.is_absolute() else root / args.policy

    try:
        policy = load_policy(policy_path)
        findings, counts = audit(root, policy)
    except RuntimeError as exc:
        print(f"ONTOLOGY_NAMESPACE_POLICY_INVALID: {exc}", file=sys.stderr)
        return 2

    errors = [finding for finding in findings if finding.classification == "error"]
    legacy = [finding for finding in findings if finding.classification == "legacy"]

    result = {
        "status": "REFUSED" if errors else "ACCEPTED",
        "root": str(root),
        "policy": str(policy_path.relative_to(root)),
        "counts": counts,
        "legacy_occurrences": [asdict(item) for item in legacy],
        "errors": [asdict(item) for item in errors],
    }

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"ontology namespace policy: {result['status']}")
        print(json.dumps(counts, sort_keys=True))
        for finding in errors:
            print(
                f"ERROR {finding.path}:{finding.line}: {finding.iri} — {finding.detail}",
                file=sys.stderr,
            )
        if legacy:
            print(f"legacy identifiers observed: {len(legacy)} (declared and migration-tracked)")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
