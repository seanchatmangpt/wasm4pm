"""Honest coverage report of ``wasm4pm``'s ONE real, machine-readable
capability registry (``wasm4pm/src/capability_registry.rs::get_capability_registry()``)
against what this session's own ``wasm4pm-dspy`` bridge modules actually call.

Scope, stated explicitly so this module is never mistaken for a broader claim:
this registry covers exactly 8 categories of WASM-bindings-exposed,
LLM-tool-callable functions -- ``discovery``, ``conformance``, ``analysis``,
``data_quality``, ``feature_extraction``, ``filtering``, ``io``, ``state``. It
does NOT include ML/prediction, OR/optimization, autonomic/RL, or the 55
cognition breeds -- those live in separate registries or aren't centrally
catalogued anywhere in this repo. This module reports coverage against
exactly the 32 real functions in this one registry, nothing broader.

Two paths to the registry's real content were investigated live this session:

1. **Live call**: ``wasm4pm-bindings-py``'s native PyO3 module really does
   export ``get_capability_registry`` -- confirmed by reading
   ``crates/wasm4pm-bindings-py/src/exports_generated.rs:1409-1411`` (wraps
   ``wasm4pm::capability_registry::get_capability_registry()``) and its
   ``m.add_function(wrap_pyfunction!(get_capability_registry, m)?)?`` at line
   2555. But ``import wasm4pm`` raises ``ModuleNotFoundError`` in this venv
   (confirmed live: ``uv run python -c "import wasm4pm"`` fails) -- the
   native wheel isn't built/installed here, so this path is real but not
   currently usable in this environment.
2. **Source-parsing fallback** (the one actually used below, same discipline
   as ``breed_encodability.py::field_access_for``'s real ``.rs`` scanning):
   parse ``capability_registry.rs`` directly. Its ``json!({...})`` literal is
   static Rust source, not a running program's output, but it IS the exact
   same data the live call would return -- the wasm_bindgen function body is
   nothing but this literal wrapped in ``to_js(&registry)``. Documented here
   as parsing source, not as a live call, and never conflated with one.

``compute_coverage()`` cross-references the parsed registry against a real,
hand-verified list of what this session's bridge modules actually call:

- ``gymact_bridge.py``'s native-binding path calls
  ``native.discover_ocel_dfg(log_handle)`` literally (confirmed by reading
  the module) -- an exact name match against the registry's real
  ``discovery`` category. This is the ONLY exact, non-ambiguous match found.
- ``gymact_bridge.py``'s native-binding path also calls
  ``native.discover_oc_petri_net(log_handle)`` for ``algorithm ==
  "ocel_petri_net"`` -- but no ``discover_oc_petri_net`` (or
  ``discover_ocel_petri_net``) function exists anywhere in the real
  registry's 32 entries. Not counted as exercised: it would be a fabricated
  match, not a real one.
- ``gymact_bridge.py``'s CLI fallback and ``gymact_conformance.py`` both call
  the ``wpm`` CLI (``model discover`` / ``model check --mode oracle``), which
  is a real, working code path but does not call any single named registry
  function -- the CLI verb doesn't correspond 1:1 to one ``get_capability_registry``
  entry name. Marked "unclear" per the task's own instruction to prefer
  honesty over a forced match, and NOT counted as exercised.
- ``gymact_experiment.py`` reuses ``gymact_bridge.discover_process_from_gymact_ocel``
  unchanged (confirmed by reading the module) -- same exercised capability
  as above, not a second one.
- No other bridge module in this package (``autonomic.py``, ``k8s_state.py``,
  ``ocpm_state.py``, ``breed_encodability.py``, ...) calls any function whose
  name appears in this registry -- they operate on cognition breeds, K8s
  anomaly encoding, or CTL model checking, none of which are registry
  members (confirmed by grepping those files for the registry's real
  ``discover_*``/``check_*``/``analyze_*``/``detect_*``/``infer_*``/
  ``extract_*``/``filter_*``/``load_*``/``export_*`` naming conventions --
  zero matches beyond the one above).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "CapabilityCoverageReport",
    "parse_capability_registry_source",
    "compute_coverage",
]

_REGISTRY_RS_PATH = Path("/Users/sac/wasm4pm/wasm4pm/src/capability_registry.rs")

# The 8 real category keys, transcribed verbatim from capability_registry.rs's
# own `"categories": { ... }` object -- not invented here.
_CATEGORY_KEYS = (
    "discovery",
    "conformance",
    "analysis",
    "data_quality",
    "feature_extraction",
    "filtering",
    "io",
    "state",
)

# A real function-name match. `gymact_bridge.py`'s native-binding path calls
# `native.discover_ocel_dfg(log_handle)` literally -- exact name match
# against the registry's real `discovery` category entry `discover_ocel_dfg`.
# `discover_oc_petri_net` is deliberately excluded: no matching registry
# entry exists (confirmed by parsing below), so counting it would fabricate
# a match. The CLI-only paths (`wpm model discover`/`wpm model check`) are
# also deliberately excluded as "unclear" rather than force-matched.
_EXERCISED_BY_BRIDGE_MODULES: tuple[str, ...] = ("discover_ocel_dfg",)


class CapabilityRegistryParseError(RuntimeError):
    """Raised when capability_registry.rs can't be found or its real
    category/function structure can't be parsed -- never silently returns
    an empty/fabricated registry."""


def parse_capability_registry_source(
    path: Path = _REGISTRY_RS_PATH,
) -> dict[str, tuple[str, ...]]:
    """Real, parsed-not-guessed extraction of capability_registry.rs's
    `"categories": {...}` structure: maps each of the 8 real category names
    to the real function names it lists, in source order.

    This is a direct regex parse of the real Rust source file -- the same
    "scan the real .rs, don't hand-retype it" discipline
    `breed_encodability.py::field_access_for` uses. It is NOT a live call to
    `get_capability_registry()`; documented as source-parsing throughout.

    Raises :class:`CapabilityRegistryParseError` if the file is missing or no
    known category block can be found -- never returns a fabricated/empty
    registry silently.
    """
    if not path.is_file():
        raise CapabilityRegistryParseError(f"capability_registry.rs not found at {path}")

    text = path.read_text(encoding="utf-8")

    category_alternation = "|".join(_CATEGORY_KEYS)
    # Each category value is a `[ ... ]` array closed by a line that is just
    # `            ]` (8-space indent) in the real source's formatting.
    category_block_pattern = re.compile(
        r'"(' + category_alternation + r')":\s*\[(.*?)\n            \]',
        re.S,
    )
    # Top-level capability objects open with `{"name": "<fn>", "description":`
    # -- this distinguishes a capability's own `"name"` field from a nested
    # param's `"name"` field, which is never immediately followed by
    # `"description"` in the same key position for every param (params use
    # `"name"` then `"type"`, only sometimes `"description"`), so anchoring
    # on `"name"` -> `"description"` as the capability-object opening avoids
    # over-counting param names in the flat regex.
    fn_name_pattern = re.compile(r'\{\s*"name":\s*"([a-zA-Z0-9_]+)",\s*"description"')

    found = category_block_pattern.findall(text)
    if not found:
        raise CapabilityRegistryParseError(
            f"no recognizable category blocks found in {path} -- source shape may have changed"
        )

    registry: dict[str, tuple[str, ...]] = {}
    for category, body in found:
        registry[category] = tuple(fn_name_pattern.findall(body))

    missing = set(_CATEGORY_KEYS) - set(registry)
    if missing:
        raise CapabilityRegistryParseError(
            f"expected categories not found in {path}: {sorted(missing)}"
        )

    return registry


@dataclass(frozen=True)
class CapabilityCoverageReport:
    """Real coverage of wasm4pm's one real capability registry against what
    this session's own bridge modules actually call. Every field is derived
    from either a real source parse (registry side) or a real read of the
    bridge modules' source (exercised side) -- nothing here is estimated."""

    total_capabilities: int
    by_category: dict[str, int]
    exercised_capabilities: tuple[str, ...]
    unexercised_capabilities: tuple[str, ...]


def compute_coverage(
    path: Path = _REGISTRY_RS_PATH,
    exercised: tuple[str, ...] = _EXERCISED_BY_BRIDGE_MODULES,
) -> CapabilityCoverageReport:
    """Parses the real registry source, then cross-references `exercised`
    (a real, hand-verified list of registry function names this session's
    bridge modules actually call -- see module docstring for the audit) to
    produce a `CapabilityCoverageReport`. Raises
    :class:`CapabilityRegistryParseError` if the source can't be parsed --
    never fabricates a report from a missing registry."""
    registry = parse_capability_registry_source(path)

    all_names: list[str] = []
    by_category: dict[str, int] = {}
    for category, names in registry.items():
        by_category[category] = len(names)
        all_names.extend(names)

    all_names_set = set(all_names)
    # Only count an "exercised" entry if it really is a registry member --
    # an exercised name that isn't in the registry is a bug in the caller's
    # audit, not evidence of coverage, so it's silently dropped rather than
    # inflating the exercised count. (In practice `_EXERCISED_BY_BRIDGE_MODULES`
    # is hand-verified against this same registry, so this should never trigger.)
    real_exercised = tuple(name for name in exercised if name in all_names_set)
    exercised_set = set(real_exercised)
    unexercised = tuple(name for name in all_names if name not in exercised_set)

    return CapabilityCoverageReport(
        total_capabilities=len(all_names),
        by_category=by_category,
        exercised_capabilities=real_exercised,
        unexercised_capabilities=unexercised,
    )
