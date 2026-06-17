import os
import json

base_dir = "examples/cognition"
stages_dir = "examples/cognition/chains/factory-agent/stages"

# 1. Get alphabetical list of all 52 breeds
breeds = sorted([d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d)) and d not in ["chains", "tutorial"]])

# 2. Iterate and check/populate stage folders
for i, breed in enumerate(breeds):
    stage_num = f"{i:02d}"
    folder_name = f"{stage_num}-{breed}"
    stage_path = os.path.join(stages_dir, folder_name)
    
    # Create directory if it does not exist
    if not os.path.exists(stage_path):
        os.makedirs(stage_path)
        print(f"Created directory: {stage_path}")
        
    # Write transform.py for all stages except stage 00
    if i > 0:
        transform_path = os.path.join(stage_path, "transform.py")
        # Read breed's intent.json
        intent_path = os.path.join(base_dir, breed, "intent.json")
        if not os.path.exists(intent_path):
            print(f"Error: {intent_path} does not exist!")
            continue
        with open(intent_path, "r") as f:
            intent_content = f.read()
            
        # Parse and serialize to ensure it is valid JSON
        try:
            intent_json = json.loads(intent_content)
        except Exception as e:
            print(f"Error parsing JSON for {breed}: {e}")
            continue
            
        # Make sure facts list exists
        if "facts" not in intent_json:
            intent_json["facts"] = []
            
        intent_str = json.dumps(intent_json, indent=2)
        
        # Write transform.py
        code = f"""import json
import sys

prev = json.load(sys.stdin)
prev_payload = prev.get('payload', {{}})
prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

# Load base input from the template json
base_input = json.loads(r'''{intent_str}''')

# Cryptographically bind to prior stage
if prev_output_hash:
    if 'facts' not in base_input:
        base_input['facts'] = []
    base_input['facts'].append({{
        'key': 'prior_stage_hash',
        'value': f"{{prev_breed}}:{{prev_output_hash}}"
    }})

print(json.dumps(base_input, indent=2))
"""
        with open(transform_path, "w") as tf:
            tf.write(code)
        print(f"Populated/overwrote transform.py in: {stage_path}")
