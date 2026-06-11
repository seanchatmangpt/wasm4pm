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
  "intent": "explain the wet grass observation (KKT 1992 Section 1)",
  "candidates": [],
  "facts": [
    {
      "key": "alp:abducible:rained",
      "value": "true"
    },
    {
      "key": "alp:abducible:sprinkler_on",
      "value": "true"
    }
  ],
  "cases": [],
  "rules": [
    {
      "id": "r1",
      "premise": [
        "rained"
      ],
      "conclusion": "grass_wet",
      "certainty": 1.0
    },
    {
      "id": "r2",
      "premise": [
        "sprinkler_on"
      ],
      "conclusion": "grass_wet",
      "certainty": 1.0
    }
  ],
  "goals": [
    {
      "id": "o1",
      "predicate": "alp:observe",
      "value": "grass_wet"
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
