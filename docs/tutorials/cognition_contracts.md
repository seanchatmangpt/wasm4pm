# Tutorial: Executing Cognition Contracts

## Learning Objectives
In this tutorial, you will:
1. Understand the difference between an ML pipeline and an Old-AI cognition breed.
2. Select one of the 9 available, strictly-typed `BreedId` systems.
3. Execute a MYCIN forward-chaining contract.
4. Validate the deterministic inference trace.

## Step 1: The Contract Input
Cognition contracts require a `BreedInput` JSON file. This file contains the facts and rules matching the breed's mathematical model.

Example `intent.json` for the `prolog` breed:
```json
{
  "intent": "verify-policy",
  "facts": [
    { "key": "user_role", "value": "admin" }
  ],
  "rules": [
    {
      "id": "R1",
      "premise": ["user_role=admin"],
      "conclusion": "access_granted",
      "certainty": 1.0
    }
  ],
  "candidates": [],
  "cases": [],
  "goals": ["access_granted"],
  "state": []
}
```

## Step 2: Execution
Run the cognition engine using the `cognition run` command. You must specify the contract name (for tracking) and the input file.

```bash
wpm cognition run --contract my-policy-check --input intent.json
```

Under the hood, this leverages the strictly-typed TypeScript bindings in `@wasm4pm/cognition` to dispatch to the WebAssembly kernel.

## Step 3: Receipt Verification
Unlike LLMs, which hallucinate and lack auditability, Old-AI breeds produce exact inference traces and BLAKE3 receipts. You can verify the integrity of a generated receipt:

```bash
wpm verify .wasm4pm/receipts/<id>.json
```
