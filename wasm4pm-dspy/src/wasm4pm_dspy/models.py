"""The one BreedInput schema, as real Pydantic models -- single source of truth
shared by the DSPy signature (typed output field, no JSON-string blob) and the
admission gate (real validation, not hand-rolled ``isinstance`` checks
duplicating the same shape in prose). Zero ``dspy`` import: Pydantic is a
schema library, not an LM dependency, so this module stays importable by
``admission.py`` without pulling in DSPy.

Field shapes confirmed against the real Rust structs in
``crates/wasm4pm-cognition/src/breeds/mod.rs`` (``Fact``, ``Rule``, ``Goal``,
``Case``, ``Candidate``, ``BreedInput``) -- not the wasm4pm-dspy author's
guess, and not just the TS fixtures (which happened to omit
``Candidate.elimination_reason``, caught by reading the Rust source directly).
None of ``BreedInput``'s fields carry ``#[serde(default)]`` in Rust, which
means serde treats them as genuinely required on deserialization -- a
candidate missing e.g. ``goals`` entirely, not just an empty ``goals: []``,
must fail admission. ``candidates``' ``{id, score, eliminated,
elimination_reason}`` shape includes the ``Option<String>`` field serde treats
as omittable-defaults-to-None. ``state``'s element type, ``StateAtom``, has no
populated example in wasm4pm's own TS fixtures, but its Rust definition
(``pub struct StateAtom { predicate: String, value: String }``,
``crates/wasm4pm-cognition/src/breeds/mod.rs``) was findable directly and is
used here verbatim -- an earlier ``list[dict[str, str]]`` placeholder was
wrong for a different reason too, not just "unconfirmed": any open-ended
``dict``-shaped field (using ``additionalProperties`` instead of explicit
``properties``) is incompatible with the strict JSON-schema mode DSPy's Groq
adapter enforces -- a real live call this session failed with "'required'
present but 'properties' is missing" even after giving the dict's values a
concrete type, because DSPy still injects a ``required`` key onto a schema
with no declared ``properties`` at all. A named model with real fields is
required here regardless of whether the shape happens to be confirmed.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "Fact", "Rule", "Goal", "Case", "Candidate", "StateAtom", "BreedInput",
    "terminal_conclusions", "unresolvable_premises",
]


class Fact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    value: str


class StateAtom(BaseModel):
    model_config = ConfigDict(extra="forbid")
    predicate: str
    value: str


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    premise: list[str]
    conclusion: str
    certainty: float = Field(ge=0.0, le=1.0)


class Goal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    predicate: str
    value: str


class Case(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    intent: str
    architecture: str
    outcome_score: float
    facts: list[Fact]  # required in Rust -- no #[serde(default)]


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    score: float
    eliminated: bool
    elimination_reason: str | None = None  # Rust Option<String> -- serde omits-defaults-to-None


class BreedInput(BaseModel):
    """Mirrors the real Rust ``BreedInput`` struct exactly: every list field is
    required (no default -- a missing field must fail validation, matching
    serde's behavior with no ``#[serde(default)]``), and ``extra="forbid"``
    rejects anything the LM invents outside this schema."""

    model_config = ConfigDict(extra="forbid")
    intent: str
    facts: list[Fact]
    rules: list[Rule]
    cases: list[Case]
    goals: list[Goal]
    candidates: list[Candidate]
    state: list[StateAtom]


def terminal_conclusions(breed_input: BreedInput) -> list[str]:
    """Which rule conclusions in ``breed_input`` would be "terminal" -- not
    itself used as any other rule's premise -- under wasm4pm's real MYCIN/
    rule-chaining selection algorithm (``crates/wasm4pm-cognition/src/breeds/
    production_rules.rs::run``, confirmed live this session by reading its
    source): ``selected`` is chosen as the highest-CF conclusion among
    terminals, never simply the highest-CF conclusion overall.

    This is a real, deterministic, pure computation -- not an LM guess --
    attached to :class:`~wasm4pm_dspy.program.BreedSelectionProgram`'s
    prediction as a real diagnostic field for a caller to inspect, not fed
    back into a second LM call (see that module's docstring for why the
    propose-only pipeline has no critique/repair stage).

    This is a conservative static approximation of the Rust engine's runtime
    behavior: Rust only marks a premise "consumed" by rules that actually
    fired (order-dependent, since firing stops once no more rules are
    applicable), while this function treats every rule's ``premise`` entries
    as consumed unconditionally. For a well-formed, fully-connected rule
    graph (the only kind admission should be encouraging) the two coincide;
    a rule graph with unreachable/never-firing rules could see this function
    under-report terminals relative to a real run. Named here as an honest
    limitation, not silently claimed as identical to the Rust runtime.
    """
    derived = {r.conclusion for r in breed_input.rules}
    consumed = {p for r in breed_input.rules for p in r.premise}
    return sorted(derived - consumed)


def unresolvable_premises(breed_input: BreedInput) -> list[str]:
    """Which rule ``premise`` strings can *never* match anything in the real
    Rust working-memory, confirmed by reading ``Mycin::run`` directly
    (``crates/wasm4pm-cognition/src/breeds/production_rules.rs``): working
    memory is seeded as ``f"{fact.key}={fact.value}"`` (NO spaces around
    ``=``) and ``fact.value`` alone, both at CF 1.0; a fired rule's
    ``conclusion`` string is later inserted verbatim as its own key.
    ``premise_satisfied`` looks up a premise string by exact equality against
    those keys -- no normalization, no trimming.

    A premise that matches neither any fact-derived key/value nor any rule's
    ``conclusion`` string can never be satisfied by any real run, regardless
    of rule firing order -- this is the exact, real failure mode confirmed
    live this session against two different models: a weak model omitted
    "bacterial_culture" as a fact entirely, and a stronger model wrote
    ``"gram_stain = gram_positive"`` (spaces around ``=``) when the working
    memory only ever contains ``"gram_stain=gram_positive"`` (no spaces).
    Both produced a real, live ``EXECUTION_ERROR: postcondition failed: empty
    inference trace (fraud signal)`` from the real engine -- this function
    exists to catch that class of failure before a run is ever attempted,
    not to guess at it.

    Deliberately conservative, same honest limitation as
    :func:`terminal_conclusions`: this is a flat reachability check (any
    premise matching *some* conclusion counts as resolvable), not a
    fixed-point simulation of firing order/CF-threshold propagation -- a
    premise that only resolves via a conclusion that itself can never fire
    (chained unresolvability) will not be flagged by this function. Named
    here as an honest limitation, not silently claimed as a complete
    simulation of the Rust runtime.
    """
    working_memory_keys: set[str] = set()
    for f in breed_input.facts:
        working_memory_keys.add(f"{f.key}={f.value}")
        working_memory_keys.add(f.value)
    conclusions = {r.conclusion for r in breed_input.rules}
    reachable = working_memory_keys | conclusions

    unresolvable = [
        p for r in breed_input.rules for p in r.premise if p not in reachable
    ]
    return sorted(set(unresolvable))
