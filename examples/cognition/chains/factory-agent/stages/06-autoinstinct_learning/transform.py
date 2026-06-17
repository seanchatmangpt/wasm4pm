import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
prev_payload = prev.get('payload', {})
prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

# Load base input from the template json
base_input = json.loads(r'''{
  "intent": "",
  "facts": [
    {
      "key": "achieved",
      "value": "section-1-cleartop"
    },
    {
      "key": "achieved",
      "value": "section-2-bottom-up-ordering"
    },
    {
      "key": "belief:patch_cleartop_known",
      "value": "1.0"
    },
    {
      "key": "belief:patch_bottom_up_known",
      "value": "1.0"
    },
    {
      "key": "belief:patch_space_compacting_known",
      "value": "0.5"
    },
    {
      "key": "belief:patch_space_flushing_known",
      "value": "0.2"
    },
    {
      "key": "belief:patch_protect_known",
      "value": "0.0"
    }
  ],
  "candidates": [],
  "rules": [
    {
      "id": "rule-cleartop",
      "premise": [
        "wants-to-place-block",
        "block-has-object-on-top"
      ],
      "conclusion": "prerequisite:clear-top-first",
      "certainty": 1
    },
    {
      "id": "rule-bottom-up",
      "premise": [
        "conjunctive-subgoals",
        "on-chain-dependency"
      ],
      "conclusion": "prerequisite:build-bottom-subgoal-first",
      "certainty": 1
    },
    {
      "id": "rule-compact-before-flush",
      "premise": [
        "not-enough-space-on-surface",
        "compacting-possible"
      ],
      "conclusion": "action:compact-then-place",
      "certainty": 0.6
    },
    {
      "id": "rule-flush-before-compact",
      "premise": [
        "not-enough-space-on-surface",
        "compacting-violates-goal"
      ],
      "conclusion": "prerequisite:flush-first-then-compact",
      "certainty": 0.8
    }
  ],
  "cases": [],
  "goals": [
    {
      "id": "g0",
      "predicate": "master",
      "value": "section-1-cleartop"
    },
    {
      "id": "g1",
      "predicate": "master",
      "value": "section-2-bottom-up-ordering"
    },
    {
      "id": "g2",
      "predicate": "master",
      "value": "section-3-space-allocation-compact"
    },
    {
      "id": "g3",
      "predicate": "master",
      "value": "section-4-space-allocation-flush-ordering"
    },
    {
      "id": "g4",
      "predicate": "master",
      "value": "section-5-protection-constraints"
    }
  ],
  "state": [
    {
      "predicate": "on",
      "value": "A-B"
    },
    {
      "predicate": "on",
      "value": "B-TABLE"
    },
    {
      "predicate": "on",
      "value": "C-TABLE"
    },
    {
      "predicate": "cleartop",
      "value": "A"
    },
    {
      "predicate": "cleartop",
      "value": "C"
    }
  ]
}''')

# Cryptographically bind to prior stage
if prev_output_hash:
    if 'facts' not in base_input:
        base_input['facts'] = []
    base_input['facts'].append({
        'key': 'prior_stage_hash',
        'value': f"{prev_breed}:{prev_output_hash}"
    })

print(json.dumps(base_input, indent=2))
