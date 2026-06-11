import sys
import json

_raw = sys.stdin.read()
_idx = _raw.find('{')
data = json.loads(_raw[_idx:]) if _idx != -1 else {}
oh = (data.get('output_hash')
      or data.get('payload', {}).get('output_hash')
      or data.get('data', {}).get('output_hash')
      or 'unknown_csp_hash')
h = oh[:8]

intent = {
  "intent": f"deliver the package {h}",
  "state": [
    {
      "predicate": f"pkg_{h}",
      "value": "at_depot"
    },
    {
      "predicate": f"truck_{h}",
      "value": "at_depot"
    }
  ],
  "goals": [
    {
      "id": f"g1_{h}",
      "predicate": "task",
      "value": f"deliver_{h}"
    }
  ],
  "rules": [
    {
      "id": f"method:deliver_{h}:by_truck_{h}",
      "premise": [
        f"pkg_{h}=at_depot"
      ],
      "conclusion": f"op:load_{h};op:drive_{h};op:unload_{h}",
      "certainty": 1.0
    },
    {
      "id": f"op:load_{h}",
      "premise": [
        f"pkg_{h}=at_depot",
        f"truck_{h}=at_depot"
      ],
      "conclusion": f"!pkg_{h}=at_depot;pkg_{h}=in_truck",
      "certainty": 1.0
    },
    {
      "id": f"op:drive_{h}",
      "premise": [
        f"truck_{h}=at_depot"
      ],
      "conclusion": f"!truck_{h}=at_depot;truck_{h}=at_dest",
      "certainty": 1.0
    },
    {
      "id": f"op:unload_{h}",
      "premise": [
        f"pkg_{h}=in_truck",
        f"truck_{h}=at_dest"
      ],
      "conclusion": f"!pkg_{h}=in_truck;pkg_{h}=at_dest",
      "certainty": 1.0
    }
  ],
  "candidates": [],
  "facts": [],
  "cases": []
}

print(json.dumps(intent, indent=2))
