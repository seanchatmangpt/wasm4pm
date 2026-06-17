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
  "intent": "diagnose burglary from phone calls",
  "facts": [
    {
      "key": "cpt:B",
      "value": "0.001"
    },
    {
      "key": "cpt:E",
      "value": "0.002"
    },
    {
      "key": "cpt:A|B,E",
      "value": "0.001,0.29,0.94,0.95"
    },
    {
      "key": "cpt:J|A",
      "value": "0.05,0.90"
    },
    {
      "key": "cpt:M|A",
      "value": "0.01,0.70"
    },
    {
      "key": "evidence:J",
      "value": "true"
    },
    {
      "key": "evidence:M",
      "value": "true"
    }
  ],
  "goals": [
    {
      "id": "g1",
      "predicate": "query",
      "value": "prob:B"
    }
  ],
  "candidates": [],
  "cases": [],
  "rules": [],
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
