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
  "intent": "progress blocks world through pickup(a); putdown(a, table)",
  "candidates": [],
  "facts": [
    {
      "key": "fluent:on_a_b",
      "value": "true"
    },
    {
      "key": "fluent:on_b_table",
      "value": "true"
    },
    {
      "key": "fluent:clear_a",
      "value": "true"
    },
    {
      "key": "fluent:handempty",
      "value": "true"
    },
    {
      "key": "fluent:color_b_red",
      "value": "true"
    },
    {
      "key": "action:pickup_a:pre",
      "value": "clear_a"
    },
    {
      "key": "action:pickup_a:pre",
      "value": "handempty"
    },
    {
      "key": "action:pickup_a:pre",
      "value": "on_a_b"
    },
    {
      "key": "action:pickup_a:add",
      "value": "holding_a"
    },
    {
      "key": "action:pickup_a:add",
      "value": "clear_b"
    },
    {
      "key": "action:pickup_a:del",
      "value": "on_a_b"
    },
    {
      "key": "action:pickup_a:del",
      "value": "handempty"
    },
    {
      "key": "action:pickup_a:del",
      "value": "clear_a"
    },
    {
      "key": "action:putdown_a:pre",
      "value": "holding_a"
    },
    {
      "key": "action:putdown_a:add",
      "value": "on_a_table"
    },
    {
      "key": "action:putdown_a:add",
      "value": "handempty"
    },
    {
      "key": "action:putdown_a:add",
      "value": "clear_a"
    },
    {
      "key": "action:putdown_a:del",
      "value": "holding_a"
    },
    {
      "key": "do:0",
      "value": "pickup_a"
    },
    {
      "key": "do:1",
      "value": "putdown_a"
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
