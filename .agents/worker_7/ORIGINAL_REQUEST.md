## 2026-06-11T06:48:23Z
Objective: Populate and verify individual examples and chain stages for breeds 37-42:
37. `meta_reasoning` (Chain Stage `36-meta_reasoning`)
38. `mycin` (Chain Stage `37-mycin`)
39. `naive_physics` (Chain Stage `38-naive_physics`)
40. `partial_order_plan` (Chain Stage `39-partial_order_plan`)
41. `pomdp` (Chain Stage `40-pomdp`)
42. `problog` (Chain Stage `41-problog`)

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

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `36-meta_reasoning`, `37-mycin`, etc.):
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
You are a Worker subagent (Subagent 7).
Your task is to populate the `examples/cognition/` directories for the following cognition breeds:
- hearsay
- htn_planning
- ilp
- ltl_monitor
- markov_logic

To do this:
1. Locate the input fixtures in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` (or `breed-inputs-real.ts` if applicable).
- For `hearsay` (classic breed), use `realHearsayInput()` from `packages/cognition/src/__tests__/fixtures/breed-inputs-real.ts`.
- For `htn_planning`, `ilp`, `ltl_monitor`, `markov_logic` (periodic table breeds), use minimal functions from `breed-inputs.ts`:
  - `minimalHtnPlanningInput()`
  - `minimalIlpInput()`
  - `minimalLtlMonitorInput()`
  - `minimalMarkovLogicInput()` or similar
2. Save the extracted BreedInput objects as formatted JSON to `examples/cognition/<breed_name>/intent.json`. Make sure the JSON keys match the `BreedInput` schema.
3. Run the shell script `examples/cognition/<breed_name>/run.sh` to execute the breed under the CLI, which generates `result.json` and logs.
4. Verify that the execution outputs contain no "fake" or placeholder strings and that the run is successful.
5. Report back with a summary of the generated files.
