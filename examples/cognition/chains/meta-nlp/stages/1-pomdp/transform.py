import sys
import json

def main():
    raw = sys.stdin.read()
    idx = raw.find('{')
    if idx >= 0:
        raw = raw[idx:]
    data = json.loads(raw)
    # Extract the hash regardless of envelope structure
    h0 = (
        data.get("output_hash")
        or data.get("payload", {}).get("output_hash")
        or data.get("data", {}).get("output_hash")
        or "fallback_hash"
    )[:8]

    # Inject h0 into observation name
    obs_name = f"hear-{h0}"

    intent = {
      "intent": f"tiger problem belief update with observation {h0}",
      "facts": [
        {"key": "pomdp:states", "value": "tiger-left,tiger-right"},
        {"key": "pomdp:actions", "value": "listen,open-left,open-right"},
        {"key": "pomdp:observations", "value": f"{obs_name},hear-right"},
        {"key": "pomdp:gamma", "value": "0.95"},
        {"key": "pomdp:horizon", "value": "3"},
        {"key": "pomdp:b0:tiger-left", "value": "0.5"},
        {"key": "pomdp:b0:tiger-right", "value": "0.5"},
        {"key": "pomdp:t:listen:tiger-left:tiger-left", "value": "1.0"},
        {"key": "pomdp:t:listen:tiger-left:tiger-right", "value": "0.0"},
        {"key": "pomdp:t:listen:tiger-right:tiger-left", "value": "0.0"},
        {"key": "pomdp:t:listen:tiger-right:tiger-right", "value": "1.0"},
        {"key": f"pomdp:o:listen:tiger-left:{obs_name}", "value": "0.85"},
        {"key": "pomdp:o:listen:tiger-left:hear-right", "value": "0.15"},
        {"key": f"pomdp:o:listen:tiger-right:{obs_name}", "value": "0.15"},
        {"key": "pomdp:o:listen:tiger-right:hear-right", "value": "0.85"},
        {"key": "pomdp:r:listen:tiger-left", "value": "-1.0"},
        {"key": "pomdp:r:listen:tiger-right", "value": "-1.0"},
        {"key": "pomdp:t:open-left:tiger-left:tiger-left", "value": "0.5"},
        {"key": "pomdp:t:open-left:tiger-left:tiger-right", "value": "0.5"},
        {"key": "pomdp:t:open-left:tiger-right:tiger-left", "value": "0.5"},
        {"key": "pomdp:t:open-left:tiger-right:tiger-right", "value": "0.5"},
        {"key": f"pomdp:o:open-left:tiger-left:{obs_name}", "value": "0.5"},
        {"key": "pomdp:o:open-left:tiger-left:hear-right", "value": "0.5"},
        {"key": f"pomdp:o:open-left:tiger-right:{obs_name}", "value": "0.5"},
        {"key": "pomdp:o:open-left:tiger-right:hear-right", "value": "0.5"},
        {"key": "pomdp:r:open-left:tiger-left", "value": "-100.0"},
        {"key": "pomdp:r:open-left:tiger-right", "value": "10.0"},
        {"key": "pomdp:t:open-right:tiger-left:tiger-left", "value": "0.5"},
        {"key": "pomdp:t:open-right:tiger-left:tiger-right", "value": "0.5"},
        {"key": "pomdp:t:open-right:tiger-right:tiger-left", "value": "0.5"},
        {"key": "pomdp:t:open-right:tiger-right:tiger-right", "value": "0.5"},
        {"key": f"pomdp:o:open-right:tiger-left:{obs_name}", "value": "0.5"},
        {"key": "pomdp:o:open-right:tiger-left:hear-right", "value": "0.5"},
        {"key": f"pomdp:o:open-right:tiger-right:{obs_name}", "value": "0.5"},
        {"key": "pomdp:o:open-right:tiger-right:hear-right", "value": "0.5"},
        {"key": "pomdp:r:open-right:tiger-left", "value": "10.0"},
        {"key": "pomdp:r:open-right:tiger-right", "value": "-100.0"},
        {"key": "pomdp:step:0", "value": f"listen|{obs_name}"}
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