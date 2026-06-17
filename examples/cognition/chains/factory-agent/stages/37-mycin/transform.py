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
  "intent": "diagnose bacteremia organism and recommend antibiotic therapy",
  "candidates": [],
  "facts": [
    {
      "key": "gram-stain",
      "value": "gram-positive"
    },
    {
      "key": "morphology",
      "value": "coccus"
    },
    {
      "key": "growth-conformation",
      "value": "chains"
    },
    {
      "key": "site",
      "value": "blood"
    },
    {
      "key": "allergy-penicillin",
      "value": "no"
    }
  ],
  "rules": [
    {
      "id": "RULE050-class",
      "premise": [
        "gram-positive",
        "coccus",
        "chains"
      ],
      "conclusion": "organism=streptococcus",
      "certainty": 0.7
    },
    {
      "id": "RULE071-class",
      "premise": [
        "organism=streptococcus",
        "allergy-penicillin=no"
      ],
      "conclusion": "therapy=penicillin",
      "certainty": 0.9
    }
  ],
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
