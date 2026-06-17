import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback3'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": f"query:flies:tweety",
  "facts": [
    {"key": "obs:tweety", "value": "bird(tweety)"}
  ],
  "rules": [
    {"id": f"r_isa", "premise": ["bird(tweety)"], "conclusion": "bird(tweety)", "certainty": 1.0},
    {"id": f"d1_{c}", "premise": ["bird(tweety)", "unless:not_flies(tweety)"], "conclusion": "flies(tweety)", "certainty": 1.0}
  ],
  "goals": [{"id": "g1", "predicate": "query", "value": "flies(tweety)"}],
  "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
