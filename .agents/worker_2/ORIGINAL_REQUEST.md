## 2026-06-10T23:48:23-07:00
Your working directory is `/Users/sac/wasm4pm/.agents/worker_2`. You are Worker 2.
Objective: Populate and verify individual examples and chain stages for breeds 7-12:
7. `autoinstinct_learning` (Chain Stage `06-autoinstinct_learning`)
8. `autoinstinct_neurosis` (Chain Stage `07-autoinstinct_neurosis`)
9. `autoinstinct_semantics` (Chain Stage `08-autoinstinct_semantics`)
10. `autoinstinct_vision` (Chain Stage `09-autoinstinct_vision`)
11. `bayesian_network` (Chain Stage `10-bayesian_network`)
12. `belief_merging` (Chain Stage `11-belief_merging`)

For each of the 6 breeds, you must:
A. Create an example directory `examples/cognition/<breed>/`:
  - Read `/Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/<breed>.json` to extract the `input` field.
  - Write it as `intent.json` in the example directory.
  - Create `run.sh` inside the directory:
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    cd "$(dirname "$0")"
    if command -v wpm >/dev/null 2>&1; then
      WPM=wpm
    else
      REPO_ROOT="$(cd ../../.. && pwd)"
      WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
    fi
    $WPM cognition run --contract <breed> --input intent.json --format json | tee result.json
    ```
    (Note: replace <breed> with the actual breed_id). Make it executable!
  - Execute `bash run.sh` to generate the initial `result.json` and redirect its output logs to `last-output.log`.

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `06-autoinstinct_learning`, `07-autoinstinct_neurosis`, etc.):
  - Create a `transform.py` script:
    ```python
    import json
    import sys

    prev = json.load(sys.stdin)
    prev_payload = prev.get('payload', {})
    prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
    prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

    # Load base input from the template json
    base_input = ... # insert the extracted 'input' block for this breed

    # Cryptographically bind to prior stage
    if prev_output_hash:
        base_input['facts'].append({
            'key': 'prior_stage_hash',
            'value': f"{prev_breed}:{prev_output_hash}"
        })

    print(json.dumps(base_input, indent=2))
    ```
    Ensure the `transform.py` outputs a valid `BreedInput` JSON.

## 2026-06-11T18:31:44Z
Your task is to populate the `examples/cognition/` directories for the following cognition breeds:
- asp
- autoinstinct_learning
- autoinstinct_neurosis
- autoinstinct_semantics
- autoinstinct_vision

To do this:
1. Locate the input fixtures in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` (or `breed-inputs-real.ts` if applicable).
- Since `asp` is a periodic table breed, use `minimalAspInput()` from `breed-inputs.ts`.
- Since `autoinstinct_learning`, `autoinstinct_neurosis`, `autoinstinct_semantics`, `autoinstinct_vision` are classic/autoinstinct breeds, use the real functions from `packages/cognition/src/__tests__/fixtures/breed-inputs-real.ts`:
  - `realAutoinstinctLearningInput()`
  - `realAutoinstinctNeurosisInput()`
  - `realAutoinstinctSemanticsInput()`
  - `realAutoinstinctVisionInput()`
  Note: For autoinstinct breeds, the function returns an object `{ breed: string; contract: BreedInput }`. You must save the `contract` field.
2. Save the extracted BreedInput objects as formatted JSON to `examples/cognition/<breed_name>/intent.json`. Make sure the JSON keys match the `BreedInput` schema.
3. Run the shell script `examples/cognition/<breed_name>/run.sh` to execute the breed under the CLI, which generates `result.json` and logs.
4. Verify that the execution outputs contain no "fake" or placeholder strings and that the run is successful.
5. Report back with a summary of the generated files.
