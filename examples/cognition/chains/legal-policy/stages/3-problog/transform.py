import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback3'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "prob",
  "facts": [
    {"key": f"pfact:valid_{c}", "value": "0.8"}
  ],
  "goals": [{"id": "g1", "predicate": "query", "value": f"valid_{c}"}],
  "rules": [], "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
