from __future__ import annotations

import dspy

from signatures import CritiqueBenchmarkContract, ProposeBenchmarkContract, RepairBenchmarkContract


class BenchmarkContractProgram(dspy.Module):
    """DSPy-native SELECT program: propose -> critique -> repair."""

    def __init__(self) -> None:
        super().__init__()
        self.propose = dspy.ChainOfThought(ProposeBenchmarkContract)
        self.critique = dspy.ChainOfThought(CritiqueBenchmarkContract)
        self.repair = dspy.ChainOfThought(RepairBenchmarkContract)

    def forward(self, inventory_json: str, current_contract_json: str):
        proposal = self.propose(
            inventory_json=inventory_json,
            current_contract_json=current_contract_json,
        )
        critique = self.critique(
            benchmark_contract_json=proposal.benchmark_contract_json,
        )
        repaired = self.repair(
            benchmark_contract_json=proposal.benchmark_contract_json,
            critique_json=critique.critique_json,
        )
        return dspy.Prediction(
            benchmark_contract_json=repaired.repaired_contract_json,
            critique_json=critique.critique_json,
        )
