from __future__ import annotations

import dspy


class ProposeBenchmarkContract(dspy.Signature):
    """Propose a stronger anti-hiding benchmark contract without weakening canonical law."""

    inventory_json: str = dspy.InputField(desc="Canonical 55-cognition inventory and fixture metadata")
    current_contract_json: str = dspy.InputField(desc="Current admitted benchmark contract")
    benchmark_contract_json: str = dspy.OutputField(
        desc="JSON benchmark contract with breeds, batch_sizes, context_sizes, surfaces, falsifiers, rationale"
    )


class CritiqueBenchmarkContract(dspy.Signature):
    """Find ways a poor implementation could still hide inside a proposed benchmark contract."""

    benchmark_contract_json: str = dspy.InputField(desc="Candidate benchmark contract")
    critique_json: str = dspy.OutputField(
        desc="JSON containing hiding vectors, missing falsifiers, scale weaknesses, and recommended hardening"
    )


class RepairBenchmarkContract(dspy.Signature):
    """Repair a proposed benchmark contract using an anti-hiding critique."""

    benchmark_contract_json: str = dspy.InputField(desc="Candidate benchmark contract")
    critique_json: str = dspy.InputField(desc="Adversarial critique of the candidate")
    repaired_contract_json: str = dspy.OutputField(desc="Repaired JSON benchmark contract")
