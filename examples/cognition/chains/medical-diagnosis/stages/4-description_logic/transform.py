import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback4'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": f"subsumption:A_{c} SubClassOf C_{c}",
  "facts": [
    {"key": f"dl:subclass:A_{c}", "value": f"B_{c}"},
    {"key": f"dl:subclass:B_{c}", "value": f"C_{c}"}
  ],
  "goals": [{"id": "g1", "predicate": "dl:subsumes", "value": f"A_{c}:C_{c}"}],
  "rules": [], "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
