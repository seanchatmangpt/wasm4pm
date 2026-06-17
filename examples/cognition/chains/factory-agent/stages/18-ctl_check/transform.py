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
  "intent": "verify mutual exclusion safety",
  "candidates": [],
  "facts": [
    {
      "key": "ts:init",
      "value": "s0"
    },
    {
      "key": "ts:edge:s0",
      "value": "s1,s3"
    },
    {
      "key": "ts:edge:s1",
      "value": "s2,s5"
    },
    {
      "key": "ts:edge:s2",
      "value": "s0"
    },
    {
      "key": "ts:edge:s3",
      "value": "s4,s5"
    },
    {
      "key": "ts:edge:s4",
      "value": "s0"
    },
    {
      "key": "ts:edge:s5",
      "value": "s6,s7"
    },
    {
      "key": "ts:edge:s6",
      "value": "s3"
    },
    {
      "key": "ts:edge:s7",
      "value": "s1"
    },
    {
      "key": "ts:label:s1",
      "value": "t1"
    },
    {
      "key": "ts:label:s2",
      "value": "c1"
    },
    {
      "key": "ts:label:s3",
      "value": "t2"
    },
    {
      "key": "ts:label:s4",
      "value": "c2"
    },
    {
      "key": "ts:label:s5",
      "value": "t1,t2"
    },
    {
      "key": "ts:label:s6",
      "value": "c1,t2"
    },
    {
      "key": "ts:label:s7",
      "value": "t1,c2"
    },
    {
      "key": "ctl:formula",
      "value": "A G !(c1 & c2)"
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
