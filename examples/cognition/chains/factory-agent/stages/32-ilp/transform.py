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
  "intent": "learn the daughter relation",
  "candidates": [],
  "facts": [
    {
      "key": "bg:parent(ann,mary)",
      "value": "true"
    },
    {
      "key": "bg:parent(ann,tom)",
      "value": "true"
    },
    {
      "key": "bg:parent(tom,eve)",
      "value": "true"
    },
    {
      "key": "bg:parent(tom,ian)",
      "value": "true"
    },
    {
      "key": "bg:female(ann)",
      "value": "true"
    },
    {
      "key": "bg:female(mary)",
      "value": "true"
    },
    {
      "key": "bg:female(eve)",
      "value": "true"
    },
    {
      "key": "pos:daughter(mary,ann)",
      "value": "true"
    },
    {
      "key": "pos:daughter(eve,tom)",
      "value": "true"
    },
    {
      "key": "neg:daughter(tom,ann)",
      "value": "true"
    },
    {
      "key": "neg:daughter(eve,ann)",
      "value": "true"
    },
    {
      "key": "neg:daughter(ian,tom)",
      "value": "true"
    },
    {
      "key": "neg:daughter(ann,mary)",
      "value": "true"
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
