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

__all__ = ["Fact", "Rule", "Goal", "Case", "Candidate", "StateAtom", "BreedInput", "terminal_conclusions"]


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

    This is a real, deterministic, pure computation -- not an LM guess -- fed
    to :class:`~wasm4pm_dspy.signatures.CritiqueBreedSelection` as a properly
    typed field so the critique stage can check "does the goal's intended
    answer appear in this list" against ground truth, rather than trying to
    infer terminality itself from reading English guidance.

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
