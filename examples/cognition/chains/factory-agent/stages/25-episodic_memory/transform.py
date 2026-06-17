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
  "intent": "recall the most relevant kitchen episode",
  "candidates": [],
  "facts": [
    {
      "key": "place",
      "value": "kitchen"
    },
    {
      "key": "cue:t",
      "value": "10"
    },
    {
      "key": "episode:ep-breakfast:t",
      "value": "9"
    },
    {
      "key": "episode:ep-dinner:t",
      "value": "2"
    }
  ],
  "cases": [
    {
      "id": "ep-breakfast",
      "intent": "morning meal",
      "architecture": "episode",
      "outcome_score": 0.5,
      "facts": [
        {
          "key": "place",
          "value": "kitchen"
        },
        {
          "key": "meal",
          "value": "breakfast"
        }
      ]
    },
    {
      "id": "ep-dinner",
      "intent": "evening meal",
      "architecture": "episode",
      "outcome_score": 0.5,
      "facts": [
        {
          "key": "place",
          "value": "kitchen"
        },
        {
          "key": "meal",
          "value": "dinner"
        }
      ]
    }
  ],
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
