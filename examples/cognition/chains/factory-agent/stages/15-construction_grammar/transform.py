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
  "intent": "parse a ditransitive",
  "facts": [
    {
      "key": "cxg:utterance",
      "value": "pat faxed bill the letter"
    },
    {
      "key": "lex:pat:pos",
      "value": "noun"
    },
    {
      "key": "lex:faxed:pos",
      "value": "verb"
    },
    {
      "key": "lex:faxed:valence",
      "value": "transitive"
    },
    {
      "key": "lex:bill:pos",
      "value": "noun"
    },
    {
      "key": "lex:the:pos",
      "value": "det"
    },
    {
      "key": "lex:letter:pos",
      "value": "noun"
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
