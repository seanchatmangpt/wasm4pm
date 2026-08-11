"""JUDGE: a final, optional LM step that evaluates whether a real
``CognitionRunResult`` actually answers the original goal.

This is a *trusted-monitor* pattern (per
https://dspy.ai/tutorials/gepa_trusted_monitor/), not a fourth authority stage:
the judge never re-executes anything, never overrides ADMIT's or RUN's
outcome, and its verdict is evidence *about* a result, not a replacement for
it. The full pipeline is SELECT -> ADMIT -> RUN -> JUDGE, where JUDGE is
strictly a read-only opinion appended after a real run already produced a
verified receipt.

Requires the ``llm`` extra. Never imported by ``admission.py`` or
``runner.py`` -- a caller who never wants an LM in the loop can use RUN's
output directly and skip this module entirely; a ``CognitionRunResult`` is
already trustworthy (verified receipt) with or without a judgment.
"""

from __future__ import annotations

from dataclasses import dataclass

import dspy

from wasm4pm_dspy.runner import CognitionRunResult

__all__ = ["JudgeBreedOutput", "JudgeVerdict", "judge_run_result"]


class JudgeBreedOutput(dspy.Signature):
    """Judge whether a cognition breed's real output actually answers the
    original goal. Be skeptical: a run that completed successfully
    (verified receipt, non-empty inference trace) can still have reasoned
    about the wrong thing, ignored part of the goal, or reached a conclusion
    the trace doesn't actually support."""

    goal: str = dspy.InputField(desc="The original free-text goal")
    breed: str = dspy.InputField(desc="The breed that was run")
    selected: str = dspy.InputField(desc="The breed's selected output, if any (may be empty)")
    explanation: str = dspy.InputField(desc="The breed's human-readable explanation of its reasoning")
    inference_trace_summary: str = dspy.InputField(
        desc="A summary of the real inference trace steps the breed actually took"
    )
    correct: bool = dspy.OutputField(desc="True only if the output genuinely and fully answers the goal")
    rationale: str = dspy.OutputField(desc="Why -- cite specific trace steps or the explanation, not a generic claim")


@dataclass(frozen=True)
class JudgeVerdict:
    correct: bool
    rationale: str


def _summarize_trace(trace: list[dict], max_steps: int = 20) -> str:
    if not trace:
        return "(empty trace)"
    lines = [f"[{s.get('step')}] {s.get('kind')}: {s.get('detail')}" for s in trace[:max_steps]]
    if len(trace) > max_steps:
        lines.append(f"... {len(trace) - max_steps} more steps")
    return "\n".join(lines)


def judge_run_result(goal: str, result: CognitionRunResult) -> JudgeVerdict:
    """Ask the configured LM whether ``result`` (a real, already-verified
    :class:`~wasm4pm_dspy.runner.CognitionRunResult`) actually answers
    ``goal``. Read-only: makes exactly one LM call, mutates nothing, and never
    raises on a "not correct" verdict -- that's a legitimate answer, not a
    failure. A caller wanting "not evidence" semantics for a bad verdict
    should check ``verdict.correct`` itself, same as any other typed result.
    """
    judge = dspy.Predict(JudgeBreedOutput)
    prediction = judge(
        goal=goal,
        breed=result.breed,
        selected=result.selected or "",
        explanation=result.explanation or "",
        inference_trace_summary=_summarize_trace(result.inference_trace),
    )
    return JudgeVerdict(correct=bool(prediction.correct), rationale=prediction.rationale)
