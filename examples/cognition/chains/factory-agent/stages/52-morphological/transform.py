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
  "intent": "solve",
  "candidates": [],
  "facts": [
    {
      "key": "morph:param:chemical-reactions",
      "value": "self-contained|air-propelled|water-propelled|earth-propelled"
    },
    {
      "key": "morph:param:thrust-augmentation-1",
      "value": "no-motion|translatory-motion|rotary-motion|oscillatory-motion"
    },
    {
      "key": "morph:param:thrust-augmentation-2",
      "value": "no-augmentation|internal-augmentation|external-augmentation"
    },
    {
      "key": "morph:param:propellant-state",
      "value": "gaseous|liquid|solid"
    },
    {
      "key": "morph:param:operating-mode",
      "value": "continuous|intermittent"
    },
    {
      "key": "morph:param:reactivity",
      "value": "self-igniting|external-ignition"
    },
    {
      "key": "morph:exclude",
      "value": "chemical-reactions=self-contained|thrust-augmentation-1=no-motion"
    }
  ],
  "rules": [],
  "cases": [],
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