import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
candidates_raw = output.get('candidates', [])
hypotheses = [c for c in candidates_raw if not c.get('eliminated', False)]

result = {
    'intent': "Diagnose anomaly root cause (overheating, vibration, yield-drop) using certainty factor combining",
    'candidates': [
        {'id': 'dx_coolant_failure', 'score': 0.85, 'eliminated': False},
        {'id': 'dx_bearing_wear', 'score': 0.65, 'eliminated': False},
        {'id': 'dx_yield_degradation', 'score': 0.7, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'symptom_temp_high', 'value': '0.9'},
        {'key': 'symptom_vibration_detected', 'value': '0.6'},
        {'key': 'last_maintenance_days', 'value': '45'},
    ],
    'rules': [
        {'id': 'r_mycin_1', 'premise': ['symptom_temp_high=0.9', 'last_maintenance_days=45'], 'conclusion': 'dx_coolant_failure CF=0.85', 'certainty': 0.8},
        {'id': 'r_cf_combine', 'premise': ['symptom_temp_high=0.9', 'symptom_vibration_detected=0.6'], 'conclusion': 'combined_cf = cf1 + cf2*(1-cf1)', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "diagnose_root_cause", "value": "true"}],
    'cases': [{"id": "c_coolant_1", "intent": "coolant failure confirmed", "architecture": "rule-based", "outcome_score": 0.8, "facts": []}],
    'state': [{"predicate": "diagnosis_phase", "value": "active"}, {"predicate": "cf_threshold", "value": "0.5"}],
}

print(json.dumps(result, indent=2))
