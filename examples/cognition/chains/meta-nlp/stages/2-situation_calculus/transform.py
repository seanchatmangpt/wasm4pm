import sys
import json

def main():
    raw = sys.stdin.read()
    idx = raw.find('{')
    if idx >= 0:
        raw = raw[idx:]
    data = json.loads(raw)
    h1 = (
        data.get("output_hash")
        or data.get("payload", {}).get("output_hash")
        or data.get("data", {}).get("output_hash")
        or "fallback_hash"
    )[:8]

    intent = {
      "intent": f"progress blocks world with color_{h1}",
      "facts": [
        {"key": "fluent:on_a_b", "value": "true"},
        {"key": "fluent:on_b_table", "value": "true"},
        {"key": "fluent:clear_a", "value": "true"},
        {"key": "fluent:handempty", "value": "true"},
        {"key": f"fluent:color_b_{h1}", "value": "true"},
        {"key": "action:pickup_a:pre", "value": "clear_a"},
        {"key": "action:pickup_a:pre", "value": "handempty"},
        {"key": "action:pickup_a:pre", "value": "on_a_b"},
        {"key": "action:pickup_a:add", "value": "holding_a"},
        {"key": "action:pickup_a:add", "value": "clear_b"},
        {"key": "action:pickup_a:del", "value": "on_a_b"},
        {"key": "action:pickup_a:del", "value": "handempty"},
        {"key": "action:pickup_a:del", "value": "clear_a"},
        {"key": "action:putdown_a:pre", "value": "holding_a"},
        {"key": "action:putdown_a:add", "value": "on_a_table"},
        {"key": "action:putdown_a:add", "value": "handempty"},
        {"key": "action:putdown_a:add", "value": "clear_a"},
        {"key": "action:putdown_a:del", "value": "holding_a"},
        {"key": "do:0", "value": "pickup_a"},
        {"key": "do:1", "value": "putdown_a"}
      ],
      "candidates": [],
      "cases": [],
      "rules": [],
      "goals": [],
      "state": []
    }
    
    print(json.dumps(intent, indent=2))

if __name__ == "__main__":
    main()