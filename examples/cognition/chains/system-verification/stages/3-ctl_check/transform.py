import json, sys
_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = data.get('output_hash') or data.get('payload', {}).get('output_hash') or data.get('data', {}).get('output_hash') or 'fallback2'
clean_oh = "h" + oh.replace("-", "")[:8]

out = {
  "intent": "verify mutual exclusion safety with " + clean_oh,
  "candidates": [],
  "facts": [
    { "key": "ts:init", "value": "s0" },
    { "key": "ts:edge:s0", "value": "s1,s3" },
    { "key": "ts:edge:s1", "value": "s2,s5" },
    { "key": "ts:edge:s2", "value": "s0" },
    { "key": "ts:edge:s3", "value": "s4,s5" },
    { "key": "ts:edge:s4", "value": "s0" },
    { "key": "ts:edge:s5", "value": "s6,s7" },
    { "key": "ts:edge:s6", "value": "s3" },
    { "key": "ts:edge:s7", "value": "s1" },
    { "key": "ts:label:s0", "value": f"{clean_oh}" },
    { "key": "ts:label:s1", "value": "t1" },
    { "key": "ts:label:s2", "value": "c1" },
    { "key": "ts:label:s3", "value": "t2" },
    { "key": "ts:label:s4", "value": "c2" },
    { "key": "ts:label:s5", "value": "t1,t2" },
    { "key": "ts:label:s6", "value": "c1,t2" },
    { "key": "ts:label:s7", "value": "t1,c2" },
    { "key": "ctl:formula", "value": "A G !(c1 & c2)" }
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}
json.dump(out, sys.stdout, indent=2)