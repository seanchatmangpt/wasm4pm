## 2026-06-10T23:48:23Z
Your working directory is `/Users/sac/wasm4pm/.agents/worker_4`. You are Worker 4.
Objective: Populate and verify individual examples and chain stages for breeds 19-24:
19. `ctl_check` (Chain Stage `18-ctl_check`)
20. `default_logic` (Chain Stage `19-default_logic`)
21. `dempster_shafer` (Chain Stage `20-dempster_shafer`)
22. `dendral` (Chain Stage `21-dendral`)
23. `description_logic` (Chain Stage `22-description_logic`)
24. `ebl` (Chain Stage `23-ebl`)

For each of the 6 breeds, you must:
A. Create an example directory `examples/cognition/<breed>/`:
  - Read `/Users/sac/wasm4pm/packages/cognition/src/__tests__/fixtures/papers/<breed>.json` to extract the `input` field.
  - Write it as `intent.json` in the example directory.
  - Create `run.sh` inside the directory:
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail
    cd "\$(dirname "\$0")"
    if command -v wpm >/dev/null 2>&1; then
      WPM=wpm
    else
      REPO_ROOT="\$(cd ../../.. && pwd)"
      WPM="\$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
    fi
    \$WPM cognition run --contract <breed> --input intent.json --format json | tee result.json
    ```
    (Note: replace <breed> with the actual breed_id). Make it executable!
  - Execute `bash run.sh` to generate the initial `result.json` and redirect its output logs to `last-output.log`.

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `18-ctl_check`, `19-default_logic`, etc.):
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

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When completed, report back with your findings and file list.

## 2026-06-11T18:31:44Z
You are a Worker subagent (Subagent 4).
Your task is to populate the `examples/cognition/` directories for the following cognition breeds:
- construction_grammar
- contingent_plan
- csp_ac3
- ctl_check
- default_logic

To do this:
1. Locate the input fixtures in `packages/cognition/src/__tests__/fixtures/breed-inputs.ts` (or `breed-inputs-real.ts` if applicable).
- Since these are periodic table breeds, use the minimal functions from `packages/cognition/src/__tests__/fixtures/breed-inputs.ts`:
  - `minimalConstructionGrammarInput()` or similar (verify the exact function name in breed-inputs.ts)
  - `minimalContingentPlanInput()`
  - `minimalCspAc3Input()`
  - `minimalCtlCheckInput()`
  - `minimalDefaultLogicInput()`
2. Save the extracted BreedInput objects as formatted JSON to `examples/cognition/<breed_name>/intent.json`. Make sure the JSON keys match the `BreedInput` schema.
3. Run the shell script `examples/cognition/<breed_name>/run.sh` to execute the breed under the CLI, which generates `result.json` and logs.
4. Verify that the execution outputs contain no "fake" or placeholder strings and that the run is successful.
5. Report back with a summary of the generated files.

