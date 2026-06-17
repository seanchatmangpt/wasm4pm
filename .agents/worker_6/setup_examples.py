import os
import json
import subprocess

breeds = ["hearsay", "htn_planning", "ilp", "ltl_monitor", "markov_logic", "mdp"]
repo_root = "/Users/sac/wasm4pm"

for breed in breeds:
    print(f"Processing breed: {breed}")
    # Paths
    fixture_path = os.path.join(repo_root, f"packages/cognition/src/__tests__/fixtures/papers/{breed}.json")
    example_dir = os.path.join(repo_root, f"examples/cognition/{breed}")
    
    # 1. Ensure directory exists
    os.makedirs(example_dir, exist_ok=True)
    
    # 2. Extract and write intent.json
    with open(fixture_path, 'r') as f:
        data = json.load(f)
    intent_data = data["input"]
    
    intent_path = os.path.join(example_dir, "intent.json")
    with open(intent_path, 'w') as f:
        json.dump(intent_data, f, indent=2)
    
    # 3. Create run.sh
    run_sh_content = f"""#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
$WPM cognition run --contract {breed} --input intent.json --format json | tee result.json
"""
    run_sh_path = os.path.join(example_dir, "run.sh")
    with open(run_sh_path, 'w') as f:
        f.write(run_sh_content)
        
    # Make executable
    os.chmod(run_sh_path, 0o755)
    
    # 4. Execute run.sh and redirect output logs to last-output.log
    log_path = os.path.join(example_dir, "last-output.log")
    print(f"Running run.sh for {breed} and saving log to {log_path}...")
    with open(log_path, 'w') as log_file:
        subprocess.run(["bash", "run.sh"], cwd=example_dir, stdout=log_file, stderr=subprocess.STDOUT)
    print(f"Finished {breed}")
