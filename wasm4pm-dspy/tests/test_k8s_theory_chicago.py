"""Chicago-style, real-LM test of the K8s theory-testing pipeline:
:mod:`wasm4pm_dspy.k8s_theory`.

Real components exercised, no mocks:
  1. A real ``dspy.LM("groq/openai/gpt-oss-20b", api_key=...)`` against the
     real Groq API -- same convention as `test_nl_to_breed_input_chicago.py`.
  2. A real ``K8sIncidentEncodingProgram`` propose call per specialist breed.
  3. Real ``admit_breed_input`` admission against the real registry.
  4. Real ``wpm lab cognition run`` execution + BLAKE3 re-verification, per
     successfully-admitted breed.
  5. Real ``combine_via_meta_reasoning`` / ``combine_via_hearsay`` over
     whichever specialists actually produced real evidence.

This is an exploratory test of the theory itself, not a claim the LLM
encoding is reliable -- it does not assert a fixed set of breeds succeed. It
prints which did/didn't and why (same honesty discipline as `judge.py`), and
asserts only: at least one breed produced real, receipt-verified evidence,
and if two or more did, the real `meta_reasoning` combiner ran successfully
on their real outputs.

Named skip (never a mock substitute): if ``GROQ_API_KEY`` is not set, or the
CLI isn't built, the whole module skips.
"""

from __future__ import annotations

import asyncio
import os

import pytest

pytest.importorskip("dspy")
import dspy

from wasm4pm_dspy.k8s_theory import SPECIALIST_BREEDS, K8sIncidentEncodingProgram, diagnose_from_nl
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli

_GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
requires_real_groq_api_key = pytest.mark.skipif(
    not _GROQ_API_KEY,
    reason=(
        "GROQ_API_KEY is not set in the environment -- real Groq-backed "
        "K8s theory tests require a real, live API key (never a mock "
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
    lm = dspy.LM("groq/openai/gpt-oss-20b", api_key=_GROQ_API_KEY, temperature=1.0, max_tokens=16000)
    dspy.configure(lm=lm)
    return lm


# Free-text paraphrase of the K8s-MAX essay's own hotel-reservation
# frontend-unavailable worked example -- prose input to an LLM, not a
# fixture any assertion below depends on for correctness.
_INCIDENT = (
    "In the hotel-reservation namespace, the frontend service has been "
    "returning connection-refused errors for the last several minutes. "
    "Recent deploy events show the frontend Deployment's pod template "
    "label changed, but the Service's selector was not updated to match. "
    "Other services in the namespace (profile, search, recommendation) "
    "are healthy. No resource limits were changed and no DNS policy "
    "changes were observed."
)


@pytest.mark.llm
@requires_real_groq_api_key
@requires_built_cli
class TestK8sTheoryEndToEnd:
    def test_nl_incident_encodes_and_runs_across_real_specialists(self, real_groq_lm: dspy.LM) -> None:
        program = K8sIncidentEncodingProgram()
        outcomes, orchestration = asyncio.run(diagnose_from_nl(program, _INCIDENT, SPECIALIST_BREEDS))

        assert len(outcomes) == len(SPECIALIST_BREEDS)
        for outcome in outcomes:
            print(f"[{outcome.breed}] status={outcome.status} error={outcome.error}")

        ok_outcomes = [o for o in outcomes if o.status == "ok"]
        assert ok_outcomes, (
            "expected the LLM to successfully encode and run at least one real "
            f"specialist breed; all {len(outcomes)} failed: "
            f"{[(o.breed, o.status, o.error) for o in outcomes]}"
        )

        # Report per-breed pass/fail honestly rather than asserting a fixed
        # outcome for mycin/strips specifically -- the critique/repair stage
        # is a real fix for a real failure mode observed on one prior live
        # run, not a guarantee; a live LM call can still fail differently.
        failed = {o.breed: o.error for o in outcomes if o.status != "ok"}
        if failed:
            print(f"still failing after critique/repair: {failed}")

        # Every successfully-run specialist's receipt is already verified
        # inside run_admitted_breed_input -- a report only exists here if it
        # already passed that check.
        for outcome in ok_outcomes:
            assert outcome.report is not None
            assert outcome.report.result.status == "ok"

        if len(ok_outcomes) >= 2:
            assert orchestration.meta is not None
            assert orchestration.meta.status == "ok"
            print(f"meta_reasoning selected={orchestration.meta.selected!r}")
        else:
            print(f"only {len(ok_outcomes)} specialist(s) succeeded -- meta_reasoning combination skipped")

        if ok_outcomes:
            assert orchestration.hearsay is not None
            assert orchestration.hearsay.status == "ok"
            print(f"hearsay selected={orchestration.hearsay.selected!r}")
