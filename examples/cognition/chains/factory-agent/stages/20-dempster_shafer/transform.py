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
  "intent": "combine two witnesses",
  "rules": [
    {
      "id": "witness1",
      "premise": [],
      "conclusion": "life",
      "certainty": 0.9
    },
    {
      "id": "witness1",
      "premise": [],
      "conclusion": "life,death",
      "certainty": 0.1
    },
    {
      "id": "witness2",
      "premise": [],
      "conclusion": "life",
      "certainty": 0.9
    },
    {
      "id": "witness2",
      "premise": [],
      "conclusion": "life,death",
      "certainty": 0.1
    }
  ],
  "goals": [
    {
      "id": "query",
      "predicate": "query",
      "value": "life"
    }
  ],
  "candidates": [],
  "facts": [],
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
