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
  "intent": "map the solar system onto the Rutherford atom",
  "candidates": [],
  "facts": [
    {
      "key": "base:0",
      "value": "(greater (mass sun) (mass planet))"
    },
    {
      "key": "base:1",
      "value": "(revolve planet sun)"
    },
    {
      "key": "base:2",
      "value": "(cause (greater (mass sun) (mass planet)) (revolve planet sun))"
    },
    {
      "key": "base:3",
      "value": "(greater (temperature sun) (temperature planet))"
    },
    {
      "key": "target:0",
      "value": "(greater (mass nucleus) (mass electron))"
    },
    {
      "key": "target:1",
      "value": "(revolve electron nucleus)"
    }
  ],
  "cases": [],
  "rules": [],
  "goals": [],
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
