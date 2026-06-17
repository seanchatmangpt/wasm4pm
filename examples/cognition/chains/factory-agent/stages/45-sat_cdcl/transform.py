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
  "intent": "decide pigeonhole PHP(3,2)",
  "candidates": [],
  "facts": [
    {
      "key": "clause:00",
      "value": "1 2"
    },
    {
      "key": "clause:01",
      "value": "3 4"
    },
    {
      "key": "clause:02",
      "value": "5 6"
    },
    {
      "key": "clause:03",
      "value": "-1 -3"
    },
    {
      "key": "clause:04",
      "value": "-1 -5"
    },
    {
      "key": "clause:05",
      "value": "-3 -5"
    },
    {
      "key": "clause:06",
      "value": "-2 -4"
    },
    {
      "key": "clause:07",
      "value": "-2 -6"
    },
    {
      "key": "clause:08",
      "value": "-4 -6"
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
