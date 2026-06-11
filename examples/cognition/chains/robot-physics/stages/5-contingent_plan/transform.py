#!/usr/bin/env python3
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
output_hash = prev.get("output_hash") or prev.get("payload", {}).get("output_hash") or "hash5"
var_name = f"dirt_{output_hash[:8]}"
act_name = f"suck_{output_hash[:8]}"

next_input = {
  "intent": f"vacuum world contingent plan with dynamic dirt {var_name}",
  "candidates": [],
  "facts": [
    {"key": "cp:unknown", "value": var_name},
    {"key": f"cp:goal:{var_name}", "value": "false"},
    {"key": f"cp:act:{act_name}:pre", "value": var_name},
    {"key": f"cp:act:{act_name}:del", "value": var_name},
    {"key": "cp:sense:check-dirt", "value": var_name}
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

json.dump(next_input, sys.stdout, indent=2)