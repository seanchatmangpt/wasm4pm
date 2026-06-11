import os
import json
import subprocess

stages_info = [
    ("30-hearsay", "hearsay", "hearsay"), # stage_name, breed, prior_source (for test)
    ("31-htn_planning", "htn_planning", "30-hearsay"),
    ("32-ilp", "ilp", "31-htn_planning"),
    ("33-ltl_monitor", "ltl_monitor", "32-ilp"),
    ("34-markov_logic", "markov_logic", "33-ltl_monitor"),
    ("35-mdp", "mdp", "34-markov_logic")
]

repo_root = "/Users/sac/wasm4pm"
stages_base_dir = os.path.join(repo_root, "examples/cognition/chains/factory-agent/stages")

for stage_name, breed, prior_source in stages_info:
    print(f"Creating stage {stage_name} for breed {breed}")
    stage_dir = os.path.join(stages_base_dir, stage_name)
    os.makedirs(stage_dir, exist_ok=True)
    
    # Load base input from the template json
    fixture_path = os.path.join(repo_root, f"packages/cognition/src/__tests__/fixtures/papers/{breed}.json")
    with open(fixture_path, 'r') as f:
        data = json.load(f)
    intent_data = data["input"]
    
    # Write transform.py
    transform_py_content = f"""import json
import sys

prev = json.load(sys.stdin)
prev_payload = prev.get('payload', {{}})
prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

# Load base input from the template json
base_input = json.loads(r'''{json.dumps(intent_data, indent=2)}''')

# Cryptographically bind to prior stage
if prev_output_hash:
    base_input['facts'].append({{
        'key': 'prior_stage_hash',
        'value': f"{{prev_breed}}:{{prev_output_hash}}"
    }})

print(json.dumps(base_input, indent=2))
"""
    transform_path = os.path.join(stage_dir, "transform.py")
    with open(transform_path, 'w') as f:
        f.write(transform_py_content)
        
    print(f"Written transform.py to {transform_path}")

print("All transform.py scripts written successfully!")
