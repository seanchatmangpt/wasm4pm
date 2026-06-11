import sys
import json

_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = (data.get('output_hash')
      or data.get('payload', {}).get('output_hash')
      or data.get('data', {}).get('output_hash')
      or 'unknown_htn_hash')
h = oh[:8]

intent = {
  "intent": f"solve arithmetic constraints with {h}",
  "candidates": [],
  "facts": [
    {
      "key": f"clp:var:x_{h}",
      "value": "6..9"
    },
    {
      "key": f"clp:var:y_{h}",
      "value": "0..9"
    },
    {
      "key": f"clp:constraint:c1_{h}",
      "value": f"x_{h}=y_{h}+3"
    },
    {
      "key": f"clp:constraint:c2_{h}",
      "value": f"y_{h}<4"
    }
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

print(json.dumps(intent, indent=2))
