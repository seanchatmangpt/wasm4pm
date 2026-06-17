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
  "intent": "turn on the light and close door1",
  "candidates": [],
  "facts": [],
  "cases": [],
  "rules": [
    {
      "id": "turn-on-light",
      "premise": [
        "light=off"
      ],
      "conclusion": "light=on;!light=off",
      "certainty": 1
    },
    {
      "id": "close-door1",
      "premise": [
        "door1=open"
      ],
      "conclusion": "door1=closed;!door1=open",
      "certainty": 1
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "light",
      "value": "on"
    },
    {
      "id": "g2",
      "predicate": "door1",
      "value": "closed"
    }
  ],
  "state": [
    {
      "predicate": "light",
      "value": "off"
    },
    {
      "predicate": "door1",
      "value": "open"
    }
  ]
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
