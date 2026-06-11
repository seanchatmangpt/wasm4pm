import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
prev_payload = prev.get('payload', {})
prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

# Load base input from the template json
base_input = json.loads(r'''{
  "intent": "learn safe_to_stack",
  "facts": [
    {
      "key": "weight(obj1,light)",
      "value": "true"
    },
    {
      "key": "weight(obj2,heavy)",
      "value": "true"
    }
  ],
  "rules": [
    {
      "id": "r_safe",
      "premise": [
        "lighter(?x,?y)"
      ],
      "conclusion": "safe_to_stack(?x,?y)",
      "certainty": 1.0
    },
    {
      "id": "r_lighter",
      "premise": [
        "weight(?x,light)",
        "weight(?y,heavy)"
      ],
      "conclusion": "lighter(?x,?y)",
      "certainty": 1.0
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "safe_to_stack(obj1,obj2)",
      "value": "true"
    }
  ],
  "candidates": [],
  "cases": [],
  "state": []
}''')

# Cryptographically bind to prior stage
if prev_output_hash:
    if 'facts' not in base_input:
        base_input['facts'] = []
    base_input['facts'].append({
        'key': 'prior_stage_hash',
        'value': f"{prev_breed}:{prev_output_hash}"
    })

print(json.dumps(base_input, indent=2))
