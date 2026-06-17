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
  "intent": "tiger problem belief update",
  "facts": [
    {
      "key": "pomdp:states",
      "value": "tiger-left,tiger-right"
    },
    {
      "key": "pomdp:actions",
      "value": "listen,open-left,open-right"
    },
    {
      "key": "pomdp:observations",
      "value": "hear-left,hear-right"
    },
    {
      "key": "pomdp:gamma",
      "value": "0.95"
    },
    {
      "key": "pomdp:horizon",
      "value": "3"
    },
    {
      "key": "pomdp:b0:tiger-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:b0:tiger-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:listen:tiger-left:tiger-left",
      "value": "1.0"
    },
    {
      "key": "pomdp:t:listen:tiger-left:tiger-right",
      "value": "0.0"
    },
    {
      "key": "pomdp:t:listen:tiger-right:tiger-left",
      "value": "0.0"
    },
    {
      "key": "pomdp:t:listen:tiger-right:tiger-right",
      "value": "1.0"
    },
    {
      "key": "pomdp:o:listen:tiger-left:hear-left",
      "value": "0.85"
    },
    {
      "key": "pomdp:o:listen:tiger-left:hear-right",
      "value": "0.15"
    },
    {
      "key": "pomdp:o:listen:tiger-right:hear-left",
      "value": "0.15"
    },
    {
      "key": "pomdp:o:listen:tiger-right:hear-right",
      "value": "0.85"
    },
    {
      "key": "pomdp:r:listen:tiger-left",
      "value": "-1.0"
    },
    {
      "key": "pomdp:r:listen:tiger-right",
      "value": "-1.0"
    },
    {
      "key": "pomdp:t:open-left:tiger-left:tiger-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-left:tiger-left:tiger-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-left:tiger-right:tiger-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-left:tiger-right:tiger-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-left:tiger-left:hear-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-left:tiger-left:hear-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-left:tiger-right:hear-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-left:tiger-right:hear-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:r:open-left:tiger-left",
      "value": "-100.0"
    },
    {
      "key": "pomdp:r:open-left:tiger-right",
      "value": "10.0"
    },
    {
      "key": "pomdp:t:open-right:tiger-left:tiger-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-right:tiger-left:tiger-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-right:tiger-right:tiger-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:t:open-right:tiger-right:tiger-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-right:tiger-left:hear-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-right:tiger-left:hear-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-right:tiger-right:hear-left",
      "value": "0.5"
    },
    {
      "key": "pomdp:o:open-right:tiger-right:hear-right",
      "value": "0.5"
    },
    {
      "key": "pomdp:r:open-right:tiger-left",
      "value": "10.0"
    },
    {
      "key": "pomdp:r:open-right:tiger-right",
      "value": "-100.0"
    },
    {
      "key": "pomdp:step:0",
      "value": "listen|hear-left"
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
