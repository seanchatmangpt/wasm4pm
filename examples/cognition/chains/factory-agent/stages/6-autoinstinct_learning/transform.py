import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
candidates_raw = output.get('candidates', [])
plans = [c for c in candidates_raw if not c.get('eliminated', True)] if candidates_raw else []

result = {
    'intent': "Optimize intervention plan via bitwise STRIPS/HACKER heuristic on goal bitmask",
    'candidates': [
        {'id': 'plan_A_full_stop_sequence', 'score': 0.7, 'eliminated': False},
        {'id': 'plan_B_partial_stop_flush', 'score': 0.85, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'goal_bitmask', 'value': '0b1111'},
        {'key': 'achieved_bitmask', 'value': '0b0000'},
        {'key': 'safety_constraint_met', 'value': 'true'},
    ],
    'rules': [
        {'id': 'r_hacker_1', 'premise': ['goal_bitmask=0b1111', 'achieved_bitmask=0b0000'], 'conclusion': 'select_next_subgoal', 'certainty': 0.8},
        {'id': 'r_optimize_1', 'premise': ['safety_constraint_met=true', 'goal_bitmask=0b1111'], 'conclusion': 'prefer_plan_B', 'certainty': 0.8},
        {'id': 'r_bit_advance', 'premise': ['safety_constraint_met=true', 'goal_bitmask=0b1111'], 'conclusion': 'increment_achieved_bitmask', 'certainty': 0.8},
    ],
    'goals': [{"id": "g_bitmask", "predicate": "achieved_bitmask", "value": "0b1111"}, {"id": "g_minimize_cost", "predicate": "plan_cost_minimized", "value": "true"}],
    'cases': [{"id": "c_learn_1", "intent": "plan B optimal", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "coolant_failure", "value": "true"}, {"key": "partial_stop_used", "value": "true"}]}],
    'state': [{"predicate": "learning_iteration", "value": "1"}, {"predicate": "best_plan", "value": "none"}],
}

print(json.dumps(result, indent=2))
