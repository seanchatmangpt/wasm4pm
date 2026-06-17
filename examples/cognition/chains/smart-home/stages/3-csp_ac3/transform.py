import sys
import json

_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = (data.get('output_hash')
      or data.get('payload', {}).get('output_hash')
      or data.get('data', {}).get('output_hash')
      or 'unknown_fuzzy_hash')
h = oh[:8]

intent = {
  "intent": f"color the constraint network with {h}",
  "facts": [
    {
      "key": "csp-var",
      "value": f"X_{h}:B,G,R"
    },
    {
      "key": "csp-var",
      "value": f"Y_{h}:B,G,R"
    },
    {
      "key": "csp-var",
      "value": f"Z_{h}:B,G,R"
    },
    {
      "key": "csp-constraint",
      "value": f"X_{h}!=Y_{h}"
    },
    {
      "key": "csp-constraint",
      "value": f"Y_{h}!=Z_{h}"
    },
    {
      "key": "csp-constraint",
      "value": f"X_{h}!=Z_{h}"
    }
  ],
  "candidates": [],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

print(json.dumps(intent, indent=2))
