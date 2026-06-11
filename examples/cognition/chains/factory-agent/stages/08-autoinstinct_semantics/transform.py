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
  "intent": "John give book to Mary",
  "facts": [
    {
      "key": "cd_primitive",
      "value": "ATRANS"
    },
    {
      "key": "actor",
      "value": "John"
    },
    {
      "key": "object",
      "value": "book"
    },
    {
      "key": "from",
      "value": "John"
    },
    {
      "key": "to",
      "value": "Mary"
    },
    {
      "key": "instrument",
      "value": "ATRANS(actor=John,object=ownership,from=John,to=Mary)"
    },
    {
      "key": "tense",
      "value": "past"
    },
    {
      "key": "mode",
      "value": "positive"
    }
  ],
  "candidates": [],
  "rules": [],
  "cases": [],
  "goals": [
    {
      "id": "g-parse",
      "predicate": "parse_sentence",
      "value": "John give book to Mary"
    },
    {
      "id": "g-primitive",
      "predicate": "identify_cd_primitive",
      "value": "ATRANS"
    },
    {
      "id": "g-actor",
      "predicate": "identify_actor",
      "value": "John"
    },
    {
      "id": "g-recipient",
      "predicate": "identify_recipient",
      "value": "Mary"
    }
  ],
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
