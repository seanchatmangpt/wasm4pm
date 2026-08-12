"""Chicago-style coverage-extension tests: run 3 real, already-existing
bridge functions -- previously exercised only against the single
``real_episode.ocel.json`` fixture -- over the FULL, real, 8-episode
diverse ``gymact_corpus`` corpus instead.

No new production code. Real components throughout: the real, unmodified
``generate_diverse_corpus``/``DEFAULT_DIVERSE_SPECS`` corpus generator
(same one ``test_gymact_corpus_chicago.py`` already uses), the real
``validate_ocel_schema``, the real ``ocpm_state_from_ocel`` +
``DETERMINISTIC_ENCODER_BREEDS_OCPM`` + ``encode_for_breed`` +
``admit_breed_input`` + ``run_admitted_breed_input`` (real subprocess, real
WASM execution, real BLAKE3 receipt verification), and the real
``check_gymact_ocel_fitness`` (confirmed, in this same session's prior
investigation, to always raise ``GymActConformanceUnavailable`` in this
environment because ``wpm model check --mode replay`` rejects OCEL input --
a real, deterministic CLI blocker, not a mock substitute).

No mocking anywhere: named skip only, never a mock, if ``gymact`` isn't
installed.
"""

from __future__ import annotations

import asyncio
import importlib
from pathlib import Path

import pytest

from wasm4pm_dspy.admission import admit_breed_input
from wasm4pm_dspy.gymact_conformance import GymActConformanceUnavailable, check_gymact_ocel_fitness
from wasm4pm_dspy.gymact_corpus import DEFAULT_DIVERSE_SPECS, generate_diverse_corpus
from wasm4pm_dspy.ocel_schema_validation import validate_ocel_schema
from wasm4pm_dspy.ocpm_state import (
    DETERMINISTIC_ENCODER_BREEDS_OCPM,
    encode_for_breed,
    ocpm_state_from_ocel,
)
from wasm4pm_dspy.runner import Wasm4pmCliUnavailable, resolve_wpm_cli, run_admitted_breed_input

try:
    importlib.import_module("gymact")
    _GYMACT_AVAILABLE = True
except ModuleNotFoundError:
    _GYMACT_AVAILABLE = False

requires_gymact = pytest.mark.skipif(
    not _GYMACT_AVAILABLE, reason="gymact is not installed (use --with-editable ~/gymact)"
)

try:
    resolve_wpm_cli()
    _WPM_CLI_AVAILABLE = True
except Wasm4pmCliUnavailable:
    _WPM_CLI_AVAILABLE = False

requires_wpm_cli = pytest.mark.skipif(
    not _WPM_CLI_AVAILABLE,
    reason="apps/wasm4pm CLI not built (run 'pnpm build' inside apps/wasm4pm)",
)


@pytest.fixture(scope="module")
def corpus_paths(tmp_path_factory) -> tuple[Path, ...]:
    """Real, module-scoped generation of the full DEFAULT_DIVERSE_SPECS
    corpus into a real temp dir. Same real generation call as
    ``test_gymact_corpus_chicago.py``'s own ``corpus_paths`` fixture,
    replicated here (module-scoped fixtures aren't cleanly importable
    across test files without a shared conftest, which this task's
    constraints forbid adding) rather than rebuilt with different logic."""
    if not _GYMACT_AVAILABLE:
        pytest.skip("gymact is not installed (use --with-editable ~/gymact)")

    out_dir = tmp_path_factory.mktemp("gymact-corpus-coverage")
    return asyncio.run(generate_diverse_corpus(DEFAULT_DIVERSE_SPECS, out_dir=out_dir))


# ============================================================================
# 1. validate_ocel_schema x all 8 corpus files
# ============================================================================


@requires_gymact
def test_validate_ocel_schema_across_full_diverse_corpus(corpus_paths):
    """Every real, structurally distinct GymAct-generated OCEL log in the
    corpus must be real, genuinely schema-valid -- no CLI/native-binding
    dependency, so this always actually runs."""
    results = []
    for path, spec in zip(corpus_paths, DEFAULT_DIVERSE_SPECS):
        result = validate_ocel_schema(path)
        results.append((spec, result))
        print(
            f"[schema] {spec.label:24s} is_valid={result.is_valid} "
            f"errors={len(result.errors)}"
        )
        assert result.is_valid is True, (
            f"spec {spec.label!r} failed real schema validation: {result.errors!r}"
        )
        assert result.errors == ()

    assert len(results) == len(DEFAULT_DIVERSE_SPECS) == 8


# ============================================================================
# 2. ocpm_state_from_ocel + all 4 real deterministic encoders x all 8
#    corpus files -- real admit + real run, same pattern as
#    test_ocpm_state_chicago.py's fixture-based test, but across 8 real,
#    structurally distinct episodes instead of 1.
# ============================================================================


@requires_gymact
@requires_wpm_cli
def test_deterministic_encoders_run_real_breeds_across_full_diverse_corpus(corpus_paths):
    async def _run_all_breeds_for(state):
        outcomes = {}
        for breed in DETERMINISTIC_ENCODER_BREEDS_OCPM:
            breed_input = encode_for_breed(breed, state)
            assert breed_input is not None, f"{breed} must be registered as a deterministic encoder"
            candidate = {"breed": breed, "payload": breed_input.model_dump(mode="json")}
            admitted = admit_breed_input(candidate)
            outcomes[breed] = await run_admitted_breed_input(admitted)
        return outcomes

    per_episode_results = {}
    for path, spec in zip(corpus_paths, DEFAULT_DIVERSE_SPECS):
        state = ocpm_state_from_ocel(
            path, intent=f"discover object lifecycles from corpus episode {spec.label}"
        )
        outcomes = asyncio.run(_run_all_breeds_for(state))
        per_episode_results[spec.label] = outcomes

        for breed, result in outcomes.items():
            print(
                f"[ocpm] episode={spec.label:24s} breed={breed:24s} "
                f"status={result.status} events={len(state.events)} "
                f"objects={len(state.objects)}"
            )
            assert result.status == "ok", (
                f"episode {spec.label!r} breed {breed!r} real run did not "
                f"return status=ok: {result}"
            )

    assert len(per_episode_results) == len(DEFAULT_DIVERSE_SPECS) == 8
    for label, outcomes in per_episode_results.items():
        assert set(outcomes) == set(DETERMINISTIC_ENCODER_BREEDS_OCPM), label

    total_runs = sum(len(outcomes) for outcomes in per_episode_results.values())
    print(
        f"[ocpm] total real admit+run executions across corpus: {total_runs} "
        f"(episodes={len(per_episode_results)} x breeds={len(DETERMINISTIC_ENCODER_BREEDS_OCPM)})"
    )
    assert total_runs == len(DEFAULT_DIVERSE_SPECS) * len(DETERMINISTIC_ENCODER_BREEDS_OCPM)


# ============================================================================
# 3. check_gymact_ocel_fitness x all 8 corpus files -- confirms the real,
#    already-established GymActConformanceUnavailable CLI blocker is
#    deterministic across all 8 structurally distinct real shapes.
# ============================================================================


@requires_gymact
def test_check_gymact_ocel_fitness_raises_the_real_confirmed_blocker_across_corpus(corpus_paths):
    results = []
    for path, spec in zip(corpus_paths, DEFAULT_DIVERSE_SPECS):
        with pytest.raises(GymActConformanceUnavailable) as excinfo:
            asyncio.run(check_gymact_ocel_fitness(path))
        results.append((spec, str(excinfo.value)))
        print(f"[fitness] {spec.label:24s} raised GymActConformanceUnavailable: {excinfo.value}")

    assert len(results) == len(DEFAULT_DIVERSE_SPECS) == 8
    for spec, message in results:
        assert message, f"spec {spec.label!r} raised with an empty message"
