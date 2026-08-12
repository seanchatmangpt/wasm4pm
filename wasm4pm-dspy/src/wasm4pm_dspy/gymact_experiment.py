"""Bridge 4 (candidate -> a SAFE, in-memory-only GymAct experiment) +
Bridge 5 (that experiment's consequence -> wasm4pm re-discovery/comparison).

Grounded directly in real, already-existing machinery, confirmed live this
session by reading source, not assumed:

- ``~/gymact/src/gymact/providers.py``'s real ``MemoryProvider`` /
  ``MemoryEnvironment`` -- pure in-process Python dict state, zero external
  side effects (no subprocess, no network, no filesystem mutation outside
  GymAct's own receipt/OCEL export). This module NEVER imports, constructs,
  or calls any other provider (no Kubernetes, Terraform, Docker,
  ``gymnasium.Env``, ``fastmcp.Client``, or ``inspect-ai`` path exists here).
- ``~/gymact/src/gymact/kernel.py``'s real ``GymAct`` orchestrator --
  ``materialize`` / ``act`` / ``verify`` / ``teardown``, each producing a
  real, hash-chained ``Receipt``. ``MemoryEnvironment.requires_authority``
  defaults to ``False`` (confirmed live in ``providers.py``), so a default
  ``GymAct()`` (fail-closed ``DenyAuthorityResolver``) admits every
  operation in this module's episodes without ever exercising a real
  external authority system -- no authority resolver override is needed or
  used here.
- ``~/gymact/src/gymact/ocel.py``'s real ``receipts_to_ocel`` /
  ``write_ocel_log`` -- this module calls GymAct's own OCEL export
  unmodified; no parallel event representation is built here.
- :mod:`wasm4pm_dspy.gymact_bridge`'s real
  ``discover_process_from_gymact_ocel`` -- reused unchanged for Bridge 5;
  not reimplemented.

This is a PROPOSE-shaped module in the same sense as
:mod:`wasm4pm_dspy.autonomic`'s ``propose_escalate``: ``ExperimentProposal``
is a typed proposal a caller constructs (the proposer itself is out of
scope here). ``run_safe_experiment`` is the one place a proposal is ever
turned into action -- and that action is bounded, by construction, to a
real but consequence-free-on-the-outside-world ``MemoryProvider`` episode.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from wasm4pm_dspy.gymact_bridge import DiscoveredProcess, discover_process_from_gymact_ocel

__all__ = [
    "ExperimentProposal",
    "ExperimentComparison",
    "run_safe_experiment",
    "compare_pre_post_experiment",
]


@dataclass(frozen=True)
class ExperimentProposal:
    """A PROPOSAL only -- produced by a caller, not this module. Naming
    mirrors GymAct's own real ``ActuationIntent`` fields (``capability``,
    ``payload``) plus a ``rationale`` for why this experiment is worth
    running, same SELECT != DO discipline as
    :mod:`wasm4pm_dspy.autonomic`'s ``propose_escalate``: this dataclass
    carries a decision to try something, never the trying itself."""

    capability_iri: str
    payload: dict
    rationale: str


@dataclass(frozen=True)
class ExperimentComparison:
    """Real, computed diff between a pre- and post-experiment discovered
    process -- never narrated. ``node_count_delta``/``edge_count_delta``
    are ``post - pre``, straight subtraction over
    :class:`~wasm4pm_dspy.gymact_bridge.DiscoveredProcess`'s own real
    ``node_count``/``edge_count`` fields."""

    pre: DiscoveredProcess
    post: DiscoveredProcess
    node_count_delta: int
    edge_count_delta: int


async def run_safe_experiment(
    proposal: ExperimentProposal,
    *,
    episode_scenario: str = "wasm4pm-dspy-bridge-experiment",
) -> Path:
    """Bridge 4: candidate -> real (but safe, in-memory, consequence-free-
    on-the-outside-world) GymAct experiment -> real OCEL evidence on disk.

    Constructs a real ``GymAct`` kernel with ``MemoryProvider`` registered
    as its only provider, runs one real episode end-to-end (materialize ->
    act using ``proposal.capability_iri``/``proposal.payload`` -> verify ->
    teardown), then calls GymAct's own real ``write_ocel_log`` (built from
    ``receipts_to_ocel`` over the episode's real accumulated receipts) to
    persist a real, schema-validated OCEL 2.0 log and returns its path.

    Only ``MemoryProvider`` is ever imported or constructed here. No
    Kubernetes/Terraform/Docker/subprocess/network actuation of anything
    outside this repo's own in-process objects occurs anywhere in this
    function.

    ``gymact`` is imported lazily here (not at module import time) so that
    this module remains importable -- and its tests collectable, with an
    honest skip -- in an environment where ``gymact`` isn't installed,
    matching :mod:`wasm4pm_dspy.gymact_bridge`'s own honest-degrade
    discipline for its native-binding import.
    """
    from gymact.kernel import GymAct
    from gymact.models import ActuationIntent, MaterializationIntent
    from gymact.ocel import write_ocel_log
    from gymact.providers import MemoryProvider

    kernel = GymAct()
    kernel.register_provider(MemoryProvider())

    materialization = await kernel.materialize(
        MaterializationIntent(provider="memory", scenario=episode_scenario)
    )
    if materialization.episode is None:
        raise RuntimeError(
            f"MemoryProvider materialization was not accepted: "
            f"standing={materialization.standing!r} reason={materialization.receipt.reason!r}"
        )
    episode_id = materialization.episode.episode_id

    await kernel.act(
        ActuationIntent(
            episode_id=episode_id,
            capability=proposal.capability_iri,
            payload=proposal.payload,
        )
    )
    await kernel.verify(episode_id, proposal.payload)
    await kernel.teardown(episode_id)

    receipts = kernel.episode_receipts(episode_id)
    output_dir = Path.home() / ".wasm4pm-dspy" / "gymact-experiments"
    output_path = output_dir / f"{episode_id}.ocel.json"
    write_ocel_log(output_path, receipts)
    return output_path


async def compare_pre_post_experiment(
    pre_ocel_path: Path, post_ocel_path: Path
) -> ExperimentComparison:
    """Bridge 5: safe experiment's consequence -> wasm4pm re-discovery and
    comparison. Reuses
    :func:`wasm4pm_dspy.gymact_bridge.discover_process_from_gymact_ocel`
    unchanged on both logs; returns a real, computed diff."""
    pre = await discover_process_from_gymact_ocel(pre_ocel_path)
    post = await discover_process_from_gymact_ocel(post_ocel_path)
    return ExperimentComparison(
        pre=pre,
        post=post,
        node_count_delta=post.node_count - pre.node_count,
        edge_count_delta=post.edge_count - pre.edge_count,
    )
