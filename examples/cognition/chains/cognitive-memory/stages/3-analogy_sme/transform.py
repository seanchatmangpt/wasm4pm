import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback3'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "match",
  "facts": [
    {"key": "base:1", "value": f"(rel a b_{c})"},
    {"key": "target:1", "value": f"(rel x y_{c})"}
  ],
  "rules": [], "candidates": [], "cases": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
