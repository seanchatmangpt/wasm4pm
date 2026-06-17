import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback1'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "fuzzy",
  "facts": [
    {"key": f"fuzzy:temp:hot_{c}", "value": "tri:10,30,50"},
    {"key": f"fuzzy:heat:change_{c}", "value": "tri:0,25,100"},
    {"key": "fuzzy:input:temp", "value": "30"}
  ],
  "rules": [
    {"id": "r1", "premise": [f"fuzzy:temp:hot_{c}"], "conclusion": f"fuzzy:heat:change_{c}", "certainty": 1.0}
  ], "candidates": [], "cases": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
