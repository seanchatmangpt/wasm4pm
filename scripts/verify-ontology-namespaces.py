#!/usr/bin/env python3
"""Verify wasm4pm ontology namespace policy.

The verifier is intentionally dependency-free. It inspects semantic source files,
extracts namespace declarations and embedded IRIs, and refuses:

* example-domain identifiers in semantic artifacts;
* undeclared identifiers on a repository-owned host;
* undeclared repository-owned URN families;
* legacy namespaces without an explicit ChatmanGPT replacement;
* malformed or internally inconsistent namespace policy files.

Declared legacy identifiers are reported as migration debt but remain accepted
until their owning semantic surface is migrated and replayed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
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
    namespace: str
    detail: str


def _is_https_chatmangpt(value: object) -> bool:
    return isinstance(value, str) and value.startswith("https://chatmangpt.com/")


def load_policy(path: Path) -> dict:
    try:
        policy = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot load namespace policy {path}: {exc}") from exc

    canonical = policy.get("canonical")
    legacy = policy.get("legacy")
    external = policy.get("external_vocabularies")
    owned_hosts = policy.get("owned_hosts")
    owned_urn_prefixes = policy.get("owned_urn_prefixes")

    if not isinstance(canonical, dict) or not canonical:
        raise RuntimeError("namespace policy requires a non-empty canonical object")
    if not isinstance(legacy, dict):
        raise RuntimeError("namespace policy requires a legacy object")
    if not isinstance(external, list):
        raise RuntimeError("namespace policy requires external_vocabularies array")
    if not isinstance(owned_hosts, list) or not owned_hosts:
        raise RuntimeError("namespace policy requires a non-empty owned_hosts array")
    if not isinstance(owned_urn_prefixes, list):
        raise RuntimeError("namespace policy requires owned_urn_prefixes array")

    bad_canonical = {
        name: value for name, value in canonical.items() if not _is_https_chatmangpt(value)
    }
    if bad_canonical:
        raise RuntimeError(
            "canonical namespaces must use https://chatmangpt.com/: "
            + json.dumps(bad_canonical, sort_keys=True)
        )

    canonical_values = tuple(canonical.values())
    if len(canonical_values) != len(set(canonical_values)):
        raise RuntimeError("canonical namespace values must be unique")

    for legacy_iri, declaration in legacy.items():
        replacement = declaration.get("replacement") if isinstance(declaration, dict) else None
        if not _is_https_chatmangpt(replacement):
            raise RuntimeError(
                f"legacy namespace {legacy_iri!r} lacks a chatmangpt.com replacement"
            )
        if not any(replacement.startswith(prefix) for prefix in canonical_values):
            raise RuntimeError(
                f"legacy namespace {legacy_iri!r} replacement {replacement!r} "
                "is outside the canonical registry"
            )

    normalized_hosts = []
    for host in owned_hosts:
        if not isinstance(host, str) or not host.strip():
            raise RuntimeError("owned_hosts entries must be non-empty strings")
        normalized_hosts.append(host.lower().strip("."))
    policy["owned_hosts"] = normalized_hosts

    for prefix in owned_urn_prefixes:
        if not isinstance(prefix, str) or not prefix.startswith("urn:"):
            raise RuntimeError("owned_urn_prefixes entries must be URN prefixes")

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
    # JSON-LD context values commonly appear one per line, so inspect every
    # string literal rather than only the line containing the @context key.
    iris.update(JSON_IRI_PATTERN.findall(line))
    return iris


def starts_with_any(iri: str, prefixes: Iterable[str]) -> bool:
    return any(iri.startswith(prefix) for prefix in prefixes)


def matching_prefix(iri: str, prefixes: Iterable[str]) -> str | None:
    matches = [prefix for prefix in prefixes if iri.startswith(prefix)]
    return max(matches, key=len) if matches else None


def host_is_owned(host: str, owned_hosts: Iterable[str]) -> bool:
    return any(host == owned or host.endswith(f".{owned}") for owned in owned_hosts)


def classify_iri(iri: str, policy: dict) -> tuple[str, str, str]:
    canonical = tuple(policy["canonical"].values())
    legacy = policy["legacy"]
    external = tuple(policy["external_vocabularies"])

    canonical_match = matching_prefix(iri, canonical)
    if canonical_match:
        return "canonical", canonical_match, "ChatmanGPT canonical namespace"

    legacy_match = matching_prefix(iri, legacy.keys())
    if legacy_match:
        replacement = legacy[legacy_match]["replacement"]
        role = legacy[legacy_match].get("role", "unspecified_legacy_role")
        return (
            "legacy",
            legacy_match,
            f"declared legacy namespace ({role}); replacement={replacement}",
        )

    external_match = matching_prefix(iri, external)
    if external_match:
        return "external", external_match, "approved external vocabulary or metadata authority"

    if iri.startswith("urn:"):
        owned_urn = matching_prefix(iri, policy["owned_urn_prefixes"])
        if owned_urn:
            return "error", owned_urn, "undeclared repository-owned URN namespace"
        return "other", "urn:", "external or ungoverned URN"

    parsed = urlparse(iri)
    host = (parsed.hostname or "").lower()

    if host in EXAMPLE_HOSTS or any(host.endswith(f".{item}") for item in EXAMPLE_HOSTS):
        return "error", host, "example-domain identifier is forbidden in semantic artifacts"

    if host_is_owned(host, policy["owned_hosts"]):
        return "error", host, "undeclared namespace on a repository-owned host"

    return "other", host or "unparsed", "external identifier or citation outside namespace governance"


def audit(root: Path, policy: dict) -> tuple[list[Finding], dict[str, int], dict[str, dict[str, int]]]:
    findings: list[Finding] = []
    counts: Counter[str] = Counter()
    namespace_counts: dict[str, Counter[str]] = {
        "canonical": Counter(),
        "legacy": Counter(),
        "external": Counter(),
        "other": Counter(),
        "error": Counter(),
    }

    for path in sorted(semantic_files(root)):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue

        for line_number, line in enumerate(lines, start=1):
            for iri in sorted(extract_iris(line)):
                classification, namespace, detail = classify_iri(iri, policy)
                counts[classification] += 1
                namespace_counts[classification][namespace] += 1
                if classification in {"legacy", "error"}:
                    findings.append(
                        Finding(
                            path=str(path.relative_to(root)),
                            line=line_number,
                            iri=iri,
                            classification=classification,
                            namespace=namespace,
                            detail=detail,
                        )
                    )

    complete_counts = {
        name: counts.get(name, 0)
        for name in ("canonical", "legacy", "external", "other", "error")
    }
    complete_namespace_counts = {
        name: dict(sorted(counter.items())) for name, counter in namespace_counts.items()
    }
    return findings, complete_counts, complete_namespace_counts


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
        findings, counts, namespace_counts = audit(root, policy)
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
        "namespace_counts": namespace_counts,
        "legacy_occurrences": [asdict(item) for item in legacy],
        "errors": [asdict(item) for item in errors],
    }

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"ontology namespace policy: {result['status']}")
        print(json.dumps(counts, sort_keys=True))
        print(json.dumps(namespace_counts, indent=2, sort_keys=True))
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
