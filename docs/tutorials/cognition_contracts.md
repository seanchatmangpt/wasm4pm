# Tutorial: Executing Cognition Contracts

## Learning Objectives
In this tutorial, you will:
1. Understand the difference between an ML pipeline and an Old-AI cognition breed.
2. Execute a MYCIN forward-chaining contract.
3. Validate the inference trace.

## Step 1: The Contract
Cognition contracts define the `breed` and the `input` ruleset. 
Create a file `mycin_rules.json` with your domain constraints.

## Step 2: Execution
Run the cognition engine:
```bash
wpm cognition run --contract mycin --input mycin_rules.json
```

## Step 3: Trace Inspection
Unlike LLMs, Old-AI breeds produce exact inference traces. View the trace to see exactly how MYCIN arrived at its conclusion.
```bash
wpm cognition trace --receipt-id <id>
```
