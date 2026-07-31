#!/usr/bin/env python3
"""Pure combinatorial-maximalism kernel.

This module is intentionally IO-free. It may normalize semantic inputs, construct
bounded candidates, calculate closures, manufacture deterministic plans, and
return typed refusals. It may not observe or mutate machine state.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
import json
from typing import Any, Callable, Iterable, Mapping, Sequence

from blake3 import blake3


FORBIDDEN_ACTUATOR_MODULES = frozenset(
    {
        "os",
        "pathlib",
        "subprocess",
        "socket",
        "http",
        "urllib",
        "requests",
        "aiohttp",
        "boto3",
        "kubernetes",
        "pulumi",
        "terraform",
        "git",
        "github",
        "shutil",
        "tempfile",
    }
)


@dataclass(frozen=True)
class Refusal:
    code: str
    message: str
    details: Mapping[str, Any]


class TypedRefusal(RuntimeError):
    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(f"REFUSED: {code}: {message}")
        self.refusal = Refusal(code=code, message=message, details=details)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def digest(value: Any) -> str:
    return blake3(canonical_bytes(value)).hexdigest()


def stable_unique(values: Iterable[str]) -> list[str]:
    return sorted(set(values))


def split_pipe(value: Any) -> list[str]:
    if value is None:
        return []
    return stable_unique(part for part in str(value).split("|") if part)


def checkpoint_graph(items: Sequence[Mapping[str, Any]]) -> dict[str, list[str]]:
    graph: dict[str, list[str]] = {}
    for item in items:
        if item.get("kind") != "checkpoint":
            continue
        checkpoint = str(item["id"])
        if checkpoint in graph:
            raise TypedRefusal(
                "CMD-G2-UNIQUE-IDENTITY",
                "duplicate checkpoint identity",
                checkpoint=checkpoint,
            )
        graph[checkpoint] = split_pipe(item.get("depends_on"))
    return graph


def dependency_closure(
    graph: Mapping[str, Sequence[str]],
    roots: Sequence[str],
) -> list[str]:
    visiting: set[str] = set()
    visited: set[str] = set()
    ordered: list[str] = []

    def visit(node: str) -> None:
        if node in visited:
            return
        if node in visiting:
            raise TypedRefusal("CMD-G6-CYCLE", "dependency cycle", node=node)
        if node not in graph:
            raise TypedRefusal(
                "CMD-G10-DEPENDENCY-OPEN",
                "unknown dependency",
                node=node,
            )
        visiting.add(node)
        for dependency in sorted(graph[node]):
            visit(dependency)
        visiting.remove(node)
        visited.add(node)
        ordered.append(node)

    for root in sorted(roots):
        visit(root)
    return ordered


def normalize_dimensions(
    items: Sequence[Mapping[str, Any]],
    checkpoint: str,
) -> list[dict[str, Any]]:
    dimensions: dict[str, dict[str, Any]] = {}
    for item in items:
        if item.get("kind") == "dimension" and item.get("checkpoint") == checkpoint:
            identifier = str(item["id"])
            if identifier in dimensions:
                raise TypedRefusal(
                    f"CMD-{checkpoint}-DUPLICATE-DIMENSION",
                    "duplicate dimension",
                    dimension=identifier,
                )
            dimensions[identifier] = {
                "id": identifier,
                "scope": item.get("scope"),
                "cardinality": item.get("cardinality"),
                "risk_class": item.get("risk_class"),
                "coverage_mode": item.get("coverage_mode"),
                "resource_ceiling": int(item.get("resource_ceiling") or 0),
                "options": [],
            }

    for item in items:
        if item.get("kind") != "option" or item.get("checkpoint") != checkpoint:
            continue
        dimension_id = str(item.get("dimension_id"))
        if dimension_id not in dimensions:
            raise TypedRefusal(
                f"CMD-{checkpoint}-DIMENSION-MISSING",
                "option references unknown dimension",
                dimension=dimension_id,
                option=item.get("id"),
            )
        dimensions[dimension_id]["options"].append(
            {
                "id": str(item["id"]),
                "reversibility": item.get("reversibility"),
                "authority_ceiling": item.get("authority_ceiling"),
            }
        )

    result = []
    for identifier in sorted(dimensions):
        dimension = dimensions[identifier]
        dimension["options"] = sorted(dimension["options"], key=lambda row: row["id"])
        if not dimension["options"]:
            raise TypedRefusal(
                f"CMD-{checkpoint}-DIMENSION-MISSING",
                "dimension has no options",
                dimension=identifier,
            )
        result.append(dimension)
    return result


def candidate_signature(selection: Mapping[str, str]) -> str:
    return digest({"selection": dict(sorted(selection.items()))})


def _compatible(
    selection: Mapping[str, str],
    constraints: Sequence[Mapping[str, Any]],
) -> bool:
    for constraint in constraints:
        when = constraint.get("when", {})
        forbid = constraint.get("forbid", {})
        if all(selection.get(k) == v for k, v in when.items()):
            if all(selection.get(k) == v for k, v in forbid.items()):
                return False
    return True


def construct_valid_candidates(
    dimensions: Sequence[Mapping[str, Any]],
    constraints: Sequence[Mapping[str, Any]] = (),
    *,
    unconstrained_ceiling: int = 100_000,
    valid_ceiling: int = 4_096,
) -> list[dict[str, Any]]:
    product_size = 1
    for dimension in dimensions:
        product_size *= len(dimension["options"])
        if product_size > unconstrained_ceiling:
            raise TypedRefusal(
                "CMD-G3-RESOURCE-OVERFLOW",
                "unconstrained product exceeds admitted ceiling",
                product_size=product_size,
                ceiling=unconstrained_ceiling,
            )

    valid: list[dict[str, Any]] = []

    def walk(index: int, selection: dict[str, str]) -> None:
        if len(valid) > valid_ceiling:
            raise TypedRefusal(
                "CMD-G3-RESOURCE-OVERFLOW",
                "valid candidate set exceeds admitted ceiling",
                count=len(valid),
                ceiling=valid_ceiling,
            )
        if index == len(dimensions):
            if not _compatible(selection, constraints):
                return
            signature = candidate_signature(selection)
            valid.append(
                {
                    "candidate_id": f"cmd:{signature[:24]}",
                    "signature": signature,
                    "selection": dict(sorted(selection.items())),
                    "authority": "NONE",
                    "standing": "UNKNOWN",
                }
            )
            return

        dimension = dimensions[index]
        dimension_id = str(dimension["id"])
        for option in dimension["options"]:
            selection[dimension_id] = str(option["id"])
            if _compatible(selection, constraints):
                walk(index + 1, selection)
        selection.pop(dimension_id, None)

    walk(0, {})
    signatures = [candidate["signature"] for candidate in valid]
    if len(signatures) != len(set(signatures)):
        raise TypedRefusal(
            "CMD-G3-DUPLICATE-CANDIDATE",
            "duplicate candidate signature",
        )
    return sorted(valid, key=lambda row: row["signature"])


def expected_pair_universe(
    dimensions: Sequence[Mapping[str, Any]],
) -> set[tuple[str, str, str, str]]:
    universe: set[tuple[str, str, str, str]] = set()
    for left, right in combinations(dimensions, 2):
        for left_option in left["options"]:
            for right_option in right["options"]:
                universe.add(
                    (
                        str(left["id"]),
                        str(left_option["id"]),
                        str(right["id"]),
                        str(right_option["id"]),
                    )
                )
    return universe


def candidate_pairs(candidate: Mapping[str, Any]) -> set[tuple[str, str, str, str]]:
    selection = dict(candidate["selection"])
    pairs: set[tuple[str, str, str, str]] = set()
    for left, right in combinations(sorted(selection), 2):
        pairs.add((left, selection[left], right, selection[right]))
    return pairs


def select_pairwise_coverage(
    dimensions: Sequence[Mapping[str, Any]],
    candidates: Sequence[Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    theoretical = expected_pair_universe(dimensions)
    expected: set[tuple[str, str, str, str]] = set()
    for candidate in candidates:
        expected |= candidate_pairs(candidate)
    uncovered = set(expected)
    remaining = [dict(candidate) for candidate in candidates]
    selected: list[dict[str, Any]] = []

    while uncovered:
        best = max(
            remaining,
            key=lambda candidate: (
                len(candidate_pairs(candidate) & uncovered),
                candidate["signature"],
            ),
            default=None,
        )
        if best is None:
            break
        gain = candidate_pairs(best) & uncovered
        if not gain:
            break
        selected.append(best)
        uncovered -= gain
        remaining = [
            candidate
            for candidate in remaining
            if candidate["signature"] != best["signature"]
        ]

    report = {
        "mode": "pairwise-valid-space",
        "theoretical_pairs": len(theoretical),
        "excluded_invalid_pairs": len(theoretical - expected),
        "expected_pairs": len(expected),
        "covered_pairs": len(expected - uncovered),
        "uncovered_pairs": [list(pair) for pair in sorted(uncovered)],
        "selected_candidates": len(selected),
        "candidate_set_digest": digest(selected),
    }
    if uncovered:
        raise TypedRefusal(
            "CMD-G3-COVERAGE-INCOMPLETE",
            "pairwise coverage is incomplete",
            uncovered=len(uncovered),
        )
    return selected, report


def verify_candidate_totality(
    dimensions: Sequence[Mapping[str, Any]],
    candidates: Sequence[Mapping[str, Any]],
) -> None:
    expected = {str(dimension["id"]) for dimension in dimensions}
    seen: set[str] = set()
    for candidate in candidates:
        selection = set(candidate["selection"])
        if selection != expected:
            raise TypedRefusal(
                "CMD-G3-DIMENSION-MISSING",
                "candidate is not total",
                candidate=candidate.get("candidate_id"),
                missing=sorted(expected - selection),
                extra=sorted(selection - expected),
            )
        signature = candidate_signature(candidate["selection"])
        if signature != candidate["signature"]:
            raise TypedRefusal(
                "CMD-G3-COUNT-TAMPER",
                "candidate signature does not match semantic selection",
                candidate=candidate.get("candidate_id"),
            )
        if signature in seen:
            raise TypedRefusal(
                "CMD-G3-DUPLICATE-CANDIDATE",
                "duplicate candidate signature",
                signature=signature,
            )
        seen.add(signature)
        if candidate.get("authority") != "NONE":
            raise TypedRefusal(
                "CMD-G3-PREMATURE-AUTHORITY",
                "candidate has actuation authority",
                candidate=candidate.get("candidate_id"),
            )


def analyze_ownership(
    claims: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    by_output: dict[str, list[Mapping[str, Any]]] = {}
    missing = []
    for claim in claims:
        output = str(claim.get("output", ""))
        owner = claim.get("semantic_owner")
        if not output:
            continue
        if not owner:
            missing.append(output)
        by_output.setdefault(output, []).append(claim)
    if missing:
        raise TypedRefusal(
            "CMD-G1-OWNER-MISSING",
            "live outputs lack a semantic owner",
            outputs=sorted(missing),
        )

    collisions: list[dict[str, Any]] = []
    for output, output_claims in sorted(by_output.items()):
        exclusive = {
            str(claim["semantic_owner"])
            for claim in output_claims
            if claim.get("ownership_mode", "exclusive") == "exclusive"
        }
        if len(exclusive) > 1:
            collisions.append({"output": output, "owners": sorted(exclusive)})
    if collisions:
        raise TypedRefusal(
            "CMD-G1-DUPLICATE-AUTHORITY",
            "exclusive output has multiple owners",
            collisions=collisions,
        )
    return {
        "outputs": len(by_output),
        "claims": len(claims),
        "collisions": [],
        "digest": digest(claims),
    }


def capability_closure(
    packs: Mapping[str, Mapping[str, Any]],
    roots: Sequence[str],
) -> list[str]:
    graph = {
        identity: stable_unique(pack.get("dependencies", []))
        for identity, pack in packs.items()
    }
    return dependency_closure(graph, roots)


def verify_capability_closure(
    packs: Mapping[str, Mapping[str, Any]],
    closure: Sequence[str],
) -> None:
    provided: set[str] = set()
    for identity in closure:
        if identity not in packs:
            raise TypedRefusal(
                "CMD-G5-CAPABILITY-OPEN",
                "closure references unknown pack",
                pack=identity,
            )
        provided.update(packs[identity].get("provides", []))
    for identity in closure:
        required = set(packs[identity].get("requires", []))
        missing = sorted(required - provided)
        if missing:
            raise TypedRefusal(
                "CMD-G5-CAPABILITY-OPEN",
                "required capability is absent",
                pack=identity,
                missing=missing,
            )


def deterministic_plan(
    *,
    semantic_inputs: Mapping[str, Any],
    source_revisions: Mapping[str, str],
    resolved_closure: Sequence[str],
    parameters: Mapping[str, Any],
    policy: Mapping[str, Any],
    project_tree: str,
    ownership_graph: Mapping[str, Any],
    consequence_graph: Mapping[str, Any],
    compiler_identity: str,
) -> dict[str, Any]:
    payload = {
        "semantic_inputs": semantic_inputs,
        "source_revisions": dict(sorted(source_revisions.items())),
        "resolved_closure": list(resolved_closure),
        "parameters": parameters,
        "policy": policy,
        "project_tree": project_tree,
        "ownership_graph": ownership_graph,
        "consequence_graph": consequence_graph,
        "compiler_identity": compiler_identity,
    }
    return {
        "schema": "wasm4pm.cmd-plan.v1",
        "payload": payload,
        "plan_digest": digest(payload),
        "authority": "NONE",
    }


def validate_external_candidate(
    candidate: Mapping[str, Any],
    *,
    consent: Mapping[str, Any],
    trust_rank: Mapping[str, int],
    required_trust: str,
    current_jurisdiction: str,
) -> None:
    required = {
        "provider",
        "protocol",
        "identity",
        "authentication",
        "consent",
        "trust",
        "jurisdiction",
        "runtime-target",
        "consequence",
        "evidence-source",
        "compensation",
    }
    selection = candidate.get("selection", {})
    missing = sorted(required - set(selection))
    if missing:
        raise TypedRefusal(
            "CMD-G4-CANDIDATE-INCOMPLETE",
            "external candidate is incomplete",
            missing=missing,
        )
    if not consent:
        raise TypedRefusal("CMD-G4-CONSENT-MISSING", "consent evidence absent")
    for field in (
        "subject",
        "action",
        "resource_scope",
        "purpose",
        "issuer",
        "issued_time",
        "expiry",
        "revocation_status",
        "evidence_digest",
    ):
        if field not in consent:
            raise TypedRefusal(
                "CMD-G4-CONSENT-MISSING",
                "consent evidence incomplete",
                field=field,
            )
    if consent.get("revocation_status") != "ACTIVE":
        raise TypedRefusal("CMD-G4-IDENTITY-REVOKED", "consent or identity revoked")
    if consent.get("resource_scope") != candidate.get("resource_scope"):
        raise TypedRefusal(
            "CMD-G4-CONSENT-SCOPE",
            "consent scope does not match candidate",
        )
    if selection["jurisdiction"] != current_jurisdiction:
        raise TypedRefusal(
            "CMD-G4-JURISDICTION",
            "jurisdiction mismatch",
            selected=selection["jurisdiction"],
            current=current_jurisdiction,
        )
    current_trust = selection["trust"]
    if trust_rank.get(current_trust, -1) < trust_rank.get(required_trust, 10**9):
        raise TypedRefusal(
            "CMD-G4-TRUST-FLOOR",
            "candidate trust is below the required floor",
            current=current_trust,
            required=required_trust,
        )
    if candidate.get("authority") not in (None, "NONE", "INTENT_ONLY"):
        raise TypedRefusal(
            "CMD-G4-DIRECT-ACTUATION",
            "external candidate exceeded intent authority",
        )


def validate_intent_and_grant(
    intent: Mapping[str, Any],
    grant: Mapping[str, Any],
    *,
    now: str,
) -> None:
    required_intent = {
        "intent_id",
        "candidate_id",
        "operation",
        "arguments",
        "subject_digest",
        "desired_postcondition",
        "required_authority",
        "consent_evidence",
        "jurisdiction",
        "resource_budget",
        "expiry",
        "idempotency_key",
        "required_broker",
        "expected_evidence_classes",
    }
    missing_intent = sorted(required_intent - set(intent))
    if missing_intent:
        raise TypedRefusal(
            "CMD-G8-INTENT-INCOMPLETE",
            "broker intent is incomplete",
            missing=missing_intent,
        )
    required_grant = {
        "grant_id",
        "intent_id",
        "approver_identity",
        "policy_digest",
        "scope",
        "resource_ceiling",
        "expiry",
        "precondition_digest",
    }
    missing_grant = sorted(required_grant - set(grant))
    if missing_grant:
        raise TypedRefusal(
            "CMD-G8-GRANT-INCOMPLETE",
            "authority grant is incomplete",
            missing=missing_grant,
        )
    if grant["intent_id"] != intent["intent_id"]:
        raise TypedRefusal(
            "CMD-G8-SUBJECT-MISMATCH",
            "grant does not bind the intent",
        )
    if str(grant["expiry"]) <= now or str(intent["expiry"]) <= now:
        raise TypedRefusal("CMD-G8-GRANT-EXPIRED", "grant or intent expired")
    if grant["scope"] != intent["operation"]:
        raise TypedRefusal(
            "CMD-G8-SUBJECT-MISMATCH",
            "grant scope does not match operation",
        )
    if int(grant["resource_ceiling"]) < int(intent["resource_budget"]):
        raise TypedRefusal(
            "CMD-G8-RESOURCE-OVERFLOW",
            "intent exceeds grant resource ceiling",
        )


def aggregate_standing(standings: Mapping[str, str]) -> str:
    values = list(standings.values())
    allowed = {
        "PARTIAL_ALIVE",
        "ALIVE",
        "BLOCKED",
        "BUILD_BROKEN",
        "UNKNOWN",
        "UNSUPPORTED",
    }
    invalid = sorted(set(values) - allowed)
    if invalid:
        raise TypedRefusal(
            "CMD-G10-STANDING-AVERAGED",
            "invalid or lifecycle standing used",
            invalid=invalid,
        )
    for priority in ("BUILD_BROKEN", "BLOCKED", "UNKNOWN", "UNSUPPORTED"):
        if priority in values:
            return priority
    if values and all(value == "ALIVE" for value in values):
        return "ALIVE"
    return "PARTIAL_ALIVE"


def assert_no_unauthorized_retirement(
    retirement_candidates: Sequence[Mapping[str, Any]],
) -> None:
    bad = [
        item
        for item in retirement_candidates
        if item.get("decision") == "RETIRE"
        and not (
            item.get("equivalence_proof")
            and item.get("replacement")
            and item.get("rollback_law")
        )
    ]
    if bad:
        raise TypedRefusal(
            "CMD-G10-RETIREMENT-WITHOUT-EQUIVALENCE",
            "retirement lacks executable equivalence",
            candidates=bad,
        )
