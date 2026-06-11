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
  "intent": "understand the restaurant story (Schank & Abelson 1977, Chapter 3)",
  "candidates": [],
  "facts": [
    {
      "key": "sam:event:1",
      "value": "enter:john"
    },
    {
      "key": "sam:event:2",
      "value": "order:john"
    },
    {
      "key": "sam:event:3",
      "value": "pay:john"
    },
    {
      "key": "sam:event:4",
      "value": "leave:john"
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
