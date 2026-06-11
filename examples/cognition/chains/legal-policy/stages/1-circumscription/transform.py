import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback1'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "circ",
  "facts": [{"key": "applies", "value": "true"}],
  "rules": [{"id":"r1","premise":["applies", f"not ab_{c}"],"conclusion":f"lawful_{c}","certainty":1.0}],
  "goals": [{"id": "g1", "predicate": "query", "value": f"lawful_{c}"}],
  "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
