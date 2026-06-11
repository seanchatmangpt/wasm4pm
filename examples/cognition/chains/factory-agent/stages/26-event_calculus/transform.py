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
  "intent": "evaluate HoldsAt queries over the Kowalski-Sergot hired/promoted narrative",
  "candidates": [],
  "facts": [
    {
      "key": "ec:happens:2",
      "value": "hire"
    },
    {
      "key": "ec:happens:5",
      "value": "promote"
    },
    {
      "key": "ec:initiates:hire",
      "value": "employed"
    },
    {
      "key": "ec:initiates:hire",
      "value": "lecturer"
    },
    {
      "key": "ec:initiates:promote",
      "value": "professor"
    },
    {
      "key": "ec:terminates:promote",
      "value": "lecturer"
    }
  ],
  "cases": [],
  "rules": [],
  "goals": [
    {
      "id": "q1",
      "predicate": "ec:holdsat",
      "value": "lecturer@4"
    },
    {
      "id": "q2",
      "predicate": "ec:holdsat",
      "value": "lecturer@7"
    },
    {
      "id": "q3",
      "predicate": "ec:holdsat",
      "value": "professor@7"
    },
    {
      "id": "q4",
      "predicate": "ec:holdsat",
      "value": "employed@7"
    },
    {
      "id": "q5",
      "predicate": "ec:holdsat",
      "value": "professor@4"
    }
  ],
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
