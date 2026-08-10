from __future__ import annotations

import argparse
import json
from pathlib import Path

import dspy
from dspy.evaluate import Evaluate

from examples import load_examples
from metric import benchmark_contract_metric
from program import BenchmarkContractProgram


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("benchmark-manufacturing"))
    parser.add_argument("--optimizer", choices=["none", "mipro"], default="none")
    parser.add_argument("--save", type=Path)
    args = parser.parse_args()

    examples = load_examples(args.root)
    program = BenchmarkContractProgram()

    if args.optimizer == "mipro":
        optimizer = dspy.MIPROv2(metric=benchmark_contract_metric, auto="light")
        program = optimizer.compile(program, trainset=examples)

    evaluator = Evaluate(
        devset=examples,
        metric=benchmark_contract_metric,
        num_threads=1,
        display_progress=False,
        display_table=0,
    )
    score = evaluator(program)

    prediction = program(
        inventory_json=examples[0].inventory_json,
        current_contract_json=examples[0].current_contract_json,
    )
    print(json.dumps({"score": score, "contract": json.loads(prediction.benchmark_contract_json)}, indent=2, sort_keys=True))

    if args.save:
        program.save(str(args.save))


if __name__ == "__main__":
    main()
