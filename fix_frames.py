import os
import json

fi_path = "examples/cognition/chains/legal-policy/stages/0-frames_inheritance/intent.json"
if os.path.exists(fi_path):
    with open(fi_path, "w") as f:
        json.dump({
          "intent": "resolve SpecificLaw applies",
          "facts": [
            { "key": "frame:Law:slot:applies:default", "value": "true" },
            { "key": "frame:SpecificLaw:isa", "value": "Law" }
          ],
          "goals": [{"id": "g1", "predicate": "query", "value": "SpecificLaw:applies"}],
          "rules": [],
          "candidates": [],
          "cases": [],
          "state": []
        }, f, indent=2)

sam_path = "examples/cognition/chains/cognitive-memory/stages/0-script_sam/intent.json"
if os.path.exists(sam_path):
    with open(sam_path, "w") as f:
        json.dump({
          "intent": "apply script",
          "facts": [
            { "key": "sam:event:1", "value": "enter(A, B)" },
            { "key": "sam:event:2", "value": "leave(A, B)" }
          ],
          "rules": [
            { "id": "restaurant", "premise": ["enter($w, $l)", "leave($w, $l)"], "conclusion": "restaurant_visit", "certainty": 1.0 }
          ],
          "goals": [], "candidates": [], "cases": [], "state": []
        }, f, indent=2)

