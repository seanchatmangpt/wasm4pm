#!/usr/bin/env python3
"""Executable G0 witnesses and falsifiers."""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import cmd_g0


def test_hash(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=32).hexdigest()


CONTRACT = {
    "schema": "wasm4pm.cmd.g0.contract.v1",
    "checkpoint": "G0",
    "standing_ceiling": "PARTIAL_ALIVE",
    "required_artifacts": [
        "repository.json",
        "surfaces.json",
        "load-paths.json",
        "unknowns.json",
    ],
    "refusal_codes": [
        "CMD-G0-EXACT-SET",
        "CMD-G0-BASE-CHANGED",
        "CMD-G0-RECEIPT-TAMPER",
    ],
    "classifications": [
        {"classification": "authored constitution", "precedence": 10, "pattern": "AGENTS.md"},
        {"classification": "generated consequence", "precedence": 20, "pattern": "schemas/cmd-g0-contract.json"},
        {"classification": "configuration", "precedence": 80, "pattern": ".gitignore"},
        {"classification": "implementation", "precedence": 90, "pattern": "*.py"},
        {"classification": "unknown", "precedence": 1000, "pattern": "*"},
    ],
}


class RepositoryFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="cmd-g0-test-")
        self.root = Path(self.temporary.name)
        self.git("init")
        self.git("config", "user.name", "CMD G0 Test")
        self.git("config", "user.email", "cmd-g0@example.invalid")
        self.git("remote", "add", "origin", "https://github.com/example/example.git")

        (self.root / ".gitignore").write_text(".ggen/cmd/\n", encoding="utf-8")
        (self.root / "AGENTS.md").write_text("constitution\n", encoding="utf-8")
        executable = self.root / "tool.py"
        executable.write_text("#!/usr/bin/env python3\nprint('ok')\n", encoding="utf-8")
        executable.chmod(0o755)
        (self.root / "constitution-link").symlink_to("AGENTS.md")
        (self.root / "schemas").mkdir()
        (self.root / "schemas/cmd-g0-contract.json").write_text(
            json.dumps(CONTRACT, indent=2) + "\n",
            encoding="utf-8",
        )
        self.git("add", ".")
        self.git("commit", "-m", "fixture")

    def git(self, *args: str) -> str:
        process = subprocess.run(
            ["git", *args],
            cwd=self.root,
            capture_output=True,
            text=True,
            check=True,
        )
        return process.stdout.strip()

    def close(self) -> None:
        self.temporary.cleanup()


class CmdG0Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = RepositoryFixture()
        self.output = Path(".ggen/cmd/observation")
        self.contract = Path("schemas/cmd-g0-contract.json")

    def tearDown(self) -> None:
        self.fixture.close()

    def observe(self) -> dict:
        return cmd_g0.observe(
            self.fixture.root,
            "HEAD",
            self.output,
            self.contract,
            test_hash,
        )

    def test_observes_git_modes_and_untracked_paths_separately(self) -> None:
        (self.fixture.root / "scratch.txt").write_text("not authority\n", encoding="utf-8")
        result = self.observe()
        self.assertEqual(result["surface_count"], 5)

        observation_root = self.fixture.root / self.output
        surfaces = json.loads(
            (observation_root / "surfaces.json").read_text(encoding="utf-8")
        )["surfaces"]
        by_path = {surface["path"]: surface for surface in surfaces}
        self.assertEqual(by_path["tool.py"]["git_kind"], "executable_file")
        self.assertEqual(by_path["constitution-link"]["git_kind"], "symlink")

        repository = json.loads(
            (observation_root / "repository.json").read_text(encoding="utf-8")
        )
        self.assertEqual(repository["untracked_paths"], ["scratch.txt"])

        verified = cmd_g0.verify(
            self.fixture.root,
            self.output,
            self.contract,
            test_hash,
        )
        self.assertEqual(verified["standing"], "PARTIAL_ALIVE")

    def test_omission_falsifier_refuses_exact_set(self) -> None:
        self.observe()
        result = cmd_g0.falsify_omission(
            self.fixture.root,
            self.output,
            self.contract,
            test_hash,
        )
        self.assertEqual(result["observed_refusal"], "CMD-G0-EXACT-SET")

    def test_changed_head_refuses_stale_observation(self) -> None:
        self.observe()
        (self.fixture.root / "new.py").write_text("value = 1\n", encoding="utf-8")
        self.fixture.git("add", "new.py")
        self.fixture.git("commit", "-m", "change")

        with self.assertRaises(cmd_g0.CmdRefusal) as raised:
            cmd_g0.verify(
                self.fixture.root,
                self.output,
                self.contract,
                test_hash,
            )
        self.assertEqual(raised.exception.code, "CMD-G0-BASE-CHANGED")


if __name__ == "__main__":
    unittest.main()
