import json, sys
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or data.get('data', {}).get('output_hash') or 'fallback3'
clean_oh = "ev" + oh.replace("-", "")[:8]

out = {
  "intent": "MAP inference on the smokes/friends MLN with " + clean_oh,
  "facts": [
    {
      "key": "mln:clause:smoke-cancer-a",
      "value": "1.5|!smokes_anna,cancer_anna"
    },
    {
      "key": "mln:clause:smoke-cancer-b",
      "value": "1.5|!smokes_bob,cancer_bob"
    },
    {
      "key": f"mln:clause:smoke-{clean_oh}",
      "value": f"2.0|!{clean_oh},cancer_anna"
    },
    {
      "key": "evidence:smokes_anna",
      "value": "true"
    },
    {
      "key": f"evidence:{clean_oh}",
      "value": "true"
    }
  ],
  "candidates": [],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}
json.dump(out, sys.stdout, indent=2)