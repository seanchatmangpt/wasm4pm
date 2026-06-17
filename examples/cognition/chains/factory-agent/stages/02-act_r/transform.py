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
  "intent": "retrieve the sum of 3 + 4",
  "candidates": [],
  "facts": [
    {
      "key": "goal",
      "value": "add"
    },
    {
      "key": "addend1",
      "value": "3"
    },
    {
      "key": "addend2",
      "value": "4"
    }
  ],
  "cases": [
    {
      "id": "fact34",
      "intent": "addition fact",
      "architecture": "declarative-chunk",
      "outcome_score": 0.5,
      "facts": [
        {
          "key": "addend1",
          "value": "3"
        },
        {
          "key": "addend2",
          "value": "4"
        },
        {
          "key": "sum",
          "value": "7"
        }
      ]
    },
    {
      "id": "fact35",
      "intent": "addition fact",
      "architecture": "declarative-chunk",
      "outcome_score": 0.3,
      "facts": [
        {
          "key": "addend1",
          "value": "3"
        },
        {
          "key": "addend2",
          "value": "5"
        },
        {
          "key": "sum",
          "value": "8"
        }
      ]
    }
  ],
  "rules": [
    {
      "id": "p-retrieve-sum",
      "premise": [
        "goal=add"
      ],
      "conclusion": "retrieve:addend1=3",
      "certainty": 0.9
    }
  ],
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
