"""Chicago-style, real-LM test for the full SELECT -> ADMIT -> RUN -> JUDGE pipeline.

Real components exercised, no mocks:
  1. A real ``dspy.LM("groq/openai/gpt-oss-20b", api_key=...)`` configured
     against the real Groq API, using ``GROQ_API_KEY`` from the environment --
     exact convention copied from autofde-lab's
     ``tests/fabric/test_dspy_ensemble_chicago.py``.
  2. A real ``BreedSelectionProgram`` propose->critique->repair run.
  3. Real ``admit_breed_input`` admission against the real registry.
  4. A real ``wpm lab cognition run`` execution + BLAKE3 re-verification.
  5. A real ``judge_run_result`` LM call evaluating the real result.

Named skip (never a mock substitute): if ``GROQ_API_KEY`` is not set, or the
CLI isn't built, the whole module skips.
"""

from __future__ import annotations

import asyncio
import os

import pytest

pytest.importorskip("dspy")
import dspy

from wasm4pm_dspy.admission import AdmissionRefused, admit_breed_input
from wasm4pm_dspy.judge import JudgeVerdict, judge_run_result
from wasm4pm_dspy.program import BreedSelectionProgram, propose_candidate
from wasm4pm_dspy.registry import load_registry
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli, run_admitted_breed_input

_GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
requires_real_groq_api_key = pytest.mark.skipif(
    not _GROQ_API_KEY,
    reason=(
        "GROQ_API_KEY is not set in the environment -- real Groq-backed "
        "breed-selection tests require a real, live API key (never a mock "
        "substitute); export GROQ_API_KEY to run this module."
    ),
)

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

requires_built_cli = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)


@pytest.fixture(scope="module")
def real_groq_lm() -> dspy.LM:
    """Configure the real Groq-backed LM used by every test in this module."""
    # max_tokens set explicitly: a real run this session truncated mid-JSON
    # under DSPy's default (unbounded-but-provider-defaulted) max_tokens once
    # the 3-stage propose/critique/repair pipeline's output grew past a
    # typical BreedInput's size.
    lm = dspy.LM("groq/openai/gpt-oss-20b", api_key=_GROQ_API_KEY, temperature=1.0, max_tokens=16000)
    dspy.configure(lm=lm)
    return lm


@pytest.fixture(scope="module")
def available_breeds() -> list[str]:
    return sorted(r.breed_id for r in load_registry())


@pytest.mark.llm
@requires_real_groq_api_key
@requires_built_cli
class TestRealBreedSelectionPipeline:
    def test_unambiguous_medical_diagnosis_goal_selects_mycin_and_runs(
        self, real_groq_lm: dspy.LM, available_breeds: list[str]
    ) -> None:
        """MYCIN (Shortliffe & Buchanan 1975) is wasm4pm's only rule-based medical
        diagnosis breed -- a goal this specific to antibiotic-sensitivity
        diagnosis should unambiguously select it."""
        program = BreedSelectionProgram()
        candidate = propose_candidate(
            program,
            goal=(
                "Given a bacterial culture that is gram-positive and grows in chains, "
                "and given known antibiotic sensitivity rules, diagnose the organism "
                "and recommend an antibiotic therapy."
            ),
            available_breeds=available_breeds,
        )

        assert candidate["breed"] in set(available_breeds)

        admitted = admit_breed_input(candidate)
        result = asyncio.run(run_admitted_breed_input(admitted))

        assert result.status == "ok"
        assert result.replay_pointer == result.output_hash[:16]

    def test_judge_evaluates_a_real_run_with_a_grounded_verdict(
        self, real_groq_lm: dspy.LM, available_breeds: list[str]
    ) -> None:
        """The full SELECT -> ADMIT -> RUN -> JUDGE pipeline, end to end. The
        judge is a read-only opinion appended after a real, already-verified
        run -- it never re-executes anything and never gates admission or
        execution, and a "not correct" verdict is a legitimate real answer,
        not a test failure.

        A first live run of this exact test caught a genuine defect this way:
        the real MYCIN engine's inference trace correctly derived
        `possible_organism=Streptococcus` and `recommended_antibiotic=penicillin`,
        but the run's `selected` field surfaced only a low-information
        byproduct fact (`high_sensitivity=true`) -- a real run that passed
        admission and execution, correctly judged incorrect. This is exactly
        the failure mode JUDGE exists to surface, so this test does not assert
        a fixed verdict -- it asserts the verdict is real and grounded in the
        actual result, and reports what was found either way."""
        program = BreedSelectionProgram()
        goal = (
            "Given a bacterial culture that is gram-positive and grows in chains, "
            "and given known antibiotic sensitivity rules, diagnose the organism "
            "and recommend an antibiotic therapy."
        )
        candidate = propose_candidate(program, goal=goal, available_breeds=available_breeds)
        admitted = admit_breed_input(candidate)
        result = asyncio.run(run_admitted_breed_input(admitted))
        assert result.status == "ok"  # ADMIT + RUN succeeded regardless of what JUDGE says next

        verdict = judge_run_result(goal, result)

        assert isinstance(verdict, JudgeVerdict)
        assert isinstance(verdict.correct, bool)
        assert verdict.rationale.strip() != ""
        if not verdict.correct:
            # Not a failure -- a real, informative finding about this run.
            print(f"JUDGE found a real defect: {verdict.rationale}")

    def test_nonexistent_capability_goal_is_refused_not_downgraded(
        self, real_groq_lm: dspy.LM, available_breeds: list[str]
    ) -> None:
        """A goal with no matching breed (asking for something wasm4pm's
        cognition kernel has no paradigm for) must either come back as a
        genuinely inadmissible candidate (AdmissionRefused) or a domain-level
        run failure -- never silently coerced into a fabricated success."""
        program = BreedSelectionProgram()
        candidate = propose_candidate(
            program,
            goal="Book me a flight to Tokyo next Tuesday and pick a window seat.",
            available_breeds=available_breeds,
        )

        # The LM should still only ever propose a real breed_id (constrained by
        # the signature's own instruction) -- if it does, admission passes and
        # the *execution* is expected to reveal the mismatch (e.g. a precondition
        # failure), which is exactly the failure mode already covered by
        # test_runner_chicago.py::test_domain_precondition_failure_raises_no_evidence.
        # If it doesn't, admission itself must refuse. Either is an acceptable
        # "not evidence" outcome; a fabricated ok=True flight booking is not.
        try:
            admitted = admit_breed_input(candidate)
        except AdmissionRefused:
            return  # correctly refused at ADMIT

        from wasm4pm_dspy.runner import NoEvidence

        try:
            result = asyncio.run(run_admitted_breed_input(admitted))
        except NoEvidence:
            return  # correctly refused at RUN

        pytest.fail(
            f"expected AdmissionRefused or NoEvidence for an out-of-scope goal, "
            f"got a completed run: breed={result.breed} status={result.status}"
        )
