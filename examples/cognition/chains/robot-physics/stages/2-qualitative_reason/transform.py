#!/usr/bin/env python3
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
output_hash = prev.get("output_hash") or prev.get("payload", {}).get("output_hash") or "hash2"
var_name = f"h_{output_hash[:8]}"

next_input = {
  "intent": f"envision the pressure-regulator valve confluence with injected hash var {var_name}",
  "candidates": [],
  "facts": [
    {"key": "qr:confluence:valve", "value": "+p,+a,-q"},
    {"key": "qr:sign:p", "value": "+"},
    {"key": "qr:sign:a", "value": "-"},
    {"key": "qr:confluence:dyn", "value": f"+{var_name},-dyn_v"},
    {"key": f"qr:sign:{var_name}", "value": "+"}
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

json.dump(next_input, sys.stdout, indent=2)