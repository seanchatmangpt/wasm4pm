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
  "intent": "classify the EL medical ontology from Baader-Brandt-Lutz 2005",
  "candidates": [],
  "facts": [
    {
      "key": "dl:subclass:Pericarditis",
      "value": "Inflammation"
    },
    {
      "key": "dl:subclass:Inflammation",
      "value": "Disease"
    },
    {
      "key": "dl:exists_rhs:Pericarditis",
      "value": "has_location.Heart"
    },
    {
      "key": "dl:exists_lhs:has_location.Heart",
      "value": "HasLocationHeart"
    },
    {
      "key": "dl:conj:Disease+HasLocationHeart",
      "value": "HeartDisease"
    }
  ],
  "cases": [],
  "rules": [],
  "goals": [
    {
      "id": "q1",
      "predicate": "dl:subsumes",
      "value": "Pericarditis:HeartDisease"
    },
    {
      "id": "q2",
      "predicate": "dl:subsumes",
      "value": "HeartDisease:Pericarditis"
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
