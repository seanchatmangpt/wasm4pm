#!/usr/bin/env python3
import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
output_hash = prev.get("output_hash") or prev.get("payload", {}).get("output_hash") or "hash3"
state_name = f"s_{output_hash[:8]}"

next_input = {
  "intent": f"solve the chain MDP including the dynamically injected state {state_name}",
  "candidates": [],
  "facts": [
    {"key": "mdp:gamma", "value": "0.9"},
    {"key": "mdp:trans:s0:go", "value": "s1:1.0"},
    {"key": "mdp:trans:s0:stay", "value": "s0:1.0"},
    {"key": "mdp:reward:s0:stay", "value": "0.1"},
    {"key": "mdp:trans:s1:go", "value": "goal:1.0"},
    {"key": "mdp:reward:s1:go", "value": "2.0"},
    {"key": "mdp:trans:goal:stay", "value": "goal:1.0"},
    {"key": f"mdp:trans:{state_name}:go", "value": "goal:1.0"},
    {"key": f"mdp:reward:{state_name}:go", "value": "1.0"}
  ],
  "cases": [],
  "rules": [],
  "goals": [],
  "state": []
}

json.dump(next_input, sys.stdout, indent=2)