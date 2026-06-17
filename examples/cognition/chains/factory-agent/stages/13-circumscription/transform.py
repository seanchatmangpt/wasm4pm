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
  "intent": "circumscribe abnormality over the bird/penguin theory",
  "candidates": [],
  "facts": [
    {
      "key": "bird_tweety",
      "value": "true"
    },
    {
      "key": "bird_opus",
      "value": "true"
    },
    {
      "key": "penguin_opus",
      "value": "true"
    }
  ],
  "cases": [],
  "rules": [
    {
      "id": "r-fly-tweety",
      "premise": [
        "bird_tweety",
        "not_ab_bird_tweety"
      ],
      "conclusion": "flies_tweety",
      "certainty": 1.0
    },
    {
      "id": "r-fly-opus",
      "premise": [
        "bird_opus",
        "not_ab_bird_opus"
      ],
      "conclusion": "flies_opus",
      "certainty": 1.0
    },
    {
      "id": "r-penguin-ab",
      "premise": [
        "penguin_opus"
      ],
      "conclusion": "ab_bird_opus",
      "certainty": 1.0
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "entail",
      "value": "flies_tweety"
    },
    {
      "id": "g2",
      "predicate": "entail",
      "value": "flies_opus"
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
