import os
import json
import subprocess

stages_info = [
    ("30-hearsay", "hearsay", "/Users/sac/wasm4pm/examples/cognition/hearsay/result.json"),
    ("31-htn_planning", "htn_planning", "30-hearsay"),
    ("32-ilp", "ilp", "31-htn_planning"),
    ("33-ltl_monitor", "ltl_monitor", "32-ilp"),
    ("34-markov_logic", "markov_logic", "33-ltl_monitor"),
    ("35-mdp", "mdp", "34-markov_logic")
]

repo_root = "/Users/sac/wasm4pm"
stages_base_dir = os.path.join(repo_root, "examples/cognition/chains/factory-agent/stages")
wpm_bin = os.path.join(repo_root, "apps/wasm4pm/dist/bin/wpm.js")

for i, (stage_name, breed, prior_source) in enumerate(stages_info):
    print(f"\n--- Verifying stage: {stage_name} (breed: {breed}) ---")
    stage_dir = os.path.join(stages_base_dir, stage_name)
    transform_py = os.path.join(stage_dir, "transform.py")
    intent_json_path = os.path.join(stage_dir, "intent.json")
    result_json_path = os.path.join(stage_dir, "result.json")
    
    # Identify the prior result.json file path
    if i == 0:
        prior_result_path = prior_source
    else:
        prior_result_path = os.path.join(stages_base_dir, prior_source, "result.json")
        
    print(f"Reading prior result: {prior_result_path}")
    if not os.path.exists(prior_result_path):
        raise FileNotFoundError(f"Prior result file not found: {prior_result_path}")
        
    # Run transform.py
    print(f"Running transform.py < {prior_result_path} > {intent_json_path}")
    with open(prior_result_path, 'r') as prior_file:
        intent_content = subprocess.check_output(["python3", transform_py], stdin=prior_file)
        
    with open(intent_json_path, 'wb') as intent_file:
        intent_file.write(intent_content)
        
    # Check that intent.json is valid
    parsed_intent = json.loads(intent_content.decode('utf-8'))
    print("Generated intent.json has prior_stage_hash:")
    has_prior_hash = False
    for fact in parsed_intent.get('facts', []):
        if fact.get('key') == 'prior_stage_hash':
            print(f"  {fact.get('key')}: {fact.get('value')}")
            has_prior_hash = True
    if not has_prior_hash:
        print("  WARNING: No prior_stage_hash found in facts (expected if prior had no output_hash, but check!)")
        
    # Run wpm
    print(f"Running wpm cognition run for {breed}...")
    run_cmd = [
        "node", wpm_bin, "cognition" ,"run",
        "--contract", breed,
        "--input", intent_json_path,
        "--format", "json"
    ]
    result_content = subprocess.check_output(run_cmd)
    
    with open(result_json_path, 'wb') as result_file:
        result_file.write(result_content)
        
    # Parse result
    parsed_result = json.loads(result_content.decode('utf-8'))
    status = parsed_result.get('status') or parsed_result.get('payload', {}).get('status')
    print(f"Stage status: {status}")
    if status not in ["ok", "success"]:
        raise ValueError(f"Stage failed! Status: {status}")
    
    output_hash = parsed_result.get('output_hash') or parsed_result.get('payload', {}).get('output_hash') or parsed_result.get('payload', {}).get('output', {}).get('output_hash')
    print(f"Stage output hash: {output_hash}")
    
print("\n=== All 6 stages successfully verified! ===")
