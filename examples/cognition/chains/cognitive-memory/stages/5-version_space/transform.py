import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback5'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "learn",
  "facts": [
    {"key": "vs:attrs", "value": "attr1, attr2"},
    {"key": "vs:example:1", "value": f"val1_{c}, val2_{c}:+"}
  ],
  "rules": [], "candidates": [], "cases": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
