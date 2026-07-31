#!/usr/bin/env python3
"""Independent unit/property witnesses for CMD G1-G10."""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from cmd_core import (  # noqa: E402
    TypedRefusal,
    aggregate_standing,
    analyze_ownership,
    assert_no_unauthorized_retirement,
    candidate_signature,
    construct_valid_candidates,
    dependency_closure,
    deterministic_plan,
    normalize_dimensions,
    select_pairwise_coverage,
    validate_external_candidate,
    validate_intent_and_grant,
    verify_candidate_totality,
)
from cmd_g1_g10 import (  # noqa: E402
    TRUST_RANK,
    broker_execute_local,
    read_json,
    safe_target,
    scan_kernel_imports,
    transactional_materialize,
)


class KernelTests(unittest.TestCase):
    def test_dependency_closure_is_deterministic(self) -> None:
        graph = {"G1": [], "G2": ["G1"], "G3": ["G2"]}
        self.assertEqual(dependency_closure(graph, ["G3"]), ["G1", "G2", "G3"])
        self.assertEqual(dependency_closure(graph, ["G3"]), ["G1", "G2", "G3"])

    def test_cycle_refuses(self) -> None:
        with self.assertRaises(TypedRefusal) as raised:
            dependency_closure({"a": ["b"], "b": ["a"]}, ["a"])
        self.assertEqual(raised.exception.refusal.code, "CMD-G6-CYCLE")

    def test_ownership_collision_refuses(self) -> None:
        with self.assertRaises(TypedRefusal) as raised:
            analyze_ownership(
                [
                    {"output": "same", "semantic_owner": "one", "ownership_mode": "exclusive"},
                    {"output": "same", "semantic_owner": "two", "ownership_mode": "exclusive"},
                ]
            )
        self.assertEqual(raised.exception.refusal.code, "CMD-G1-DUPLICATE-AUTHORITY")

    def test_internal_candidate_identity_and_pairwise_coverage(self) -> None:
        items = [
            {"kind": "dimension", "checkpoint": "G3", "id": "runtime", "scope": "internal", "cardinality": "exactly-one", "risk_class": "HIGH", "coverage_mode": "pairwise", "resource_ceiling": 32},
            {"kind": "dimension", "checkpoint": "G3", "id": "storage", "scope": "internal", "cardinality": "exactly-one", "risk_class": "HIGH", "coverage_mode": "pairwise", "resource_ceiling": 32},
            {"kind": "option", "checkpoint": "G3", "dimension_id": "runtime", "id": "native", "reversibility": "REVERSIBLE", "authority_ceiling": "PLAN_ONLY"},
            {"kind": "option", "checkpoint": "G3", "dimension_id": "runtime", "id": "wasm", "reversibility": "REVERSIBLE", "authority_ceiling": "PLAN_ONLY"},
            {"kind": "option", "checkpoint": "G3", "dimension_id": "storage", "id": "memory", "reversibility": "REVERSIBLE", "authority_ceiling": "PLAN_ONLY"},
            {"kind": "option", "checkpoint": "G3", "dimension_id": "storage", "id": "file", "reversibility": "REVERSIBLE", "authority_ceiling": "PLAN_ONLY"},
        ]
        dimensions = normalize_dimensions(items, "G3")
        candidates = construct_valid_candidates(dimensions)
        verify_candidate_totality(dimensions, candidates)
        selected, coverage = select_pairwise_coverage(dimensions, candidates)
        self.assertEqual(len(candidates), 4)
        self.assertEqual(coverage["uncovered_pairs"], [])
        self.assertEqual(len(selected), 4)
        self.assertEqual(candidates[0]["signature"], candidate_signature(candidates[0]["selection"]))

    def test_plan_identity_changes_with_tree(self) -> None:
        kwargs = {
            "semantic_inputs": {"x": 1},
            "source_revisions": {"repo": "abc"},
            "resolved_closure": ["a"],
            "parameters": {},
            "policy": {},
            "ownership_graph": {},
            "consequence_graph": {},
            "compiler_identity": "ggen@test",
        }
        one = deterministic_plan(project_tree="tree-one", **kwargs)
        two = deterministic_plan(project_tree="tree-two", **kwargs)
        self.assertNotEqual(one["plan_digest"], two["plan_digest"])

    def test_external_candidate_requires_consent(self) -> None:
        candidate = {
            "selection": {
                "provider": "github", "protocol": "git", "identity": "github-app",
                "authentication": "signed-token", "consent": "explicit-evidence",
                "trust": "signed", "jurisdiction": "us-declared",
                "runtime-target": "github-actions", "consequence": "git-ref",
                "evidence-source": "git-observer", "compensation": "revert-commit",
            },
            "resource_scope": "repo",
            "authority": "INTENT_ONLY",
        }
        with self.assertRaises(TypedRefusal) as raised:
            validate_external_candidate(candidate, consent={}, trust_rank=TRUST_RANK, required_trust="signed", current_jurisdiction="us-declared")
        self.assertEqual(raised.exception.refusal.code, "CMD-G4-CONSENT-MISSING")

    def test_standing_is_not_averaged(self) -> None:
        self.assertEqual(aggregate_standing({"G1": "PARTIAL_ALIVE", "G2": "UNKNOWN"}), "UNKNOWN")
        self.assertEqual(aggregate_standing({"G1": "PARTIAL_ALIVE", "G2": "PARTIAL_ALIVE"}), "PARTIAL_ALIVE")

    def test_retirement_requires_equivalence(self) -> None:
        with self.assertRaises(TypedRefusal) as raised:
            assert_no_unauthorized_retirement([{"decision": "RETIRE", "replacement": "new"}])
        self.assertEqual(raised.exception.refusal.code, "CMD-G10-RETIREMENT-WITHOUT-EQUIVALENCE")


class BoundaryTests(unittest.TestCase):
    def test_kernel_has_no_actuator_imports(self) -> None:
        self.assertEqual(scan_kernel_imports(SCRIPTS / "cmd_core.py"), [])

    def test_path_escape_refuses(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(TypedRefusal) as raised:
                safe_target(Path(directory), "../escape")
        self.assertEqual(raised.exception.refusal.code, "CMD-G7-PATH-ESCAPE")

    def test_transaction_commits_artifact_and_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = transactional_materialize(Path(directory), {"version": 1})
            self.assertEqual(result["status"], "committed")
            self.assertEqual(read_json(Path(directory) / "live" / "candidate.json"), {"version": 1})
            self.assertTrue((Path(directory) / "live" / "result-receipt.json").is_file())

    def test_chaos_restores_prior_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            transactional_materialize(root, {"version": 1})
            with self.assertRaises(TypedRefusal) as raised:
                transactional_materialize(root, {"version": 2}, fail_at="commit")
            self.assertEqual(raised.exception.refusal.code, "CMD-G7-CHAOS-PARTIAL")
            self.assertEqual(read_json(root / "live" / "candidate.json")["version"], 1)

    def test_broker_enforces_idempotency(self) -> None:
        consent = {"resource_scope": "scope", "revocation_status": "ACTIVE"}
        intent = {
            "intent_id": "intent", "candidate_id": "candidate",
            "operation": "record-local-evidence-consequence",
            "arguments": {"resource_scope": "scope", "jurisdiction": "local", "retry_budget": 1},
            "subject_digest": "a" * 64, "desired_postcondition": "observed",
            "required_authority": "local", "consent_evidence": consent,
            "jurisdiction": "local", "resource_budget": 1,
            "expiry": "2099-01-01T00:00:00Z", "idempotency_key": "key",
            "required_broker": "local", "expected_evidence_classes": ["receipt"],
        }
        grant = {
            "grant_id": "grant", "intent_id": "intent", "approver_identity": "test",
            "policy_digest": "b" * 64, "scope": "record-local-evidence-consequence",
            "resource_ceiling": 1, "expiry": "2099-01-01T00:00:00Z",
            "precondition_digest": "c" * 64,
        }
        validate_intent_and_grant(intent, grant, now="2026-07-30T00:00:00Z")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = broker_execute_local(root, intent, grant, now="2026-07-30T00:00:00Z")
            self.assertTrue(first["postcondition_observed"])
            with self.assertRaises(TypedRefusal) as raised:
                broker_execute_local(root, intent, grant, now="2026-07-30T00:00:00Z")
            self.assertEqual(raised.exception.refusal.code, "CMD-G8-IDEMPOTENCY")


if __name__ == "__main__":
    unittest.main(verbosity=2)
