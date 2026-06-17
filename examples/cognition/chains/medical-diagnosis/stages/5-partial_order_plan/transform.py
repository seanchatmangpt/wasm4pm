import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback5'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "plan",
  "facts": [
    {"key": f"pop:op:put_c_from_a_on_table_{c}:pre", "value": "clear_c,on_c_a"},
    {"key": f"pop:op:put_c_from_a_on_table_{c}:add", "value": "clear_a,ontable_c"},
    {"key": f"pop:op:put_c_from_a_on_table_{c}:del", "value": "on_c_a"},
    {"key": f"pop:op:put_a_on_b_{c}:pre", "value": "clear_a,clear_b,ontable_a"},
    {"key": f"pop:op:put_a_on_b_{c}:add", "value": "on_a_b"},
    {"key": f"pop:op:put_a_on_b_{c}:del", "value": "clear_b,ontable_a"},
    {"key": f"pop:op:put_b_on_c_{c}:pre", "value": "clear_b,clear_c,ontable_b"},
    {"key": f"pop:op:put_b_on_c_{c}:add", "value": "on_b_c"},
    {"key": f"pop:op:put_b_on_c_{c}:del", "value": "clear_c,ontable_b"}
  ],
  "rules": [],
  "goals": [
    {"id": "g1", "predicate": "on_a_b", "value": "true"},
    {"id": "g2", "predicate": "on_b_c", "value": "true"}
  ],
  "candidates": [], "cases": [], 
  "state": [
    {"predicate": "on_c_a", "value": "true"},
    {"predicate": "clear_c", "value": "true"},
    {"predicate": "clear_b", "value": "true"},
    {"predicate": "ontable_a", "value": "true"},
    {"predicate": "ontable_b", "value": "true"}
  ]
}
json.dump(out, sys.stdout)
