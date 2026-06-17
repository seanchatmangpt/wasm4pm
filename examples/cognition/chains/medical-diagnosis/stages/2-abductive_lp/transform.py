import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback2'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "explain:obs",
  "facts": [
    {"key": "alp:abducible:A", "value": "true"},
    {"key": "alp:abducible:B", "value": "true"},
    {"key": f"background:r1_{c}", "value": "obs :- A"},
    {"key": f"background:r2_{c}", "value": "obs :- A, B"}
  ],
  "goals": [{"id": "g1", "predicate": "alp:observe", "value": "obs"}],
  "rules": [], "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
