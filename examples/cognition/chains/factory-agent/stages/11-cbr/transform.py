import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
escalation = next((f['value'] for f in facts if f.get('key') == 'escalation_pending'), 'true')
load_level = next((f['value'] for f in facts if f.get('key') == 'load_level'), 'overload')

result = {
    'intent': "Retain the full incident-resolution case and retrieve similar past incidents for future reference",
    'candidates': [
        {'id': 'past_case_incident_2025_11_coolant', 'score': 0.91, 'eliminated': False},
        {'id': 'past_case_incident_2026_01_heat', 'score': 0.78, 'eliminated': False},
        {'id': 'past_case_incident_2025_08_bearing', 'score': 0.65, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'current_incident_id', 'value': 'incident_2026_06_10_machine1'},
        {'key': 'diagnosis', 'value': 'dx_coolant_failure'},
        {'key': 'resolution', 'value': 'plan_B_partial_stop_flush'},
        {'key': 'escalation_triggered', 'value': str(escalation)},
        {'key': 'operator_overload', 'value': str(load_level)},
    ],
    'rules': [
        {'id': 'r_cbr_retrieve', 'premise': ['current_incident_id=incident_2026_06_10_machine1'], 'conclusion': 'retrieve_case(past)', 'certainty': 0.8},
        {'id': 'r_cbr_adapt', 'premise': ['diagnosis=dx_coolant_failure', 'resolution=plan_B_partial_stop_flush'], 'conclusion': 'adapt_resolution', 'certainty': 0.8},
        {'id': 'r_cbr_retain', 'premise': ['resolution_outcome=successful', 'escalation_triggered=true'], 'conclusion': 'retain_new_case', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "similar_cases_retrieved", "value": "true"}, {"id": "g2", "predicate": "current_case_retained", "value": "true"}, {"id": "g3", "predicate": "case_base_updated", "value": "true"}],
    'cases': [{"id": "past_case_incident_2025_11_coolant", "intent": "coolant flush successful 120min", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "diagnosis", "value": "coolant_failure"}, {"key": "machine_age_months", "value": "16"}, {"key": "temp_C", "value": "89"}]}, {"id": "past_case_incident_2026_01_heat", "intent": "partial stop flush 90min", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "diagnosis", "value": "overheating"}, {"key": "escalated", "value": "true"}, {"key": "downtime", "value": "95"}]}],
    'state': [{"predicate": "case_base_size", "value": "47"}, {"predicate": "retrieval_threshold", "value": "0.7"}],
}

print(json.dumps(result, indent=2))
