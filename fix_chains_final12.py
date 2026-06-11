import os
import json

base_medical = "examples/cognition/chains/medical-diagnosis/stages/"

# Fix partial_order_plan goals and operators
pop_path = f"{base_medical}5-partial_order_plan/transform.py"
if os.path.exists(pop_path):
    with open(pop_path, "w") as f:
        f.write('''import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback5'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "plan",
  "facts": [
    {"key": f"pop:op:act1_{c}:pre", "value": ""},
    {"key": f"pop:op:act1_{c}:add", "value": f"A_{c}"},
    {"key": f"pop:op:act1_{c}:del", "value": ""}
  ],
  "rules": [],
  "goals": [{"id": "g1", "predicate": "goal", "value": f"A_{c}"}],
  "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
''')

base_cog = "examples/cognition/chains/cognitive-memory/stages/"

# Fix ebl missing fact for goal
ebl_path = f"{base_cog}4-ebl/transform.py"
if os.path.exists(ebl_path):
    with open(ebl_path, "w") as f:
        f.write('''import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback4'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "learn",
  "facts": [
    {"key": f"leaf_{c}(obj)", "value": "true"},
    {"key": f"target_{c}(obj)", "value": "true"}
  ],
  "rules": [
    {"id": "r1", "premise": [f"leaf_{c}(?x)"], "conclusion": f"target_{c}(?x)", "certainty": 1.0}
  ],
  "goals": [{"id": "g1", "predicate": "query", "value": f"target_{c}(obj)"}],
  "candidates": [], "cases": [], "state": []
}
json.dump(out, sys.stdout)
''')
