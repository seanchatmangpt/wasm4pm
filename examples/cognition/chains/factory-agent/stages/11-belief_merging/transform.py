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
  "intent": "merge the conflicting profile under Sigma aggregation",
  "candidates": [],
  "facts": [
    {
      "key": "bm:atoms",
      "value": "p,q"
    },
    {
      "key": "bm:base:1",
      "value": "p,q"
    },
    {
      "key": "bm:base:2",
      "value": "p,q"
    },
    {
      "key": "bm:base:3",
      "value": "-p,-q"
    },
    {
      "key": "bm:ic",
      "value": "true"
    },
    {
      "key": "bm:operator",
      "value": "sum"
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
