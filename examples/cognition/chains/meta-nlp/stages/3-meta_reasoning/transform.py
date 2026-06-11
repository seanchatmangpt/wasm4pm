import sys
import json

def main():
    raw = sys.stdin.read()
    idx = raw.find('{')
    if idx >= 0:
        raw = raw[idx:]
    data = json.loads(raw)
    h2 = (
        data.get("output_hash")
        or data.get("payload", {}).get("output_hash")
        or data.get("data", {}).get("output_hash")
        or "fallback_hash"
    )[:8]

    intent = {
      "intent": f"arbitrate with h2 {h2}",
      "facts": [
        {"key": "breed:mycin:conclusion", "value": f"therapy={h2}"},
        {"key": "breed:mycin:confidence", "value": "0.9"},
        {"key": "breed:prolog:conclusion", "value": "therapy=none"},
        {"key": "breed:prolog:confidence", "value": "0.4"}
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