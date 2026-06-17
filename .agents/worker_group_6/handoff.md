# Handoff - Breed Examples Group 6

## 1. Observation
- Created/verified example directories, run scripts, inputs, and results for Group 6 breeds under `examples/cognition/`:
  - `abductive_lp`:
    - `intent.json` (686 bytes)
    - `run.sh` (296 bytes)
    - `result.json` (3139 bytes)
    - `last-output.log` (3323 bytes)
  - `abductive_ibe`:
    - `intent.json` (843 bytes)
    - `run.sh` (297 bytes)
    - `result.json` (2872 bytes)
    - `last-output.log` (3056 bytes)
  - `partial_order_plan`:
    - `intent.json` (1455 bytes)
    - `run.sh` (302 bytes)
    - `result.json` (5967 bytes)
    - `last-output.log` (6151 bytes)
  - `event_calculus`:
    - `intent.json` (1085 bytes)
    - `run.sh` (298 bytes)
    - `result.json` (3833 bytes)
    - `last-output.log` (4017 bytes)
  - `mdp`:
    - `intent.json` (665 bytes)
    - `run.sh` (287 bytes)
    - `result.json` (2645 bytes)
    - `last-output.log` (2829 bytes)
- Execution of `wpm cognition run` for each breed outputs a valid JSON with:
  - `"status": "ok"`
  - `"payload": { "status": "ok", ... }`
- Verified statuses using `python3` queries against the generated `result.json` files:
  - `abductive_lp` output hash: `1d2b00a9181d2b4fab228ef326cd8674e80cf66ff8cb0eb538f6c00bb33a0d3c`
  - `abductive_ibe` output hash: `03505d975e04bcd59423ba1adc670229459c85b2d5d4f57d63ab1ab64b5b5a66`
  - `partial_order_plan` output hash: `f5974881fde5e8af559c4aa1e9ebfe8a5b1ad86ca53423b8dfcc00c8878d7885`
  - `event_calculus` output hash: `6cc023f07186f504fd5959fb0a69c977db1e2ca49208aeed9431039d391a2192`
  - `mdp` output hash: `a233ae442bf64a09f829b5dbbf87bfac7d18475c8649093bb556b4cddfe92b62`

## 2. Logic Chain
1. Checked if example directories and configurations exist.
2. Verified that each breed's intent input matches the extraction or structure conforming to the breed schema.
3. Created/verified `run.sh` files targeting each contract.
4. Executed `bash run.sh > last-output.log 2>&1` in each directory.
5. Parsed `result.json` to verify that `status` and `payload.status` are both `"ok"`.
6. Staged new files (`intent.json`, `run.sh`, `result.json`) to git for all 5 breeds under `examples/cognition/`.

## 3. Caveats
- Execution relies on local `wpm.js` build (`apps/wasm4pm/dist/bin/wpm.js`). Ensure wpm has been built before running.
- Logs (`last-output.log`) are gitignored via root `.gitignore` pattern `*.log`, which is the intended behavior.

## 4. Conclusion
All Group 6 breed examples are fully functional, successfully execute via the cognition runtime, return status `"ok"`, and are correctly staged/tracked in git.

## 5. Verification Method
- Execute the following command from the repository root:
  ```bash
  for breed in abductive_lp abductive_ibe partial_order_plan event_calculus mdp; do
    echo "=== $breed ==="
    python3 -c "import json; d=json.load(open('examples/cognition/$breed/result.json')); print('Status:', d.get('status')); print('Payload Status:', d.get('payload', {}).get('status'))"
  done
  ```
  Expected output for each breed is `Status: ok` and `Payload Status: ok`.

---

## Change Tracker
- **Files modified**:
  - `examples/cognition/abductive_lp/*`: Added `intent.json`, `run.sh`, `result.json`
  - `examples/cognition/abductive_ibe/*`: Added `intent.json`, `run.sh`, `result.json`
  - `examples/cognition/partial_order_plan/*`: Added `intent.json`, `run.sh`, `result.json`
  - `examples/cognition/event_calculus/*`: Added `intent.json`, `run.sh`, `result.json`
  - `examples/cognition/mdp/*`: Added `intent.json`, `run.sh`, `result.json`
- **Build status**: Pass
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass
- **Lint status**: 0 outstanding violations
- **Tests added/modified**: None

## Loaded Skills
- None
