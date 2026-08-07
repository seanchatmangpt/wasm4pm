#!/usr/bin/env python3
"""Self-contained law tests for scripts/ci/gall_checkpoint.py."""
from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("gall_checkpoint.py")
SPEC = importlib.util.spec_from_file_location("gall_checkpoint", MODULE_PATH)
assert SPEC and SPEC.loader
gall = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = gall
SPEC.loader.exec_module(gall)


class GallCheckpointLaws(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(
            ["git", "-C", str(self.root), "config", "user.email", "gall@example.invalid"],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(self.root), "config", "user.name", "GALL Test"],
            check=True,
        )
        (self.root / "subject.txt").write_text("admitted\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.root), "add", "subject.txt"], check=True)
        subprocess.run(
            ["git", "-C", str(self.root), "commit", "-qm", "admitted subject"],
            check=True,
        )
        self.subject = subprocess.check_output(
            ["git", "-C", str(self.root), "rev-parse", "HEAD"],
            text=True,
        ).strip()
        self.artifacts = self.root / "artifacts"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_checkpoint(
        self,
        checkpoint_id: str,
        command: tuple[str, ...],
        *,
        subject: str | None = None,
        requires: tuple[str, ...] = (),
    ):
        return gall.execute_checkpoint(
            gall.Checkpoint(
                checkpoint_id=checkpoint_id,
                title=checkpoint_id,
                command=command,
                cwd=".",
                timeout_seconds=10,
                required_receipts=requires,
            ),
            root=self.root,
            artifact_dir=self.artifacts,
            subject_sha=subject or self.subject,
        )

    def test_zero_exit_is_alive_and_receipted(self) -> None:
        receipt, path = self.run_checkpoint(
            "zero-exit",
            (sys.executable, "-c", "print('alive')"),
        )
        self.assertEqual(receipt["standing"], gall.Standing.ALIVE.value)
        self.assertEqual(receipt["execution"]["exit_code"], 0)
        self.assertEqual(gall.read_receipt(path), receipt)

    def test_nonzero_is_build_broken(self) -> None:
        receipt, _ = self.run_checkpoint(
            "nonzero",
            (sys.executable, "-c", "raise SystemExit(7)"),
        )
        self.assertEqual(receipt["standing"], gall.Standing.BUILD_BROKEN.value)
        self.assertEqual(receipt["execution"]["exit_code"], 7)
        self.assertEqual(receipt["blocker"]["code"], "COMMAND_NONZERO")

    def test_missing_executable_is_unsupported(self) -> None:
        receipt, _ = self.run_checkpoint(
            "unsupported",
            ("gall-command-that-must-not-exist-41d907",),
        )
        self.assertEqual(receipt["standing"], gall.Standing.UNSUPPORTED.value)
        self.assertEqual(receipt["blocker"]["code"], "EXECUTABLE_NOT_FOUND")

    def test_subject_mismatch_is_refused_without_execution(self) -> None:
        marker = self.root / "must-not-exist"
        receipt, _ = self.run_checkpoint(
            "identity",
            (sys.executable, "-c", f"open({str(marker)!r}, 'w').close()"),
            subject="0" * 40,
        )
        self.assertEqual(receipt["standing"], gall.Standing.REFUSED.value)
        self.assertEqual(receipt["blocker"]["code"], "SUBJECT_IDENTITY_MISMATCH")
        self.assertFalse(marker.exists())

    def test_non_alive_dependency_blocks_execution(self) -> None:
        failed, failed_path = self.run_checkpoint(
            "dependency",
            (sys.executable, "-c", "raise SystemExit(1)"),
        )
        self.assertEqual(failed["standing"], gall.Standing.BUILD_BROKEN.value)
        marker = self.root / "blocked-marker"
        blocked, _ = self.run_checkpoint(
            "dependent",
            (sys.executable, "-c", f"open({str(marker)!r}, 'w').close()"),
            requires=(str(failed_path),),
        )
        self.assertEqual(blocked["standing"], gall.Standing.BLOCKED.value)
        self.assertEqual(blocked["blocker"]["code"], "DEPENDENCY_NOT_ALIVE")
        self.assertFalse(marker.exists())

    def test_crown_requires_every_exact_leaf_alive(self) -> None:
        first, first_path = self.run_checkpoint(
            "first",
            (sys.executable, "-c", "pass"),
        )
        second, second_path = self.run_checkpoint(
            "second",
            (sys.executable, "-c", "pass"),
        )
        self.assertEqual(first["standing"], gall.Standing.ALIVE.value)
        self.assertEqual(second["standing"], gall.Standing.ALIVE.value)
        crown_path = self.artifacts / "crown.json"
        crown = gall.crown_receipts(
            receipt_paths=[first_path, second_path],
            required_ids=["first", "second"],
            subject_sha=self.subject,
            output_path=crown_path,
        )
        self.assertEqual(crown["standing"], gall.Standing.ALIVE.value)
        self.assertEqual(gall.read_receipt(crown_path), crown)

        partial = gall.crown_receipts(
            receipt_paths=[first_path],
            required_ids=["first", "second"],
            subject_sha=self.subject,
            output_path=self.artifacts / "partial.json",
        )
        self.assertEqual(partial["standing"], gall.Standing.PARTIAL_ALIVE.value)
        self.assertEqual(partial["missing_checkpoints"], ["second"])

    def test_tampered_receipt_is_refused(self) -> None:
        _, path = self.run_checkpoint(
            "tamper",
            (sys.executable, "-c", "pass"),
        )
        value = json.loads(path.read_text(encoding="utf-8"))
        value["standing"] = gall.Standing.ALIVE.value
        value["checkpoint"]["title"] = "tampered"
        path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "RECEIPT_DIGEST_MISMATCH"):
            gall.read_receipt(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
