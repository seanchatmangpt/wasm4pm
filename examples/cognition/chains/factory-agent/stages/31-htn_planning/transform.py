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
  "intent": "deliver the package",
  "state": [
    {
      "predicate": "pkg",
      "value": "at_depot"
    },
    {
      "predicate": "truck",
      "value": "at_depot"
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "task",
      "value": "deliver"
    }
  ],
  "rules": [
    {
      "id": "method:deliver:by_truck",
      "premise": [
        "pkg=at_depot"
      ],
      "conclusion": "op:load;op:drive;op:unload",
      "certainty": 1.0
    },
    {
      "id": "op:load",
      "premise": [
        "pkg=at_depot",
        "truck=at_depot"
      ],
      "conclusion": "!pkg=at_depot;pkg=in_truck",
      "certainty": 1.0
    },
    {
      "id": "op:drive",
      "premise": [
        "truck=at_depot"
      ],
      "conclusion": "!truck=at_depot;truck=at_dest",
      "certainty": 1.0
    },
    {
      "id": "op:unload",
      "premise": [
        "pkg=in_truck",
        "truck=at_dest"
      ],
      "conclusion": "!pkg=in_truck;pkg=at_dest",
      "certainty": 1.0
    }
  ],
  "candidates": [],
  "facts": [],
  "cases": []
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
