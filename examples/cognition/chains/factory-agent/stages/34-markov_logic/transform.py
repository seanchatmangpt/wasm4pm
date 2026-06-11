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
  "intent": "MAP inference on the smokes/friends MLN",
  "facts": [
    {
      "key": "mln:clause:smoke-cancer-a",
      "value": "1.5|!smokes_anna,cancer_anna"
    },
    {
      "key": "mln:clause:smoke-cancer-b",
      "value": "1.5|!smokes_bob,cancer_bob"
    },
    {
      "key": "mln:clause:friends-ab-1",
      "value": "1.1|!friends_ab,!smokes_anna,smokes_bob"
    },
    {
      "key": "mln:clause:friends-ab-2",
      "value": "1.1|!friends_ab,!smokes_bob,smokes_anna"
    },
    {
      "key": "evidence:smokes_anna",
      "value": "true"
    },
    {
      "key": "evidence:friends_ab",
      "value": "true"
    }
  ],
  "candidates": [],
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
