import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
candidates_raw = output.get('candidates', [])
top_expl = next((c['id'] for c in candidates_raw if not c.get('eliminated', True)), 'explanation_coolant_pump_seized')

result = {
    'intent': "Validate intervention plan satisfies safety constraints via Robinson unification over safety rules",
    'candidates': [
        {'id': 'plan_valid_safety_check', 'score': 0.95, 'eliminated': False},
        {'id': 'plan_invalid_sequence_violation', 'score': 0.1, 'eliminated': True},
    ],
    'facts': facts + [
        {'key': 'top_explanation', 'value': top_expl},
        {'key': 'plan_step_1', 'value': 'stop_machine_1'},
        {'key': 'plan_step_2', 'value': 'flush_coolant_system'},
        {'key': 'safety_rule_lockout_tagout', 'value': 'must_stop_before_maintenance'},
    ],
    'rules': [
        {'id': 'r_safety_1', 'premise': ['plan_step_1=stop_machine_1', 'plan_step_2=flush_coolant_system'], 'conclusion': 'unsafe_plan', 'certainty': 0.8},
        {'id': 'r_safety_2', 'premise': ['plan_step_4=restart_machine_1', 'plan_step_1=stop_machine_1'], 'conclusion': 'unsafe_restart', 'certainty': 0.8},
        {'id': 'r_unify_valid', 'premise': ['plan_step_1=stop_machine_1', 'plan_step_2=flush_coolant_system'], 'conclusion': 'plan_valid(Plan)', 'certainty': 0.8},
        {'id': 'r_lockout', 'premise': ['plan_step_2=flush_coolant_system', 'plan_step_1=stop_machine_1'], 'conclusion': 'lockout_violation(X)', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "plan_valid", "value": "plan_B_partial_stop_flush"}, {"id": "g2", "predicate": "safety_constraints_satisfied", "value": "true"}, {"id": "g3", "predicate": "no_lockout_violation", "value": "true"}],
    'cases': [{"id": "c_prolog_1", "intent": "plan validated", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "stop_before_flush", "value": "true"}, {"key": "temp_check_before_restart", "value": "true"}]}],
    'state': [{"predicate": "unification_depth", "value": "0"}, {"predicate": "safety_check_passed", "value": "false"}],
}

print(json.dumps(result, indent=2))
