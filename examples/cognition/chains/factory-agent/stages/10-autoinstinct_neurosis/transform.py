import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
plan_valid = next((f['value'] for f in facts if f.get('key') == 'plan_valid'), 'true')

result = {
    'intent': "Monitor operator cognitive load during alarm condition; flag cognitive overload for escalation",
    'candidates': [
        {'id': 'operator_load_normal', 'score': 0.2, 'eliminated': False},
        {'id': 'operator_load_elevated', 'score': 0.7, 'eliminated': False},
        {'id': 'operator_load_overload_escalate', 'score': 0.85, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'plan_validated', 'value': str(plan_valid)},
        {'key': 'active_alarms_count', 'value': '7'},
        {'key': 'operator_response_latency_sec', 'value': '12'},
        {'key': 'operator_error_rate_last_5min', 'value': '0.3'},
        {'key': 'operator_shift_hours', 'value': '6.5'},
    ],
    'rules': [
        {'id': 'r_load_1', 'premise': ['active_alarms_count=7', 'operator_response_latency_sec=12'], 'conclusion': 'elevated_load', 'certainty': 0.8},
        {'id': 'r_load_2', 'premise': ['operator_error_rate_last_5min=0.3', 'active_alarms_count=7'], 'conclusion': 'cognitive_overload', 'certainty': 0.8},
        {'id': 'r_escalate', 'premise': ['operator_shift_hours=6.5', 'operator_error_rate_last_5min=0.3'], 'conclusion': 'escalate_to_supervisor', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "operator_load_classified", "value": "true"}, {"id": "g2", "predicate": "escalation_triggered_if_overload", "value": "true"}],
    'cases': [{"id": "c_neurosis_1", "intent": "overload escalated", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "alarms", "value": "7"}, {"key": "latency_sec", "value": "12"}, {"key": "shift_hrs", "value": "6.5"}]}],
    'state': [{"predicate": "escalation_pending", "value": "false"}, {"predicate": "load_level", "value": "unknown"}],
}

print(json.dumps(result, indent=2))
