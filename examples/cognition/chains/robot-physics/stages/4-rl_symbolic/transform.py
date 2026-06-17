#!/usr/bin/env python3
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
output_hash = prev.get("output_hash") or prev.get("payload", {}).get("output_hash") or "hash4"
action_name = f"go_{output_hash[:8]}"

next_input = {
  "intent": f"learn the optimal policy with dynamic action {action_name}",
  "candidates": [],
  "facts": [
    {"key": "mdp:gamma", "value": "0.9"},
    {"key": "mdp:start", "value": "s0"},
    {"key": "mdp:terminal:goal", "value": "true"},
    {"key": f"mdp:t:s0:{action_name}", "value": "goal"},
    {"key": "mdp:t:s0:stay", "value": "s0"},
    {"key": f"mdp:r:s0:{action_name}", "value": "1.0"},
    {"key": "rl:episodes", "value": "300"}
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

json.dump(next_input, sys.stdout, indent=2)