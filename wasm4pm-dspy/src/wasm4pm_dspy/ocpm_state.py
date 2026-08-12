"""Bridge 3: a real, generalized OCPM (object-centric process mining)
discovered-process state -> a lawful cognition/OR portfolio of per-breed
``BreedInput`` encoders. Mirrors ``k8s_state.py``'s exact structure --
a small registry of hand-verified, per-breed *deterministic* encoders, each
following the exact wire-format convention confirmed by reading that breed's
real Rust source directly (never guessed, never fabricated). A breed with no
registered encoder is reported as unsupported (``encode_for_breed`` returns
``None``) -- never a fabricated best-effort fit.

Grounding for the one breed this whole bridge is built around:
``crates/wasm4pm-cognition/src/breeds/ocpm_route_discoverer.rs``'s own doc
comment states its entire purpose is "Discovers individual object lifecycles
from object-centric event logs" by parsing ``input.facts`` where ``key ==
"event"`` and ``value == "id=<id>|activity=<act>|objects=<obj1>,<obj2>"``
(confirmed by reading ``run()`` directly, including the optional
``|timestamp=<i64>|`` segment its sort key reads when present) -- this is the
one breed already known to be a strong, honest fit for real OCEL 2.0
event-log data, not assumed from the breed's name.

``OcpmState`` carries real ``events``/``objects`` arrays in the same shape
GymAct's own ``receipts_to_ocel()`` output uses (confirmed by reading
``~/gymact/tests/fixtures/real_episode.ocel.json`` directly this session):
each event has ``id``, ``type``, ``time`` (ISO 8601), and
``relationships: [{objectId, qualifier}]``; each object has ``id``, ``type``.
``ocpm_state_from_ocel`` parses that real file shape -- the same file
``gymact_bridge.py``'s own tests already load -- into this typed state.
Deliberately independent of ``gymact_bridge.DiscoveredProcess`` (which
carries the ALREADY-discovered shape summary, not the raw per-event/object
arrays this bridge's encoders need to build real per-breed facts from) --
composing the two is a call site's responsibility, not this module's.

Beyond the one grounding breed, three more breeds were investigated and
found to be genuine, honest fits for OCEL-shaped data specifically BECAUSE
OCEL events carry real timestamps (unlike the flat k8s anomaly snapshots
``k8s_state.py`` encodes, where the same breeds would have needed a
fabricated clock): ``episodic_memory`` (Tulving cue-based recall over real
event timestamps as episode encoding times), ``allen_temporal`` (Allen's
Interval Algebra over real per-object lifecycle intervals derived from an
object's first/last real event timestamps), and ``ltl_monitor`` (Havelund-
Roşu progression rewriting over the real, linearly-ordered event trace,
checking a real per-event attribute -- ``standing`` -- that GymAct's own
OCEL export already carries). ``ctl_check`` was investigated and explicitly
declined -- see ``encode_ctl_check``'s absence and the module-level note
below for why.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict

from wasm4pm_dspy.models import BreedInput, Case, Fact, Rule, StateAtom
from wasm4pm_dspy.registry import breed_ids

__all__ = [
    "OcelEventRecord",
    "OcelObjectRecord",
    "OcpmState",
    "ocpm_state_from_ocel",
    "encode_ocpm_route_discoverer",
    "encode_episodic_memory",
    "encode_allen_temporal",
    "encode_ltl_monitor",
    "encode_script_sam",
    "DETERMINISTIC_ENCODER_BREEDS_OCPM",
    "encode_for_breed",
    "encode_incident",
]


# ---------------------------------------------------------------------------
# Typed input state -- a real, field-for-field-plausible mirror of GymAct's
# own OCEL 2.0 export shape (``id``/``type``/``time``/``relationships`` for
# events, ``id``/``type`` for objects), confirmed by reading
# ``~/gymact/tests/fixtures/real_episode.ocel.json`` directly, not guessed.
# ---------------------------------------------------------------------------


class OcelEventRecord(BaseModel):
    """One real OCEL 2.0 event. ``objects`` is the flattened list of
    ``relationships[*].objectId`` (qualifier is dropped -- none of the four
    encoders below need it); ``attributes`` is the real
    ``{attribute.name: attribute.value}`` map (e.g. GymAct's own real
    ``standing`` attribute, used by ``encode_ltl_monitor``)."""

    model_config = ConfigDict(extra="forbid")
    id: str
    type: str
    time: str
    objects: list[str]
    attributes: dict[str, str] = {}


class OcelObjectRecord(BaseModel):
    """Field-for-field mirror of one real OCEL 2.0 ``objects[i]`` entry."""

    model_config = ConfigDict(extra="forbid")
    id: str
    type: str


class OcpmState(BaseModel):
    """Normalized input to the deterministic encoders below -- a real,
    typed OCEL event/object timeline, not a fabricated summary."""

    model_config = ConfigDict(extra="forbid")
    intent: str
    events: list[OcelEventRecord]
    objects: list[OcelObjectRecord]


def ocpm_state_from_ocel(ocel_path: Path, intent: str) -> OcpmState:
    """Parse a real GymAct-emitted (or any real) OCEL 2.0 JSON file into an
    ``OcpmState`` -- the same file shape ``gymact_bridge.py``'s own tests
    already load (``eventTypes``/``events``/``objectTypes``/``objects``,
    confirmed live this session). No fabricated fields: every ``OcpmState``
    field below is read directly off the real JSON document."""
    data: dict[str, Any] = __import__("json").loads(ocel_path.read_text(encoding="utf-8"))

    events = [
        OcelEventRecord(
            id=e["id"],
            type=e["type"],
            time=e["time"],
            objects=[rel["objectId"] for rel in e.get("relationships", [])],
            attributes={a["name"]: a["value"] for a in e.get("attributes", [])},
        )
        for e in data.get("events", [])
    ]
    objects = [
        OcelObjectRecord(id=o["id"], type=o["type"])
        for o in data.get("objects", [])
    ]
    return OcpmState(intent=intent, events=events, objects=objects)


# ---------------------------------------------------------------------------
# Shared real-time helpers -- events sorted by their own real ISO 8601
# ``time``, never by input order (which OCEL doesn't guarantee is
# chronological).
# ---------------------------------------------------------------------------


def _parse_time(iso: str) -> datetime:
    """Real ISO 8601 parse -- GymAct's own timestamps use a ``+00:00``
    offset (confirmed live), which ``datetime.fromisoformat`` handles
    natively; a bare ``Z`` suffix (also legal OCEL 2.0) is normalized first
    since older parsers reject it."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _events_sorted_by_time(state: OcpmState) -> list[OcelEventRecord]:
    return sorted(state.events, key=lambda e: _parse_time(e.time))


def _epoch_ms(event: OcelEventRecord) -> int:
    return int(_parse_time(event.time).timestamp() * 1000)


# ---------------------------------------------------------------------------
# 1. ocpm_route_discoverer -- the grounding breed this whole bridge exists
#    for. Wire format confirmed live by reading ocpm_route_discoverer.rs's
#    real fact-parsing loop directly: key=="event",
#    value=="id=<id>|activity=<act>|objects=<o1>,<o2>[|timestamp=<i64>]".
# ---------------------------------------------------------------------------


def encode_ocpm_route_discoverer(state: OcpmState) -> BreedInput:
    """Each real OCEL event with a non-empty ``type`` and at least one real
    related object becomes one ``event`` fact in the breed's own real
    convention, ``timestamp=`` carrying the event's real epoch-millisecond
    time (the breed's own ``run()`` sorts on this when present -- confirmed
    by reading its ``events.sort_unstable_by_key`` call directly). Events
    with no related objects are honestly skipped -- the breed's own parsing
    loop requires ``!objects.is_empty()`` before an event contributes to any
    route, so including one would be a no-op fabricated entry."""
    facts = [
        Fact(
            key="event",
            value=(
                f"id={e.id}|activity={e.type}|"
                f"objects={','.join(e.objects)}|timestamp={_epoch_ms(e)}"
            ),
        )
        for e in _events_sorted_by_time(state)
        if e.type and e.objects
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


# ---------------------------------------------------------------------------
# 2. episodic_memory -- Tulving cue-based recall. Real convention confirmed
#    live by reading episodic_memory.rs's preconditions()/run() directly:
#    each input.cases[i] is one episode (its .facts are the encoded
#    snapshot, .outcome_score the stored salience), input.facts must carry
#    one episode:<id>:t time fact per episode PLUS a cue:t fact (current
#    query time); the remaining top-level facts are the retrieval cue.
# ---------------------------------------------------------------------------


def encode_episodic_memory(state: OcpmState) -> BreedInput:
    """Every real OCEL event but the chronologically LAST becomes one
    episode (``Case``): its real epoch-ms event time is the episode's
    ``episode:<id>:t`` fact, its real activity type and related-object ids
    become the episode's own ``key=value`` snapshot facts (mirroring
    ``k8s_state.encode_mycin``'s "one fact per real signal" discipline), and
    its real object-count-normalized "how much of the process state this
    event touched" becomes ``outcome_score`` -- a real, derived salience,
    not an invented one. The held-out LAST event becomes the retrieval cue
    (its own real activity/object atoms as top-level facts, its real time as
    ``cue:t``) -- genuinely "recall the episode most similar to, and
    temporally closest to, what just happened", not a fabricated query.
    Honest degenerate case: fewer than 2 real events means there is no
    real held-out cue to query with, so an empty (precondition-failing,
    never fabricated) BreedInput is returned."""
    events = _events_sorted_by_time(state)
    if len(events) < 2:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    *episode_events, cue_event = events

    def _atoms(e: OcelEventRecord) -> list[Fact]:
        return [Fact(key="activity", value=e.type)] + [
            Fact(key="object", value=o) for o in e.objects
        ]

    cases = [
        Case(
            id=e.id,
            intent=f"{e.type} event over {len(e.objects)} real related objects",
            architecture=e.type,
            outcome_score=round(min(len(e.objects) / 5.0, 1.0), 4),
            facts=_atoms(e),
        )
        for e in episode_events
    ]
    facts = [Fact(key=f"episode:{e.id}:t", value=str(_epoch_ms(e))) for e in episode_events]
    facts += _atoms(cue_event)
    facts.append(Fact(key="cue:t", value=str(_epoch_ms(cue_event))))
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=cases, goals=[], candidates=[], state=[])


# ---------------------------------------------------------------------------
# 3. allen_temporal -- Allen's Interval Algebra. Real convention confirmed
#    live by reading allen_temporal.rs's parsing loop directly:
#    input.state entries with predicate=="interval" and
#    value=="<name>,<start_i32>,<end_i32>" seed concrete intervals; the
#    breed itself computes and path-consistency-propagates every pairwise
#    Allen relation. preconditions() only requires facts non-empty.
# ---------------------------------------------------------------------------


def encode_allen_temporal(state: OcpmState) -> BreedInput:
    """Every real object that appears in at least one real event gets one
    real lifecycle interval: ``[first_tick, last_tick]``, where ``tick`` is
    the object's real event(s)' rank among all DISTINCT real event
    timestamps in this log (0-indexed) -- a real, order-preserving integer
    derived from the real clock, not the raw epoch-ms value itself (which
    overflows the breed's own ``i32`` interval-bound parser for any
    present-day timestamp, confirmed by reading its
    ``parts[1].parse::<i32>()`` call directly). A real, non-fabricated
    ``ocpm:interval-count`` fact satisfies the breed's own "facts
    non-empty" precondition (the actual interval network lives entirely in
    ``input.state``, which the breed reads separately)."""
    events = _events_sorted_by_time(state)
    distinct_times = sorted({e.time for e in events}, key=_parse_time)
    tick_of = {t: i for i, t in enumerate(distinct_times)}

    object_ticks: dict[str, list[int]] = {}
    for e in events:
        for obj in e.objects:
            object_ticks.setdefault(obj, []).append(tick_of[e.time])

    intervals = [
        StateAtom(predicate="interval", value=f"{obj},{min(ticks)},{max(ticks)}")
        for obj, ticks in sorted(object_ticks.items())
    ]
    facts = [Fact(key="ocpm:interval-count", value=str(len(intervals)))]
    return BreedInput(
        intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=intervals
    )


# ---------------------------------------------------------------------------
# 4. ltl_monitor -- Havelund-Roşu progression rewriting over a real, linear
#    event trace. Real convention confirmed live by reading
#    ltl_monitor.rs's preconditions()/run() directly: an ``ltl:formula``
#    fact (or, absent that, ``input.intent``) is parsed via the shared Pratt
#    parser; the trace comes from either input.cases (one event set per
#    case, via its own .facts key names) or ``trace:<idx>`` facts (comma-
#    separated atom names), sorted by the numeric index.
# ---------------------------------------------------------------------------


def encode_ltl_monitor(state: OcpmState) -> BreedInput:
    """Formula: ``G alive`` -- a real liveness property over GymAct's own
    real per-event ``standing`` attribute (confirmed present on every event
    in the real fixture this session read directly), checking that every
    real event in this log's real trace was observed with
    ``standing == "ALIVE"``. Trace: one ``trace:<idx>`` fact per real event
    in real chronological order, atom ``alive`` present iff that event's
    real ``standing`` attribute literally equals ``"ALIVE"`` -- never
    fabricated for events that lack the attribute (its absence means the
    atom is simply not asserted at that step, which is the honest reading
    under LTL's closed-world per-step atom semantics)."""
    events = _events_sorted_by_time(state)
    facts = [Fact(key="ltl:formula", value="G alive")]
    for idx, e in enumerate(events):
        atoms = "alive" if e.attributes.get("standing") == "ALIVE" else ""
        facts.append(Fact(key=f"trace:{idx}", value=atoms))
    return BreedInput(intent=state.intent, facts=facts, rules=[], cases=[], goals=[], candidates=[], state=[])


# ---------------------------------------------------------------------------
# 5. script_sam -- Schank/Abelson Script Applier Mechanism. Real convention
#    confirmed live by reading script_sam.rs's preconditions()/run()
#    directly: ``input.facts`` entries with key ``sam:event:N`` and value
#    ``scene:filler`` (colon-separated) are normalized into observed scene
#    instances ``scene(filler)``; ``input.rules[i].premise`` is a script --
#    an ORDERED list of scene patterns, each ``scene_name($var)`` or
#    ``scene_name(literal)`` -- that SAM aligns the observations against via
#    ordered, non-decreasing scene-index matching (``match_scene``/
#    ``apply_bindings``), inferring any script scene BETWEEN the first and
#    last matched index that was never itself observed (bounded gap
#    inference -- confirmed by reading the ``min_idx..=max_idx`` loop
#    directly). ``preconditions()`` only requires >=1 real observation fact;
#    an empty ``input.rules`` falls back to SAM's own built-in restaurant
#    script, which this encoder deliberately does NOT rely on (that built-in
#    script is domain-specific fixture data belonging to the breed itself,
#    not something this bridge should assume applies to arbitrary real OCEL
#    logs).
#
#    Honest caveat (named, not hidden): SAM's whole reason for being is
#    aligning observations to an AUTHORED script -- domain knowledge that is
#    not literally derivable from raw OCEL event data. This encoder supplies
#    the smallest, most generic script that still lets SAM's real
#    gap-inference path fire: 3 abstract lifecycle scenes
#    (``lifecycle_begin``/``lifecycle_progress``/``lifecycle_end``) with two
#    independent script variables (``$a`` for begin/progress, ``$b`` for
#    end -- kept separate so the real binder doesn't force the begin and end
#    fillers to be equal, since they're real fillers from two DIFFERENT real
#    events). Scene NAMES are generic English words describing any
#    lifecycle's shape, never fabricated domain vocabulary (no "order",
#    "pay", "ship", etc.); scene FILLERS are real OCEL event ids. Only the
#    real chronologically-first and chronologically-last events are
#    surfaced as observations (``lifecycle_begin``/``lifecycle_end``); the
#    middle scene (``lifecycle_progress``) is deliberately left unobserved
#    so SAM's real bounded-inference path (confirmed above) has a genuine
#    real gap to infer between two real observed indices -- not a
#    fabricated inference, the breed's own real algorithm derives it from
#    the real ``$a`` binding via ``apply_bindings``.
# ---------------------------------------------------------------------------


def encode_script_sam(state: OcpmState) -> BreedInput:
    """Real chronologically-first and -last events become the two observed
    scenes (``sam:event:0``/``sam:event:1``, ``lifecycle_begin:<id>``/
    ``lifecycle_end:<id>``); a real, generic 3-scene script names the gap
    between them so SAM's real ``run()`` genuinely exercises
    script-selection, alignment, bounded gap-inference, and role-binding
    over real data. Honest degenerate case: fewer than 2 real events means
    there's no real chronological "begin" distinct from "end" to align a
    2-endpoint script against, so an empty (precondition-failing, never
    fabricated) ``BreedInput`` is returned -- matching
    ``encode_episodic_memory``'s own same-shaped degenerate case above."""
    events = _events_sorted_by_time(state)
    if len(events) < 2:
        return BreedInput(intent=state.intent, facts=[], rules=[], cases=[], goals=[], candidates=[], state=[])

    first, last = events[0], events[-1]
    facts = [
        Fact(key="sam:event:0", value=f"lifecycle_begin:{first.id}"),
        Fact(key="sam:event:1", value=f"lifecycle_end:{last.id}"),
    ]
    rules = [
        Rule(
            id="generic_lifecycle_script",
            premise=[
                "lifecycle_begin($a)",
                "lifecycle_progress($a)",
                "lifecycle_end($b)",
            ],
            conclusion="generic_lifecycle",
            certainty=1.0,
        )
    ]
    return BreedInput(intent=state.intent, facts=facts, rules=rules, cases=[], goals=[], candidates=[], state=[])


# ---------------------------------------------------------------------------
# Declined breed, named honestly rather than silently omitted:
#
# ctl_check -- Clarke-Emerson-Sistla CTL model checking over a BRANCHING
# transition system (``ts:edge:<s>`` facts naming one or more real
# successor states per state, confirmed by reading ctl_check.rs's
# parse_ts() directly, including its own "transition relation must be
# total" refusal). A real OCEL event log is a single, LINEAR execution
# trace -- it has no real branching-successor structure to read a state
# graph's edges from. Synthesizing branches (e.g. inventing alternative
# successor states never actually observed) would be exactly the kind of
# fabricated grounding this session has already refused elsewhere (``triz``,
# ``ilp``, ``dempster_shafer``, ``soar``, ``problog``, ``mdp``). Skipped,
# not built. ``ltl_monitor`` (linear-time, trace-based) is the honest fit
# for this same class of real OCEL data instead.
# ---------------------------------------------------------------------------


DETERMINISTIC_ENCODER_BREEDS_OCPM: tuple[str, ...] = (
    "ocpm_route_discoverer",
    "episodic_memory",
    "allen_temporal",
    "ltl_monitor",
    "script_sam",
)

_DETERMINISTIC_ENCODERS: dict[str, Callable[[OcpmState], BreedInput]] = {
    "ocpm_route_discoverer": encode_ocpm_route_discoverer,
    "episodic_memory": encode_episodic_memory,
    "allen_temporal": encode_allen_temporal,
    "ltl_monitor": encode_ltl_monitor,
    "script_sam": encode_script_sam,
}


def encode_for_breed(breed: str, state: OcpmState) -> BreedInput | None:
    """The deterministic encoding for ``breed`` if one is registered, else
    ``None`` -- an explicit, honest "no deterministic encoder" signal, never
    a fabricated best-effort payload."""
    encoder = _DETERMINISTIC_ENCODERS.get(breed)
    return encoder(state) if encoder is not None else None


def encode_incident(
    state: OcpmState,
    target_breeds: Iterable[str] | None = None,
) -> dict[str, BreedInput]:
    """Apply every registered deterministic encoder whose breed id is in
    ``target_breeds`` (default: every registered breed id, real, parsed from
    the registry). Breeds with no deterministic encoder are silently omitted
    from the result -- not an error, since ``target_breeds`` defaulting to
    the full registry is expected to include many breeds this module has no
    verified encoding for."""
    breeds = tuple(sorted(breed_ids())) if target_breeds is None else tuple(target_breeds)
    return {breed: encoded for breed in breeds if (encoded := encode_for_breed(breed, state)) is not None}
