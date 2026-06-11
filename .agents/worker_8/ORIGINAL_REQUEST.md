## 2026-06-10T23:48:23-07:00
Objective: Populate and verify individual examples and chain stages for breeds 43-47:
43. `prolog` (Chain Stage `42-prolog`)
44. `qualitative_reason` (Chain Stage `43-qualitative_reason`)
45. `rl_symbolic` (Chain Stage `44-rl_symbolic`)
46. `sat_cdcl` (Chain Stage `45-sat_cdcl`)
47. `script_sam` (Chain Stage `46-script_sam`)

For each of the 5 breeds, you must:
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

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `42-prolog`, `43-qualitative_reason`, etc.):
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
