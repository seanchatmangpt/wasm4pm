import json, sys
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or data.get('data', {}).get('output_hash') or 'fallback1'
clean_oh = "h" + oh.replace("-", "")[:8]

out = {
  "intent": "learn the daughter relation with " + clean_oh,
  "candidates": [],
  "facts": [
    { "key": "bg:parent(ann,mary)", "value": "true" },
    { "key": "bg:parent(ann,tom)", "value": "true" },
    { "key": "bg:parent(tom,eve)", "value": "true" },
    { "key": f"bg:parent(tom,{clean_oh})", "value": "true" },
    { "key": "bg:female(ann)", "value": "true" },
    { "key": "bg:female(mary)", "value": "true" },
    { "key": "bg:female(eve)", "value": "true" },
    { "key": f"bg:female({clean_oh})", "value": "true" },
    { "key": "pos:daughter(mary,ann)", "value": "true" },
    { "key": "pos:daughter(eve,tom)", "value": "true" },
    { "key": f"pos:daughter({clean_oh},tom)", "value": "true" },
    { "key": "neg:daughter(tom,ann)", "value": "true" },
    { "key": "neg:daughter(eve,ann)", "value": "true" }
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}
json.dump(out, sys.stdout, indent=2)