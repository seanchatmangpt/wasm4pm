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
  "intent": "learn the optimal policy for the two-state goal task",
  "candidates": [],
  "facts": [
    {
      "key": "mdp:gamma",
      "value": "0.9"
    },
    {
      "key": "mdp:start",
      "value": "s0"
    },
    {
      "key": "mdp:terminal:goal",
      "value": "true"
    },
    {
      "key": "mdp:t:s0:go",
      "value": "goal"
    },
    {
      "key": "mdp:t:s0:stay",
      "value": "s0"
    },
    {
      "key": "mdp:r:s0:go",
      "value": "1.0"
    },
    {
      "key": "rl:episodes",
      "value": "300"
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
