# Tutorial: Executing Cognition Contracts

## Learning Objectives
In this tutorial, you will:
1. Understand the difference between an ML pipeline and an Old-AI cognition breed.
2. Select one of the 9 available, strictly-typed `BreedId` systems.
3. Execute a MYCIN forward-chaining contract.
4. Validate the deterministic inference trace.

## Step 1: The Contract
Cognition contracts require selecting a `BreedId` (one of `eliza`, `cbr`, `dendral`, `strips`, `prolog`, `mycin`, `gps`, `soar`, or `hearsay`) and defining the `input` ruleset matching that breed's mathematical model.

Create a file `mycin_rules.json` with your domain constraints:
```json
{
  "breed": "mycin",
  "contract": {
    "intent": "diagnose-system-failure",
    "facts": [
      { "key": "latency", "value": "high" },
      { "key": "cpu", "value": "normal" }
    ],
    "rules": [
      {
        "id": "R1",
        "premise": ["latency=high", "cpu=normal"],
        "conclusion": "network-bottleneck",
        "certainty": 0.85
      }
    ],
    "candidates": [],
    "cases": [],
    "goals": [],
    "state": []
  }
}
```

## Step 2: Execution
Run the cognition engine. Under the hood, this leverages the strictly-typed TypeScript bindings in `@wasm4pm/cognition` to dispatch to the WebAssembly kernel.
```bash
wpm cognition run --input mycin_rules.json
```

## Step 3: Trace Inspection
Unlike LLMs, which hallucinate and lack auditability, Old-AI breeds produce exact inference traces. View the trace to see exactly how MYCIN evaluated the facts against its certainty factors to arrive at its conclusion.
```bash
wpm cognition trace --receipt-id <id>
```
