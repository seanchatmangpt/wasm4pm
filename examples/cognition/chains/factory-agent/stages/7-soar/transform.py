import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
best_plan = next((f['value'] for f in facts if f.get('key') == 'best_plan'), 'plan_B_partial_stop_flush')

result = {
    'intent': "Resolve competing intervention strategies via SOAR preference resolution; subgoal on tie",
    'candidates': [
        {'id': 'strategy_immediate_shutdown', 'score': 0.75, 'eliminated': False},
        {'id': 'strategy_graceful_degraded_run', 'score': 0.75, 'eliminated': False},
        {'id': 'strategy_parallel_coolant_repair', 'score': 0.8, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'best_plan', 'value': best_plan},
        {'key': 'operator_preference', 'value': 'minimize_downtime'},
        {'key': 'batch_A_in_progress', 'value': 'true'},
    ],
    'rules': [
        {'id': 'r_soar_prefer', 'premise': ['strategy_parallel_coolant_repair', 'operator_preference=minimize_downtime'], 'conclusion': 'prefer strategy_A', 'certainty': 0.8},
        {'id': 'r_soar_tie', 'premise': ['operator_preference=minimize_downtime', 'batch_A_in_progress=true'], 'conclusion': 'create_subgoal_resolve_tie', 'certainty': 0.8},
        {'id': 'r_soar_subgoal', 'premise': ['operator_preference=minimize_downtime', 'batch_A_in_progress=true'], 'conclusion': 'prefer_graceful_degraded_run', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "single_strategy_selected", "value": "true"}, {"id": "g2", "predicate": "tie_resolved", "value": "true"}, {"id": "g3", "predicate": "batch_A_continuity", "value": "preserved"}],
    'cases': [{"id": "c_soar_1", "intent": "graceful degraded selected", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "tie_score", "value": "0.75"}, {"key": "preference", "value": "minimize_downtime"}]}],
    'state': [{"predicate": "preference_resolution", "value": "pending"}, {"predicate": "subgoal_active", "value": "false"}],
}

print(json.dumps(result, indent=2))
