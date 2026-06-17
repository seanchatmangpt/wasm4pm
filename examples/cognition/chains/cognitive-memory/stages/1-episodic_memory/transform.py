import sys, json
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or 'fallback1'
c = "c_" + oh.replace("-","")[:8]
out = {
  "intent": "recall",
  "facts": [
    {"key": "cue:t", "value": "10"}, 
    {"key": f"feat_{c}", "value": "true"},
    {"key": f"episode:ep_{c}:t", "value": "9"}
  ],
  "cases": [{"id": f"ep_{c}", "intent":"", "architecture":"", "outcome_score":1.0, "facts": [{"key": "timestamp", "value": "9"}, {"key": f"feat_{c}", "value": "true"}]}],
  "rules": [], "candidates": [], "goals": [], "state": []
}
json.dump(out, sys.stdout)
