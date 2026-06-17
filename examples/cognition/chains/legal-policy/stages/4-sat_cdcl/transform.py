import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback4'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "sat",
  "facts": [
    {"key": "clause:1", "value": "1 -1"}
  ],
  "rules": [], "candidates": [], "cases": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
