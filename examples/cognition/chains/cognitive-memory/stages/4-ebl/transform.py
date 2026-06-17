import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback4'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "learn",
  "facts": [
    {"key": f"weight(obj1_{c},light)", "value": "true"},
    {"key": f"weight(obj2_{c},heavy)", "value": "true"}
  ],
  "rules": [
    {"id": "r_safe", "premise": ["lighter(?x,?y)"], "conclusion": f"safe_to_stack_{c}(?x,?y)", "certainty": 1.0},
    {"id": "r_lighter", "premise": ["weight(?x,light)", "weight(?y,heavy)"], "conclusion": "lighter(?x,?y)", "certainty": 1.0}
  ],
  "goals": [{"id": "g1", "predicate": f"safe_to_stack_{c}(obj1_{c},obj2_{c})", "value": "true"}],
  "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
