"""Chicago-style tests for :mod:`wasm4pm_dspy.gap_triage` -- the DSPy
formalization of this session's own hand-made "is this a real, actionable
gap or confirmed expected non-overlap" judgment (the same distinction made
by hand in the 5-agent audit report earlier this session).

Real components throughout: real Groq LM calls, real literal source-tree
search (`verify_unused_claim`) grounding the actionability check. No `wpm`
CLI needed -- this module never admits or runs a breed. No mocks anywhere.
"""

from __future__ import annotations

import os

import pytest

pytest.importorskip("dspy")
import dspy

from wasm4pm_dspy.gap_triage import GapTriageProgram, triage_capability_gaps, verify_unused_claim

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


# ============================================================================
# 1. verify_unused_claim -- pure, real, no LLM
# ============================================================================


def test_verify_unused_claim_true_positive_confirmed_absent():
    # This exact string genuinely never appears anywhere in wasm4pm-dspy/src.
    assert verify_unused_claim(["quux_nonexistent_symbol_xyz123"]) is True


def test_verify_unused_claim_false_when_term_actually_present():
    # 'BreedInput' is used throughout wasm4pm-dspy/src -- the claim it's
    # unused must be real-caught, not accepted.
    assert verify_unused_claim(["BreedInput"]) is False


def test_verify_unused_claim_catches_the_real_self_referential_case():
    # This module's own docstring quotes "wasm4pm-bindings-py" as a worked
    # example -- confirmed live this session (the same real, literal
    # grounding this test exercises against itself).
    assert verify_unused_claim(["bindings-py"]) is False


# ============================================================================
# 2. Real LLM triage, grounded by the real check
# ============================================================================


@pytest.mark.llm
@requires_real_groq_api_key
def test_triage_grounds_a_false_unused_claim_against_reality(real_groq_lm: dspy.LM) -> None:
    """A finding that falsely claims 'BreedInput is currently unused' must
    have its actionability overridden by the real search check -- the LM's
    own actionability score is not trusted when it disagrees with a real,
    literal grep result."""
    program = GapTriageProgram()
    findings = [
        {
            "capability_description": "BreedInput is the core Pydantic schema wasm4pm-dspy uses for every breed payload.",
            "current_usage_evidence": "Deliberately false claim for this test: BreedInput is never referenced anywhere.",
            "finding": "BreedInput is defined but never actually used anywhere in wasm4pm-dspy.",
            "claimed_currently_unused": True,
            "real_source_excerpt": "class BreedInput(BaseModel): ... (models.py)",
            "unused_search_terms": ["BreedInput"],
        }
    ]

    verdicts = triage_capability_gaps(program, findings)

    assert len(verdicts) == 1
    verdict = verdicts[0]
    print(f"errc={verdict.errc_action} actionable={verdict.actionable} real_unused={verdict.real_unused_verified}")
    assert verdict.real_unused_verified is False
    assert verdict.actionable is False
    assert "BreedInput" in verdict.actionability_reason


@pytest.mark.llm
@requires_real_groq_api_key
def test_triage_over_real_audit_findings_produces_structurally_valid_verdicts(real_groq_lm: dspy.LM) -> None:
    """Real findings from this session's own 5-agent audit (process-mining
    zero-overlap, and the self_healing.rs CircuitBreaker reuse gap). No
    fixed assertion on the exact ERRC action or ADM phase each gets (LM
    output isn't deterministic) -- only real structural invariants."""
    program = GapTriageProgram()
    findings = [
        {
            "capability_description": (
                "wasm4pm/src/self_healing.rs's CircuitBreaker is a generic, "
                "process-mining-agnostic failure/success-counting state machine, "
                "already exposed via WASM bindings."
            ),
            "current_usage_evidence": (
                "autonomic.py defines its own independent CircuitState/threshold "
                "logic in Python rather than calling into self_healing.rs."
            ),
            "finding": "self_healing.rs's CircuitBreaker is generic and reusable but autonomic.py reimplemented it independently instead.",
            "claimed_currently_unused": True,
            "real_source_excerpt": "pub struct CircuitBreaker { ... } (self_healing.rs)",
            "unused_search_terms": ["self_healing", "CircuitBreaker"],
        },
        {
            "capability_description": (
                "wasm4pm's DFG discovery, heuristic miner, and alignment-based "
                "conformance checking operate on real EventLog/OCEL process data."
            ),
            "current_usage_evidence": "wasm4pm-dspy has no EventLog/OCEL concept anywhere; it operates on K8sIncidentState.",
            "finding": "Process-mining discovery/conformance algorithms have zero overlap with wasm4pm-dspy's k8s-cognition-breed domain.",
            "claimed_currently_unused": True,
            "real_source_excerpt": "pub fn discover_dfg(...) -> Dfg (dfg.rs)",
            "unused_search_terms": ["EventLog", "discover_dfg", "OCEL"],
        },
    ]

    verdicts = triage_capability_gaps(program, findings)

    assert len(verdicts) == 2
    for verdict in verdicts:
        print(
            f"[{verdict.finding[:60]!r}] errc={verdict.errc_action} actionable={verdict.actionable} "
            f"phase={verdict.adm_phase} confidence={verdict.adm_confidence}"
        )
        assert verdict.errc_action in ("eliminate", "reduce", "raise", "create", "skip")
        assert verdict.adm_phase.startswith("phase_") or verdict.adm_phase == "preliminary_requirements_management"
        assert 0.0 <= verdict.adm_confidence <= 1.0
        assert verdict.real_unused_verified is True  # both search-term sets genuinely absent from wasm4pm-dspy/src
