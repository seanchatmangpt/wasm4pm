"""Bridge 6 -- an admitted candidate to a real ggen manufacture PROPOSAL, never
an execution. Mirrors ``admission.py``'s ``authority == "SELECT_ONLY"``
convention and ``autonomic.py``'s ``propose_escalate``-only discipline: this
module reports what a real ``ggen sync`` run WOULD manufacture and the exact
command a human would run to actually do it. It never invokes ``ggen sync``
(without ``--dry-run``), ``just ggen-gate``, or any command that mutates
repo source.

Two real, complementary ways to answer "what would ggen manufacture,"
kept side by side deliberately:

- ``propose_manufacture`` / ``check_current_generation_freshness``: parse
  ``ggen.toml`` (the repo's real ggen manifest) directly with ``tomllib``.
  No subprocess, no real ``ggen`` binary required -- lighter-weight, works
  even when ``ggen`` isn't built/on PATH, but only reports the *declared*
  rule set and on-disk existence, not what the real pipeline would actually
  do (skip vs. write, current graph hash).
- ``run_real_dry_run``: shells out to the real ``ggen sync run --dry-run``
  subprocess (confirmed real, safe, and side-effect-free by reading
  ``~/ggen/crates/ggen-engine/src/sync.rs`` and its
  ``dry_run_writes_nothing()`` test) and parses its real structured
  ``--format json`` output. This is authoritative -- it runs the real
  five-stage pipeline (resolve/enrich/extract/render) and reports the
  engine's own real per-file decision -- but requires a real, runnable
  ``ggen`` binary, and honestly surfaces a real pipeline failure (e.g. a
  real ``ggen.toml`` validation error) rather than fabricating a result.

The real, authoritative list of regenerated output files parsed by
``propose_manufacture`` comes from ``ggen.toml`` with ``tomllib`` -- never
hand-retyped here, so this module cannot silently drift from the manifest it
describes.

Per ``AGENTS.md``'s "Generated cognition surfaces" section (root
``AGENTS.md``, search "Generated cognition surfaces"): the documented human
workflow is "Change the admitted source in ``ggen/ontology/breeds.ttl``, run
``ggen sync``, and validate with ``just ggen-gate``". ``ggen.toml`` has no
partial-regeneration mechanism -- every active (uncommented)
``[[generation.rules]]`` block's ``output_file`` is subject to full
``Overwrite``/``Create`` on every ``ggen sync``, so ``affected_generation_rules``
below always lists the complete active set, honestly, rather than inventing a
finer-grained delta this repo's config does not actually have.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tomllib
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "GGEN_TOML_PATH",
    "ManufactureProposal",
    "propose_manufacture",
    "check_current_generation_freshness",
    "GgenUnavailable",
    "GgenDryRunFailed",
    "RealDryRunResult",
    "run_real_dry_run",
]

# Repo root is two levels up from this file: wasm4pm-dspy/src/wasm4pm_dspy/ -> wasm4pm/
_REPO_ROOT = Path(__file__).resolve().parents[3]
GGEN_TOML_PATH = _REPO_ROOT / "ggen.toml"

_HUMAN_COMMAND = (
    "Change the admitted source in `ggen/ontology/breeds.ttl`, run `ggen sync`, "
    "and validate with `just ggen-gate`."
)


@dataclass(frozen=True)
class ManufactureProposal:
    """A read-only proposal describing what a real ``ggen sync`` would
    manufacture. Never executed by this module -- ``authority`` mirrors
    ``admission.py``'s ``AdmittedBreedInput.authority`` convention so callers
    can pattern-match "this is a proposal, not an action" the same way."""

    ontology_delta_description: str
    affected_generation_rules: list[str]
    human_command: str
    authority: str = "PROPOSE_ONLY"


def _extract_output_files(ggen_toml_path: Path) -> list[str]:
    """Parse the real ``ggen.toml`` and return every active (uncommented)
    ``[[generation.rules]]`` block's ``output_file``, in file order."""
    with ggen_toml_path.open("rb") as f:
        manifest = tomllib.load(f)

    generation = manifest.get("generation")
    if not isinstance(generation, dict):
        return []

    rules = generation.get("rules")
    if not isinstance(rules, list):
        return []

    output_files: list[str] = []
    for rule in rules:
        output_file = rule.get("output_file") if isinstance(rule, dict) else None
        if isinstance(output_file, str) and output_file:
            output_files.append(output_file)
    return output_files


def propose_manufacture(
    ontology_delta_description: str,
    ggen_toml_path: Path = GGEN_TOML_PATH,
) -> ManufactureProposal:
    """Build a real, non-executing manufacture proposal for an admitted
    candidate's implied ontology change.

    ``ggen.toml`` currently has no partial-regeneration mechanism: a real
    ``ggen sync`` overwrites every active rule's ``output_file`` regardless of
    which part of the ontology changed. ``affected_generation_rules`` reflects
    that honestly -- it is always the complete active set, not a computed
    delta.
    """
    affected = _extract_output_files(ggen_toml_path)
    return ManufactureProposal(
        ontology_delta_description=ontology_delta_description,
        affected_generation_rules=affected,
        human_command=_HUMAN_COMMAND,
    )


def check_current_generation_freshness(
    ggen_toml_path: Path = GGEN_TOML_PATH,
    repo_root: Path = _REPO_ROOT,
) -> dict[str, bool]:
    """Real, read-only existence check for every active ``output_file`` in
    ``ggen.toml``: ``True`` if the file currently exists on disk relative to
    the repo root, ``False`` otherwise.

    This is deliberately shallow -- it reports existence, not real
    ontology-vs-output drift. Computing real drift would mean reimplementing
    ggen's own diffing logic, which this module does not do; a ``False``
    entry means "missing," not "stale," and a ``True`` entry means "present,"
    not "up to date." Use ``just ggen-gate`` (a human action, per
    ``AGENTS.md``) for a real freshness/correctness verdict.
    """
    output_files = _extract_output_files(ggen_toml_path)
    return {output_file: (repo_root / output_file).is_file() for output_file in output_files}


class GgenUnavailable(RuntimeError):
    """Raised when no real ``ggen`` binary can be located -- callers should
    skip, never fabricate a dry-run result. Same honest-degrade convention as
    ``wasm4pm_dspy.gymact_bridge.GymActBridgeUnavailable``."""


class GgenDryRunFailed(RuntimeError):
    """Raised when a real ``ggen`` binary was found and a real
    ``ggen sync run --dry-run`` subprocess was actually invoked, but the
    pipeline itself reported a real failure (e.g. a real ``ggen.toml``
    validation error) rather than a dry-run plan. Distinct from
    ``GgenUnavailable`` -- this means the binary IS available and WAS run;
    the real command's own real stdout/stderr are carried verbatim so the
    caller can see exactly what the real pipeline said, never bucketed into
    a vaguer "unavailable" bin."""


@dataclass(frozen=True)
class RealDryRunResult:
    """Real, typed result of a real ``ggen sync run --dry-run --format json``
    subprocess invocation -- never fabricated. Field names/shapes mirror
    ``~/ggen/crates/ggen-mcp/src/tools/sync_dry_run.rs``'s
    ``SyncDryRunResult`` (``would_write``/``would_skip``/``graph_hash``),
    the target parse contract for this module, though this CLI-facing
    result flattens each entry to its output path string (the CLI's real
    ``--format json`` output for ``sync run`` is the engine's raw
    ``decisions`` map of ``path -> decision string``, not the MCP tool's
    richer per-entry struct -- classifying write vs. skip is done here from
    the real ``decision`` string the same way the MCP tool's
    ``skip_classify`` does, by checking for a leading ``"skipped"``)."""

    would_write: list[str]
    would_skip: list[str]
    graph_hash: str | None
    raw_stdout: str


def _resolve_ggen_binary() -> str:
    """Real ``PATH``/known-location lookup for a runnable ``ggen`` binary.
    Raises ``GgenUnavailable`` (never fabricates a path) if none is found."""
    found = shutil.which("ggen")
    if found:
        return found

    for candidate in (
        Path.home() / "ggen" / "target" / "release" / "ggen",
        Path.home() / "ggen" / "target" / "debug" / "ggen",
    ):
        if candidate.is_file():
            return str(candidate)

    raise GgenUnavailable(
        "no real `ggen` binary found on PATH or under ~/ggen/target/{release,debug}/ggen"
    )


def run_real_dry_run(
    ontology_project_dir: Path = _REPO_ROOT,
    *,
    timeout_s: float = 60.0,
) -> RealDryRunResult:
    """Shell out to the real ``ggen sync run --dry-run --format json``
    subprocess from ``ontology_project_dir`` (default: wasm4pm's own repo
    root, where its real ``ggen.toml`` lives) and parse its real structured
    output.

    ``--dry-run`` is confirmed real, safe, and side-effect-free by reading
    ``~/ggen/crates/ggen-engine/src/sync.rs:1729-1766`` and its test
    ``~/ggen/crates/ggen-engine/tests/sync_e2e.rs:92-116``
    (``dry_run_writes_nothing()`` -- asserts no file written, no receipt
    emitted). This function never passes any other subcommand and never
    omits ``--dry-run``.

    Raises ``GgenUnavailable`` if no real ``ggen`` binary can be found.
    Raises ``GgenDryRunFailed`` if the binary runs but the real pipeline
    itself reports a real failure (its own real stdout/stderr are carried
    verbatim in the exception, never converted into a fabricated empty
    result).
    """
    ggen_bin = _resolve_ggen_binary()

    try:
        proc = subprocess.run(
            [ggen_bin, "sync", "run", "--dry-run", "--format", "json"],
            cwd=str(ontology_project_dir),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired as exc:
        raise GgenDryRunFailed(
            f"real `ggen sync run --dry-run` timed out after {timeout_s}s: {exc}"
        ) from exc

    if proc.returncode != 0:
        raise GgenDryRunFailed(
            f"real `ggen sync run --dry-run` exited {proc.returncode}: "
            f"stdout={proc.stdout.strip()!r} stderr={proc.stderr.strip()!r}"
        )

    try:
        body = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise GgenDryRunFailed(
            f"real `ggen sync run --dry-run` produced non-JSON stdout: {exc}; "
            f"raw stdout={proc.stdout.strip()!r}"
        ) from exc

    decisions = body.get("decisions", {})
    if not isinstance(decisions, dict):
        raise GgenDryRunFailed(
            f"real `ggen sync run --dry-run --format json` output had no `decisions` "
            f"map (unexpected real shape): {body!r}"
        )

    would_write: list[str] = []
    would_skip: list[str] = []
    for path, decision in decisions.items():
        if isinstance(decision, str) and decision.startswith("skipped"):
            would_skip.append(path)
        else:
            would_write.append(path)

    graph_hash = body.get("graph_hash_hex") or body.get("graph_hash")
    graph_hash = graph_hash if isinstance(graph_hash, str) else None

    return RealDryRunResult(
        would_write=would_write,
        would_skip=would_skip,
        graph_hash=graph_hash,
        raw_stdout=proc.stdout,
    )
