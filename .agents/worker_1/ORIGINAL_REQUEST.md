## 2026-06-10T23:48:23-07:00
Your working directory is `/Users/sac/wasm4pm/.agents/worker_1`. You are Worker 1.
Objective: Populate and verify individual examples and chain stages for breeds 1-6:
1. `abductive_ibe` (Chain Stage `00-abductive_ibe`)
2. `abductive_lp` (Chain Stage `01-abductive_lp`)
3. `act_r` (Chain Stage `02-act_r`)
4. `allen_temporal` (Chain Stage `03-allen_temporal`)
5. `analogy_sme` (Chain Stage `04-analogy_sme`)
6. `asp` (Chain Stage `05-asp`)

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

B. Create a chain stage directory under `examples/cognition/chains/factory-agent/stages/<stage_name>/` (e.g., `00-abductive_ibe`, `01-abductive_lp`, etc.):
  - For stage `00-abductive_ibe` (first stage), copy the `intent.json` from the example directory. No `transform.py` is needed for stage 0.
  - For stages 01-05, create a `transform.py` script:
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
