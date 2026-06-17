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
  "intent": "learn the EnjoySport concept by candidate elimination",
  "candidates": [],
  "facts": [
    {
      "key": "vs:attrs",
      "value": "sky,airtemp,humidity,wind,water,forecast"
    },
    {
      "key": "vs:example:1",
      "value": "Sunny,Warm,Normal,Strong,Warm,Same:+"
    },
    {
      "key": "vs:example:2",
      "value": "Sunny,Warm,High,Strong,Warm,Same:+"
    },
    {
      "key": "vs:example:3",
      "value": "Rainy,Cold,High,Strong,Warm,Change:-"
    },
    {
      "key": "vs:example:4",
      "value": "Sunny,Warm,High,Strong,Cool,Change:+"
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
