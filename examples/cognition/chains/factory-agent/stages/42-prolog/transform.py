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
  "intent": "prove parent(bob, ann) from the family fact base (Kowalski 1974)",
  "candidates": [],
  "facts": [
    {
      "key": "parent",
      "value": "tom-bob"
    },
    {
      "key": "parent",
      "value": "bob-ann"
    },
    {
      "key": "parent",
      "value": "bob-pat"
    }
  ],
  "rules": [],
  "goals": [
    {
      "id": "g1",
      "predicate": "parent",
      "value": "bob-ann"
    }
  ],
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
