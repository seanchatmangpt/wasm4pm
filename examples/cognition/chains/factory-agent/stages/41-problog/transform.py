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
  "intent": "compute the exact success probability of wet",
  "candidates": [],
  "facts": [
    {
      "key": "pfact:rain",
      "value": "0.2"
    },
    {
      "key": "pfact:sprinkler",
      "value": "0.2"
    },
    {
      "key": "pfact:hose",
      "value": "0.3"
    }
  ],
  "cases": [],
  "rules": [
    {
      "id": "r-rain",
      "premise": [
        "rain"
      ],
      "conclusion": "wet",
      "certainty": 1.0
    },
    {
      "id": "r-sprinkler",
      "premise": [
        "sprinkler"
      ],
      "conclusion": "wet",
      "certainty": 1.0
    },
    {
      "id": "r-hose",
      "premise": [
        "hose"
      ],
      "conclusion": "wet",
      "certainty": 1.0
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "query",
      "value": "wet"
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
