"""Dev-only optimization CLI: ``python -m wasm4pm_dspy.compile_cli``.

Mirrors ``benchmark-manufacturing/compile.py``'s exact shape (load examples,
build the program, optionally optimize, evaluate, print score+prediction,
optionally save). Never invoked by CI or any other module in this package --
a human runs this locally against real, hand-labeled examples to produce a
better-performing ``program.save(...)`` artifact for later use.

Two optimizers are supported:

- ``mipro`` (``dspy.MIPROv2``) -- the benchmark-manufacturing precedent's
  choice. Its metric only needs to return a numeric score.
- ``gepa`` (``dspy.GEPA``, https://dspy.ai/tutorials/gepa_facilitysupportanalyzer/)
  -- a reflective optimizer that uses *textual feedback* about why a
  prediction scored the way it did, not just the score, to refine prompts.
  Per that tutorial, its metric must support a dual calling convention: called
  with ``pred_name=None`` it returns a plain score; called with a specific
  ``pred_name`` (e.g. ``"propose.predict"``) it returns a
  ``dspy.Prediction(score=..., feedback=...)`` explaining that particular
  sub-module's contribution. :func:`breed_selection_metric` implements both.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import dspy
from dspy.evaluate import Evaluate

from wasm4pm_dspy.admission import AdmissionRefused, admit_breed_input
from wasm4pm_dspy.program import BreedSelectionProgram, propose_candidate
from wasm4pm_dspy.registry import load_registry

__all__ = ["breed_selection_metric", "load_examples", "main"]


def breed_selection_metric(
    example: dspy.Example,
    prediction: dspy.Prediction,
    trace=None,
    pred_name: str | None = None,
    pred_trace=None,
) -> float | dspy.Prediction:
    """Mechanical, checklist-based metric -- not LM-judged prose similarity:
    does the full candidate pass the real deterministic admission gate, and
    does the proposed breed match the example's expected breed. Score-only for
    MIPROv2/Evaluate; also feedback-capable for GEPA (see module docstring).
    """
    try:
        payload = prediction.breed_input.model_dump(mode="json")
    except AttributeError:
        # GEPA may pass a raw dict-like prediction for a sub-module trace;
        # treat as inadmissible rather than guessing at its shape.
        payload = None

    admitted_ok = False
    refusal_reason = ""
    if payload is not None:
        candidate = {"breed": prediction.breed, "payload": payload}
        try:
            admit_breed_input(candidate)
            admitted_ok = True
        except AdmissionRefused as exc:
            refusal_reason = str(exc)

    breed_matches = admitted_ok and prediction.breed == example.expected_breed
    if admitted_ok and breed_matches:
        score = 1.0
    elif admitted_ok:
        score = 0.5  # admitted but wrong breed scores partial credit
    else:
        score = 0.0

    if pred_name is None:
        return score

    if not admitted_ok:
        feedback = f"Candidate was refused by admission: {refusal_reason}"
    elif not breed_matches:
        feedback = (
            f"Candidate was admitted (schema-valid) but proposed breed "
            f"'{prediction.breed}' does not match the expected breed "
            f"'{example.expected_breed}' for this goal."
        )
    else:
        feedback = "Candidate was admitted and matched the expected breed."

    return dspy.Prediction(score=score, feedback=feedback)


def load_examples() -> list[dspy.Example]:
    """A small, hand-labeled seed set. Real usage would grow this from logged
    real goal->breed selections over time; this is deliberately minimal --
    enough to run this CLI at all, not a claim of coverage."""
    available_breeds = sorted(r.breed_id for r in load_registry())
    seeds = [
        (
            "Given a bacterial culture's gram stain and known antibiotic "
            "sensitivity rules, diagnose the organism and recommend therapy.",
            "mycin",
        ),
        (
            "Explain why an object with a handle that is concave counts as a "
            "cup, generalizing from one example.",
            "ebl",
        ),
        (
            "Given prior deployment cases with their architecture choices and "
            "outcomes, select the best-fitting architecture for a new "
            "offline, small-scale requirement.",
            "cbr",
        ),
    ]
    return [
        dspy.Example(goal=goal, available_breeds=available_breeds, expected_breed=breed).with_inputs(
            "goal", "available_breeds"
        )
        for goal, breed in seeds
    ]


def main() -> None:
    import os

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="groq/openai/gpt-oss-20b", help="Base LM the program itself runs on")
    parser.add_argument("--optimizer", choices=["none", "mipro", "gepa"], default="none")
    parser.add_argument("--reflection-model", default="groq/openai/gpt-oss-20b", help="LM used by GEPA's reflection step")
    parser.add_argument("--save", type=Path)
    args = parser.parse_args()

    # Every prior real run this session (test_nl_to_breed_input_chicago.py)
    # needed max_tokens set explicitly -- Groq's default truncated the
    # 3-stage propose/critique/repair pipeline's output mid-JSON otherwise.
    base_lm = dspy.LM(args.model, api_key=os.environ.get("GROQ_API_KEY"), max_tokens=16000)
    dspy.configure(lm=base_lm)

    examples = load_examples()
    program = BreedSelectionProgram()

    if args.optimizer == "mipro":
        optimizer = dspy.MIPROv2(metric=breed_selection_metric, auto="light")
        program = optimizer.compile(program, trainset=examples)
    elif args.optimizer == "gepa":
        reflection_lm = dspy.LM(args.reflection_model, api_key=os.environ.get("GROQ_API_KEY"), max_tokens=16000)
        optimizer = dspy.GEPA(
            metric=breed_selection_metric,
            auto="light",
            reflection_lm=reflection_lm,
        )
        program = optimizer.compile(program, trainset=examples, valset=examples)

    evaluator = Evaluate(
        devset=examples,
        metric=breed_selection_metric,
        num_threads=1,
        display_progress=False,
        display_table=0,
    )
    score = evaluator(program)

    candidate = propose_candidate(program, examples[0].goal, examples[0].available_breeds)
    print(json.dumps({"score": score, "candidate": candidate}, indent=2, sort_keys=True))

    if args.save:
        program.save(str(args.save))


if __name__ == "__main__":
    main()
