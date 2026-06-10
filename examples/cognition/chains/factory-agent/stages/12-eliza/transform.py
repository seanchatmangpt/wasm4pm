import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
diagnosis = next((f['value'] for f in facts if f.get('key') == 'diagnosis'), 'dx_coolant_failure')
resolution = next((f['value'] for f in facts if f.get('key') == 'resolution'), 'plan_B_partial_stop_flush')

result = {
    'intent': "Generate operator-facing natural language explanation of diagnosis and resolution via keystack reflection",
    'candidates': [
        {'id': 'explanation_template_operator_plain', 'score': 0.9, 'eliminated': False},
        {'id': 'explanation_template_escalation_summary', 'score': 0.85, 'eliminated': False},
        {'id': 'explanation_template_technical', 'score': 0.6, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'final_diagnosis', 'value': diagnosis},
        {'key': 'resolution_applied', 'value': resolution},
        {'key': 'operator_overload_flagged', 'value': 'true'},
        {'key': 'supervisor_escalated', 'value': 'true'},
        {'key': 'batch_A_status', 'value': 'resumed_at_station_3'},
    ],
    'rules': [
        {'id': 'r_eliza_key_1', 'premise': ['final_diagnosis=dx_coolant_failure'], 'conclusion': 'reflect_diagnosis_to_operator', 'certainty': 0.8},
        {'id': 'r_eliza_key_2', 'premise': ['root_cause=coolant_pump_seized'], 'conclusion': 'explain_why_pump_seized', 'certainty': 0.8},
        {'id': 'r_eliza_key_3', 'premise': ['supervisor_escalated=true'], 'conclusion': 'explain_supervisor_notified', 'certainty': 0.8},
        {'id': 'r_eliza_reassure', 'premise': ['operator_overload_flagged=true'], 'conclusion': 'add_reassurance_statement', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "operator_explanation_generated", "value": "true"}, {"id": "g2", "predicate": "explanation_clarity_score", "value": "high"}, {"id": "g3", "predicate": "operator_acknowledged", "value": "pending"}],
    'cases': [{"id": "c_eliza_1", "intent": "reassuring plain language explanation", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "overload", "value": "true"}, {"key": "escalated", "value": "true"}]}, {"id": "similar_incident_2025_11", "intent": "resolved in 120min previously", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "diagnosis", "value": "coolant_failure"}, {"key": "resolution", "value": "flush"}]}],
    'state': [{"predicate": "keystack_active", "value": "true"}, {"predicate": "reflection_mode", "value": "operator_facing"}],
}

print(json.dumps(result, indent=2))
