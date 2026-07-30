#!/usr/bin/env python3
"""Regression tests for scripts/verify-ontology-namespaces.py."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "verify-ontology-namespaces.py"
SPEC = importlib.util.spec_from_file_location("verify_ontology_namespaces", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load verifier module from {MODULE_PATH}")
VERIFIER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VERIFIER
SPEC.loader.exec_module(VERIFIER)


class NamespaceVerifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = VERIFIER.load_policy(
            ROOT / "ontology" / "chatmangpt" / "namespaces.json"
        )

    def assert_classification(self, iri: str, expected: str) -> None:
        classification, _namespace, _detail = VERIFIER.classify_iri(iri, self.policy)
        self.assertEqual(classification, expected, iri)

    def test_canonical_project_namespace_is_accepted(self) -> None:
        self.assert_classification(
            "https://chatmangpt.com/ns/wasm4pm/pi#algorithmId", "canonical"
        )

    def test_canonical_person_identity_is_accepted(self) -> None:
        self.assert_classification(
            "https://chatmangpt.com/id/person/sean-chatman", "canonical"
        )

    def test_declared_algorithm_namespace_is_legacy(self) -> None:
        self.assert_classification("https://wasm4pm.dev/pi#Algo_dfg", "legacy")

    def test_declared_compat_schema_namespace_is_legacy(self) -> None:
        self.assert_classification(
            "https://wasm4pm-compat.rs/ontology#AggregationView", "legacy"
        )

    def test_declared_zod_namespace_is_legacy(self) -> None:
        self.assert_classification("https://wasm4pm-compat.rs/zod#ObjectSchema", "legacy")

    def test_declared_semconv_fixture_namespace_is_legacy(self) -> None:
        self.assert_classification("http://wasm4pm.org/activity/Review", "legacy")

    def test_declared_wasm4pm_urn_is_legacy(self) -> None:
        self.assert_classification("urn:wasm4pm:algo_dfg", "legacy")

    def test_repository_url_is_external_metadata_not_owned_namespace(self) -> None:
        self.assert_classification("https://github.com/seanchatmangpt/wasm4pm", "external")

    def test_unknown_path_on_owned_host_is_refused(self) -> None:
        self.assert_classification("https://chatmangpt.com/not-declared/value", "error")

    def test_unknown_wasm4pm_subdomain_is_refused(self) -> None:
        self.assert_classification("https://rogue.wasm4pm.dev/ns#Thing", "error")

    def test_example_domain_is_refused(self) -> None:
        self.assert_classification("https://example.com/ontology#Thing", "error")

    def test_policy_rejects_legacy_replacement_outside_registry(self) -> None:
        broken = json.loads(
            (ROOT / "ontology" / "chatmangpt" / "namespaces.json").read_text(
                encoding="utf-8"
            )
        )
        broken["legacy"]["https://legacy.invalid/#"] = {
            "replacement": "https://chatmangpt.com/unregistered/#",
            "status": "migration_required",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "namespaces.json"
            path.write_text(json.dumps(broken), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                VERIFIER.load_policy(path)


if __name__ == "__main__":
    unittest.main()
