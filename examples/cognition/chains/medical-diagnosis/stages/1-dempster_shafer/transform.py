import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback1'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "combine",
  "rules": [
    {"id": f"m1_fever_{c}", "premise": [], "conclusion": f"bpa:{{fever_{c}}}", "certainty": 0.8},
    {"id": f"m2_fever_cold_{c}", "premise": [], "conclusion": f"bpa:{{fever_{c}, cold}}", "certainty": 0.6}
  ],
  "goals": [{"id": "g1", "predicate": "query", "value": f"fever_{c}"}],
  "facts": [], "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
