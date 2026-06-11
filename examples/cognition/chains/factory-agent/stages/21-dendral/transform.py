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
  "intent": "identify molecular structure from mass-spectrometry fragmentation constraints",
  "candidates": [
    {
      "id": "ketone-F1-C2H5-C2H5",
      "score": 0.91,
      "eliminated": false
    },
    {
      "id": "ketone-F2-CH3-C3H7",
      "score": 0.84,
      "eliminated": false
    },
    {
      "id": "ketone-F3-CH3-C3H7-branched",
      "score": 0.78,
      "eliminated": false
    },
    {
      "id": "ketone-F4-C4H9-CH3",
      "score": 0.72,
      "eliminated": false
    },
    {
      "id": "ether-F5-C2H5-O-C2H5",
      "score": 0.45,
      "eliminated": false
    },
    {
      "id": "amine-F6-C2H5-NH-C2H5",
      "score": 0.38,
      "eliminated": false
    },
    {
      "id": "ketone-F7-C4H9-CH3-iso",
      "score": 0.66,
      "eliminated": false
    },
    {
      "id": "ketone-F8-CH3-CH3-C2H4",
      "score": 0.55,
      "eliminated": false
    }
  ],
  "facts": [
    {
      "key": "molecular-formula",
      "value": "C5H10O"
    },
    {
      "key": "molecular-weight",
      "value": "86"
    },
    {
      "key": "constraint",
      "value": "forbid:ether-F5-C2H5-O-C2H5"
    },
    {
      "key": "constraint",
      "value": "forbid:amine-F6-C2H5-NH-C2H5"
    },
    {
      "key": "constraint",
      "value": "forbid:ketone-F7-C4H9-CH3-iso"
    },
    {
      "key": "constraint",
      "value": "forbid:ketone-F8-CH3-CH3-C2H4"
    },
    {
      "key": "spectral-line",
      "value": "57"
    },
    {
      "key": "spectral-line",
      "value": "29"
    },
    {
      "key": "spectral-line",
      "value": "86"
    },
    {
      "key": "spectral-line",
      "value": "71"
    },
    {
      "key": "spectral-line",
      "value": "43"
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
