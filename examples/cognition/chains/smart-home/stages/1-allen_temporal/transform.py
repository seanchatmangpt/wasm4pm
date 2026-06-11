import sys
import json

_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = (data.get('output_hash')
      or data.get('payload', {}).get('output_hash')
      or data.get('data', {}).get('output_hash')
      or 'unknown_ltl_hash')

intent = {
  "intent": f"propagate temporal constraints using {oh[:8]}",
  "facts": [
    {
      "key": "relation",
      "value": f"A,B_{oh[:8]},m"
    },
    {
      "key": "relation",
      "value": f"B_{oh[:8]},C,d"
    }
  ],
  "candidates": [],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

print(json.dumps(intent, indent=2))
