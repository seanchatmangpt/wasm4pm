## 2026-06-10T23:48:23-07:00
Objective: Populate and verify individual examples and chain stages for breeds 48-52:
48. `situation_calculus` (Chain Stage `47-situation_calculus`)
49. `soar` (Chain Stage `48-soar`)
50. `strips` (Chain Stage `49-strips`)
51. `tableaux` (Chain Stage `50-tableaux`)
52. `version_space` (Chain Stage `51-version_space`)

For each of the 5 breeds, you must:
A. Create an example directory `examples/cognition/<breed>/:
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

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `47-situation_calculus`, `48-soar`, etc.):
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

## 2026-06-11T18:31:45Z
Your task is to populate the `examples/cognition/` directories for the following cognition breeds:
- pomdp
- problog
- prolog
- qualitative_reason
- rl_symbolic
- sat_cdcl

To do this:
1. Locate the input fixtures in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` (or `breed-inputs-real.ts` if applicable).
- For `pomdp`, `problog`, `qualitative_reason`, `rl_symbolic`, `sat_cdcl` (periodic table breeds), use minimal functions from `breed-inputs.ts`:
  - `minimalPomdpInput()` or similar
  - `minimalProblogInput()`
  - `minimalQualitativeReasonInput()`
  - `minimalRlSymbolicInput()`
  - `minimalSatCdclInput()`
- For `prolog` (classic breed), use `realPrologInput()` from `packages/cognition/src/__tests__/fixtures/breed-inputs-real.ts`.
2. Save the extracted BreedInput objects as formatted JSON to `examples/cognition/<breed_name>/intent.json`. Make sure the JSON keys match the `BreedInput` schema.
3. Run the shell script `examples/cognition/<breed_name>/run.sh` to execute the breed under the CLI, which generates `result.json` and logs.
4. Verify that the execution outputs contain no "fake" or placeholder strings and that the run is successful.
5. Report back with a summary of the generated files.
