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
  "intent": "transform propositional logic expression L1 into L0 using symbolic-logic rules",
  "candidates": [],
  "facts": [],
  "cases": [],
  "rules": [
    {
      "id": "R6",
      "premise": [
        "expr=L1"
      ],
      "conclusion": "expr=L2;!expr=L1",
      "certainty": 1
    },
    {
      "id": "R12",
      "premise": [
        "expr=L2"
      ],
      "conclusion": "expr=L0;!expr=L2",
      "certainty": 1
    }
  ],
  "goals": [
    {
      "id": "goal-1",
      "predicate": "expr",
      "value": "L0"
    }
  ],
  "state": [
    {
      "predicate": "expr",
      "value": "L1"
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
