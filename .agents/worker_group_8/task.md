# Task: Generate Breed Examples - Group 8

## Assigned Breeds
- `situation_calculus`
- `circumscription`
- `analogy_sme`
- `act_r`
- `problog`

## Instructions
1. For each assigned breed, check if `examples/cognition/<breed>/` exists. If not, create it.
2. If `intent.json` is not present, find the paper fixture JSON under `packages/cognition/src/__tests__/fixtures/papers/<breed>.json`. Extract the `"input"` field and save it as `intent.json` in the breed directory. If the file is not there, check other papers or create a representative input conforming to the breed schema.
3. Write `run.sh` in the breed directory, using the standard structure to execute the breed with `wpm cognition run` and tee/redirect output to `result.json` and `last-output.log`.
4. Run the script `bash run.sh` to generate the initial `result.json` and `last-output.log` files.
5. Verify that each breed's execution returns `status: "ok"`.
6. Write a summary of your execution in `handoff.md` and notify the orchestrator.
