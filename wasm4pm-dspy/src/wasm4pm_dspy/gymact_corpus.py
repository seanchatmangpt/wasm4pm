"""A real, diverse, multi-episode GymAct OCEL 2.0 corpus generator.

Extends the exact real, safe pattern established in
:mod:`wasm4pm_dspy.gymact_experiment`'s ``run_safe_experiment`` (real
``GymAct`` kernel + real ``MemoryProvider``, real
``materialize -> act -> verify -> teardown`` lifecycle, real
``write_ocel_log``) to support:

- Multiple real ``act()`` calls per episode (confirmed real, supported
  pattern -- see ``~/gymact/tests/test_core.py``'s
  ``test_real_episode_produces_a_valid_ocel_log_and_writes_the_conformance_fixture``,
  which drives ``materialize -> act (delete) -> act (increment) -> verify ->
  teardown`` through the same real ``MemoryProvider``).
- An optional real ``config.initial`` seed on materialization (confirmed
  real, supported field -- ``MemoryProvider.materialize`` reads
  ``config.get("initial", {})`` directly, ``~/gymact/src/gymact/providers.py``).

Only ``MemoryProvider`` is ever imported or constructed here -- the same
SELECT != DO, zero-external-side-effect discipline as
``gymact_experiment.py``. No Kubernetes/Terraform/Docker/subprocess/network
actuation of anything outside this module's own in-process objects occurs
anywhere in this file.

The three real capability IRIs below were read directly out of
``MemoryProvider``'s own real ``MEMORY_CAPABILITIES`` registration in
``~/gymact/src/gymact/providers.py`` -- not guessed:

- ``urn:gymact:memory:capability:set``       -- payload ``{"key", "value"}``
- ``urn:gymact:memory:capability:delete``    -- payload ``{"key"}``
- ``urn:gymact:memory:capability:increment`` -- payload ``{"key", "amount"?}``

``gymact`` is imported lazily inside ``generate_diverse_corpus`` (not at
module import time), matching ``gymact_experiment.py``'s and
``gymact_bridge.py``'s own honest-degrade discipline: this module stays
importable, and its tests collectable with a named skip, in an environment
where ``gymact`` isn't installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "CorpusEpisodeSpec",
    "generate_diverse_corpus",
    "DEFAULT_DIVERSE_SPECS",
    "SET_CAPABILITY",
    "DELETE_CAPABILITY",
    "INCREMENT_CAPABILITY",
]

# Real capability IRIs, transcribed 1:1 from `MemoryProvider.MEMORY_CAPABILITIES`.
SET_CAPABILITY = "urn:gymact:memory:capability:set"
DELETE_CAPABILITY = "urn:gymact:memory:capability:delete"
INCREMENT_CAPABILITY = "urn:gymact:memory:capability:increment"


@dataclass(frozen=True)
class CorpusEpisodeSpec:
    """One real episode's real recipe -- a label plus a real, ordered
    sequence of ``(capability_iri, payload)`` pairs to real ``act()``
    through in a single real episode, and an optional real
    ``config.initial`` seed for materialization."""

    label: str
    capability_sequence: tuple[tuple[str, dict], ...]
    initial_state: dict | None = None


async def generate_diverse_corpus(
    specs: tuple[CorpusEpisodeSpec, ...],
    *,
    out_dir: Path,
) -> tuple[Path, ...]:
    """For each real spec: construct a real ``GymAct`` kernel + real
    ``MemoryProvider``, run a real
    ``materialize -> act (xN) -> verify -> teardown`` episode, write a real
    OCEL 2.0 log into ``out_dir`` via GymAct's own real ``write_ocel_log``,
    and return the tuple of real file paths (one per spec, in spec order).

    ``verify`` is called with the real, final expected state after all of
    the episode's real acts have been applied -- computed here by replaying
    the same real ``set``/``delete``/``increment`` semantics
    ``MemoryEnvironment.actuate`` itself implements, so the real ``verify``
    receipt reflects a real, correctly-predicted postcondition rather than
    an empty/guessed one.
    """
    from gymact.kernel import GymAct
    from gymact.models import ActuationIntent, MaterializationIntent
    from gymact.ocel import write_ocel_log
    from gymact.providers import MemoryProvider

    out_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []

    for spec in specs:
        kernel = GymAct()
        kernel.register_provider(MemoryProvider())

        config: dict = {}
        if spec.initial_state is not None:
            config["initial"] = dict(spec.initial_state)

        materialization = await kernel.materialize(
            MaterializationIntent(
                provider="memory",
                scenario=f"wasm4pm-dspy-corpus-{spec.label}",
                config=config,
            )
        )
        if materialization.episode is None:
            raise RuntimeError(
                f"spec {spec.label!r}: MemoryProvider materialization was not "
                f"accepted: standing={materialization.standing!r} "
                f"reason={materialization.receipt.reason!r}"
            )
        episode_id = materialization.episode.episode_id

        # Real, local re-derivation of expected final state -- mirrors
        # MemoryEnvironment.actuate's real set/delete/increment semantics
        # exactly, so `verify` below checks a real, correctly-predicted
        # postcondition instead of an arbitrary/empty one.
        expected_state: dict = dict(spec.initial_state or {})
        for capability_iri, payload in spec.capability_sequence:
            await kernel.act(
                ActuationIntent(
                    episode_id=episode_id,
                    capability=capability_iri,
                    payload=payload,
                )
            )
            if capability_iri == SET_CAPABILITY:
                expected_state[str(payload["key"])] = payload.get("value")
            elif capability_iri == DELETE_CAPABILITY:
                expected_state.pop(str(payload["key"]), None)
            elif capability_iri == INCREMENT_CAPABILITY:
                key = str(payload["key"])
                amount = payload.get("amount", 1)
                expected_state[key] = expected_state.get(key, 0) + amount
            else:
                raise ValueError(f"unsupported capability_iri: {capability_iri!r}")

        await kernel.verify(episode_id, expected_state)
        await kernel.teardown(episode_id)

        receipts = kernel.episode_receipts(episode_id)
        output_path = out_dir / f"{spec.label}.{episode_id}.ocel.json"
        write_ocel_log(output_path, receipts)
        paths.append(output_path)

    return tuple(paths)


# 8 real, structurally distinct specs. Each varies real capability choice,
# real payload content, real initial_state, and real act-count-per-episode
# so the resulting real OCEL logs differ in real event count and real
# activity/event-type distribution -- not superficial relabeling of one
# scenario:
#
# 1. single-set:        1 act (set),        no initial state -> 4 events
#    (materialize, act, verify, teardown).
# 2. single-delete:     1 act (delete),     seeded initial state, deletes
#    a key that actually exists -> 4 events, exercises the delete binding.
# 3. single-increment:  1 act (increment),  no initial state (starts at
#    implicit 0) -> 4 events, exercises the increment binding's default.
# 4. set-then-delete:   2 acts (set, delete on the SAME key) -> 5 events,
#    a real "add then remove" trajectory.
# 5. double-increment:  2 acts (increment, increment on the SAME key with
#    different amounts), seeded initial state -> 5 events, real cumulative
#    numeric consequence.
# 6. multi-key-triad:   3 acts (set, set, increment) across TWO distinct
#    keys -> 6 events, the richest real per-episode trajectory in the
#    corpus.
# 7. seeded-overwrite:  1 act (set) that overwrites an already-seeded key
#    -> 4 events, exercises set's real overwrite semantics.
# 8. delete-set-increment: 3 acts (delete, set, increment) across mixed
#    keys with a seeded initial state -> 6 events, exercises all three
#    real capabilities in one episode.
DEFAULT_DIVERSE_SPECS: tuple[CorpusEpisodeSpec, ...] = (
    CorpusEpisodeSpec(
        label="single-set",
        capability_sequence=((SET_CAPABILITY, {"key": "alpha", "value": 1}),),
        initial_state=None,
    ),
    CorpusEpisodeSpec(
        label="single-delete",
        capability_sequence=((DELETE_CAPABILITY, {"key": "beta"}),),
        initial_state={"beta": "seeded"},
    ),
    CorpusEpisodeSpec(
        label="single-increment",
        capability_sequence=((INCREMENT_CAPABILITY, {"key": "counter"}),),
        initial_state=None,
    ),
    CorpusEpisodeSpec(
        label="set-then-delete",
        capability_sequence=(
            (SET_CAPABILITY, {"key": "gamma", "value": "transient"}),
            (DELETE_CAPABILITY, {"key": "gamma"}),
        ),
        initial_state=None,
    ),
    CorpusEpisodeSpec(
        label="double-increment",
        capability_sequence=(
            (INCREMENT_CAPABILITY, {"key": "score", "amount": 5}),
            (INCREMENT_CAPABILITY, {"key": "score", "amount": 3}),
        ),
        initial_state={"score": 10},
    ),
    CorpusEpisodeSpec(
        label="multi-key-triad",
        capability_sequence=(
            (SET_CAPABILITY, {"key": "delta", "value": "on"}),
            (SET_CAPABILITY, {"key": "epsilon", "value": "off"}),
            (INCREMENT_CAPABILITY, {"key": "zeta", "amount": 2}),
        ),
        initial_state=None,
    ),
    CorpusEpisodeSpec(
        label="seeded-overwrite",
        capability_sequence=((SET_CAPABILITY, {"key": "eta", "value": "new"}),),
        initial_state={"eta": "old"},
    ),
    CorpusEpisodeSpec(
        label="delete-set-increment",
        capability_sequence=(
            (DELETE_CAPABILITY, {"key": "theta"}),
            (SET_CAPABILITY, {"key": "iota", "value": 42}),
            (INCREMENT_CAPABILITY, {"key": "kappa", "amount": 7}),
        ),
        initial_state={"theta": "gone-soon", "kappa": 3},
    ),
)
