#!/usr/bin/env python3
"""Regenerate packs/workspace-pack/ontology.ttl's compat:WorkspaceCrate individuals
from a real `cargo metadata` query, replacing the hand-maintained survey snapshot.

Idempotent: re-running against an unchanged Cargo workspace produces byte-identical
output (individuals are emitted in crateDir-sorted order, matching the extraction
query's own `ORDER BY ?crateDir`), so a no-op run leaves no diff -- matching this
repo's BLAKE3-receipt discipline (.claude/rules/_core/absolute.md #6).

Usage: python3 packs/workspace-pack/scripts/sync-crates-from-cargo-metadata.py
Run from the repo root (or anywhere -- paths are resolved relative to this file).
"""

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
ONTOLOGY_PATH = REPO_ROOT / "packs" / "workspace-pack" / "ontology.ttl"
INDIVIDUALS_HEADER = "# Individuals — real workspace survey"


def cargo_metadata() -> dict:
    result = subprocess.run(
        ["cargo", "metadata", "--no-deps", "--format-version=1"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def crate_dir_for(manifest_path: str) -> str:
    """Path from repo root to the crate's directory (no trailing Cargo.toml)."""
    manifest = Path(manifest_path)
    crate_dir = manifest.parent
    rel = crate_dir.relative_to(REPO_ROOT)
    return "." if str(rel) == "." else str(rel)


def has_wasm_bindgen(pkg: dict) -> bool:
    return any(dep["name"] == "wasm-bindgen" for dep in pkg.get("dependencies", []))


def has_tests(crate_dir: Path) -> bool:
    if (crate_dir / "tests").is_dir():
        return True
    for rs_file in crate_dir.rglob("*.rs"):
        # Cheap, bounded scan -- top-level src/ only, not the whole tree, to stay fast.
        if "target" in rs_file.parts:
            continue
        try:
            if "#[cfg(test)]" in rs_file.read_text(errors="ignore"):
                return True
        except OSError:
            continue
    return False


def has_readme(crate_dir: Path) -> bool:
    return (crate_dir / "README.md").is_file()


def local_id(package_name: str) -> str:
    """compat:CrateXyz identifier from a Cargo package name."""
    parts = re.split(r"[-_]", package_name)
    return "Crate" + "".join(p.capitalize() for p in parts)


def escape_ttl_string(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def build_individuals_block(members: list[dict]) -> str:
    rows = []
    for pkg in sorted(members, key=lambda p: crate_dir_for(p["manifest_path"])):
        crate_dir = crate_dir_for(pkg["manifest_path"])
        abs_dir = REPO_ROOT / crate_dir if crate_dir != "." else REPO_ROOT
        wasm_bindgen = "true" if has_wasm_bindgen(pkg) else "false"
        tests = "true" if has_tests(abs_dir) else "false"
        readme = "true" if has_readme(abs_dir) else "false"
        description = escape_ttl_string(pkg.get("description") or "")
        cid = local_id(pkg["name"])
        rows.append(
            f'compat:{cid} a compat:WorkspaceCrate ;\n'
            f'    compat:crateDir "{crate_dir}" ;\n'
            f'    compat:packageName "{pkg["name"]}" ;\n'
            f'    compat:description "{description}" ;\n'
            f'    compat:hasWasmBindgen "{wasm_bindgen}" ;\n'
            f'    compat:hasTests "{tests}" ;\n'
            f'    compat:hasReadme "{readme}" .'
        )
    return "\n\n".join(rows) + "\n"


def main() -> int:
    metadata = cargo_metadata()
    workspace_members = set(metadata["workspace_members"])
    members = [
        pkg for pkg in metadata["packages"] if pkg["id"] in workspace_members
    ]
    if not members:
        print("ERROR: cargo metadata returned zero workspace members", file=sys.stderr)
        return 1

    individuals_block = build_individuals_block(members)

    content = ONTOLOGY_PATH.read_text()
    header_idx = content.index(INDIVIDUALS_HEADER)
    # Preserve everything up to and including the "#####...#####" line that closes
    # the header comment block (two lines after INDIVIDUALS_HEADER's own line: the
    # header text line, then the closing "###" fence, then a blank line).
    fence_idx = content.index("\n", content.index("\n", header_idx) + 1)
    preamble = content[: fence_idx + 1]
    # Update the snapshot-date/count comment line in the preamble's header block above,
    # not here -- this script only replaces the individuals; the header prose above it
    # is source-of-truth documentation, edited by hand if the pack's own description
    # of "how this file is maintained" changes.
    new_content = preamble + "\n" + individuals_block

    if new_content == content:
        print(f"No change: {ONTOLOGY_PATH} already matches real cargo metadata ({len(members)} crates).")
        return 0

    ONTOLOGY_PATH.write_text(new_content)
    print(f"Regenerated {len(members)} compat:WorkspaceCrate individuals in {ONTOLOGY_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
