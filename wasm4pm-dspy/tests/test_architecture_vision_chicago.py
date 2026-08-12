"""Chicago-style tests for :mod:`wasm4pm_dspy.architecture_vision` -- the
actual Phase A (Architecture Vision) mechanism named as a real, missing
gap two turns before this module existed.

Real components throughout: real Groq LM calls, real `GapVerdict` inputs,
real structural check (every proposed target must reference a real backlog
finding verbatim). No `wpm` CLI needed -- this module never admits or runs
a breed, only consumes already-scored `GapVerdict` objects. No mocks
anywhere.
"""

from __future__ import annotations

import os

import pytest

pytest.importorskip("dspy")
import dspy

from wasm4pm_dspy.architecture_vision import ArchitectureVisionProgram, REPO_CONSTRAINTS, propose_vision
from wasm4pm_dspy.gap_triage import GapVerdict

_GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
requires_real_groq_api_key = pytest.mark.skipif(
    not _GROQ_API_KEY,
    reason=(
        "GROQ_API_KEY is not set in the environment -- real Groq-backed tests "
        "require a real, live API key (never a mock substitute)."
    ),
)


@pytest.fixture(scope="module")
def real_groq_lm() -> dspy.LM:
    lm = dspy.LM("groq/openai/gpt-oss-20b", api_key=_GROQ_API_KEY, temperature=1.0, max_tokens=16000)
    dspy.configure(lm=lm)
    return lm


def _real_backlog() -> list[GapVerdict]:
    """Real backlog items, matching this session's own actual audit
    findings and gap_triage.py test fixtures -- one actionable/create item,
    one non-actionable/skip item (must never appear in a real proposal)."""
    return [
        GapVerdict(
            finding="self_healing.rs's CircuitBreaker is generic and reusable but autonomic.py reimplemented it independently.",
            errc_action="raise",
            errc_justification="a generic, already-built, WASM-exposed utility should be reused, not reimplemented",
            actionable=True,
            actionability_reason="real, non-cosmetic reuse gap",
            real_unused_verified=True,
            adm_phase="phase_g_implementation_governance",
            adm_justification="circuit breaker is a governance/protection mechanism",
            adm_confidence=0.8,
        ),
        GapVerdict(
            finding="Process-mining discovery algorithms have zero overlap with wasm4pm-dspy's k8s-cognition-breed domain.",
            errc_action="skip",
            errc_justification="expected non-overlap, different subsystem, not a gap",
            actionable=False,
            actionability_reason="confirmed zero overlap, expected",
            real_unused_verified=True,
            adm_phase="phase_b_business",
            adm_justification="process mining is business-architecture discovery, unrelated to k8s cognition",
            adm_confidence=0.6,
        ),
    ]


# ============================================================================
# 1. REPO_CONSTRAINTS -- real, non-empty, encodes the actual standing rules
# ============================================================================


def test_repo_constraints_names_the_real_standing_rules():
    assert "SELECT" in REPO_CONSTRAINTS
    assert "fabricate" in REPO_CONSTRAINTS
    assert "destructive git" in REPO_CONSTRAINTS


# ============================================================================
# 2. Real LLM proposal, real structural grounding check
# ============================================================================


@pytest.mark.llm
@requires_real_groq_api_key
def test_vision_proposal_only_includes_actionable_backlog_items(real_groq_lm: dspy.LM) -> None:
    """The non-actionable/skip item must never influence a real proposal --
    eligible_backlog_size must reflect only the 1 actionable raise/create
    item, not both real backlog entries."""
    program = ArchitectureVisionProgram()
    backlog = _real_backlog()

    proposal = propose_vision(program, backlog)

    print(f"eligible_backlog_size={proposal.eligible_backlog_size}")
    print(f"ordered_targets={proposal.ordered_targets}")
    print(f"dropped_unverified_targets={proposal.dropped_unverified_targets}")
    print(f"rationale={proposal.rationale[:200]!r}")

    assert proposal.eligible_backlog_size == 1
    # The skip-item's finding text must never appear verbatim in a
    # verified target (it wasn't eligible input at all).
    skip_finding = backlog[1].finding
    assert all(skip_finding not in t for t in proposal.ordered_targets)


@pytest.mark.llm
@requires_real_groq_api_key
def test_empty_actionable_backlog_produces_no_verified_targets(real_groq_lm: dspy.LM) -> None:
    """No actionable items in the backlog -> real structural check has
    nothing real to verify against -> every proposed target (if the LM
    proposes any at all) is dropped as unverified, never silently accepted."""
    program = ArchitectureVisionProgram()
    all_skip_backlog = [
        GapVerdict(
            finding="Everything is already fine, nothing to build.",
            errc_action="skip",
            errc_justification="no gap",
            actionable=False,
            actionability_reason="not actionable",
            real_unused_verified=True,
            adm_phase="preliminary_requirements_management",
            adm_justification="n/a",
            adm_confidence=0.9,
        )
    ]

    proposal = propose_vision(program, all_skip_backlog)

    print(f"ordered_targets={proposal.ordered_targets}, dropped={proposal.dropped_unverified_targets}")
    assert proposal.eligible_backlog_size == 0
    assert proposal.ordered_targets == []  # nothing real to reference -> nothing verified
