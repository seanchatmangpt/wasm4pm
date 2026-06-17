import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback2'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "merge",
  "facts": [
    {"key": "bm:atoms", "value": f"lawful_{c},fair"},
    {"key": "bm:base:1", "value": f"lawful_{c},fair"},
    {"key": "bm:base:2", "value": f"lawful_{c},-fair"},
    {"key": "bm:ic:1", "value": "fair"}
  ],
  "rules": [], "candidates": [], "cases": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
