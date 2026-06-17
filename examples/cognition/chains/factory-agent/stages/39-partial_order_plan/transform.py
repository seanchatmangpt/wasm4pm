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
  "intent": "solve the Sussman anomaly with SNLP causal-link planning",
  "candidates": [],
  "facts": [
    {
      "key": "pop:op:put_c_from_a_on_table:pre",
      "value": "clear_c,on_c_a"
    },
    {
      "key": "pop:op:put_c_from_a_on_table:add",
      "value": "clear_a,ontable_c"
    },
    {
      "key": "pop:op:put_c_from_a_on_table:del",
      "value": "on_c_a"
    },
    {
      "key": "pop:op:put_a_on_b:pre",
      "value": "clear_a,clear_b,ontable_a"
    },
    {
      "key": "pop:op:put_a_on_b:add",
      "value": "on_a_b"
    },
    {
      "key": "pop:op:put_a_on_b:del",
      "value": "clear_b,ontable_a"
    },
    {
      "key": "pop:op:put_b_on_c:pre",
      "value": "clear_b,clear_c,ontable_b"
    },
    {
      "key": "pop:op:put_b_on_c:add",
      "value": "on_b_c"
    },
    {
      "key": "pop:op:put_b_on_c:del",
      "value": "clear_c,ontable_b"
    }
  ],
  "cases": [],
  "rules": [],
  "goals": [
    {
      "id": "g1",
      "predicate": "on_a_b",
      "value": "true"
    },
    {
      "id": "g2",
      "predicate": "on_b_c",
      "value": "true"
    }
  ],
  "state": [
    {
      "predicate": "on_c_a",
      "value": "true"
    },
    {
      "predicate": "clear_c",
      "value": "true"
    },
    {
      "predicate": "clear_b",
      "value": "true"
    },
    {
      "predicate": "ontable_a",
      "value": "true"
    },
    {
      "predicate": "ontable_b",
      "value": "true"
    }
  ]
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
