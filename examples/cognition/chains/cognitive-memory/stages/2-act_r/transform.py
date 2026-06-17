import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback2'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "retrieve",
  "facts": [
    {"key": "query_time", "value": "10.0"}
  ],
  "cases": [{"id": f"chunk_{c}", "intent":"", "architecture":"", "outcome_score":1.0, "facts": [{"key": "base_level", "value": "1.0"}]}],
  "rules": [{"id": f"p1_{c}", "premise": [], "conclusion": "retrieve_chunk", "certainty": 1.0}], "candidates": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
