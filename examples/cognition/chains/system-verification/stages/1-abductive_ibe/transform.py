import json, sys
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or data.get('data', {}).get('output_hash') or 'fallback0'
clean_oh = "e_" + oh.replace("-", "")[:8]

out = {
  "intent": "coherence with " + clean_oh,
  "candidates": [
    { "id": "H1", "score": 0.5, "eliminated": False },
    { "id": "H2", "score": 0.5, "eliminated": False }
  ],
  "facts": [
    { "key": f"ibe:obs:{clean_oh}", "value": "true" },
    { "key": "ibe:obs:E2", "value": "true" },
    { "key": "ibe:hyp:H1:covers", "value": f"{clean_oh},E2" },
    { "key": "ibe:hyp:H1:cost", "value": "1.0" },
    { "key": "ibe:hyp:H2:covers", "value": f"{clean_oh}" },
    { "key": "ibe:hyp:H2:cost", "value": "1.0" }
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}
json.dump(out, sys.stdout, indent=2)