import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
selected = next((f['value'] for f in facts if f.get('key') == 'selected_strategy'), 'strategy_parallel_coolant_repair')

result = {
    'intent': "Enumerate candidate root-cause explanations from constraint vocabulary using DENDRAL hypothesis generation",
    'candidates': [
        {'id': 'explanation_coolant_pump_seized', 'score': 0.88, 'eliminated': False},
        {'id': 'explanation_heat_exchanger_fouled', 'score': 0.72, 'eliminated': False},
        {'id': 'explanation_bearing_lubricant_depleted', 'score': 0.65, 'eliminated': False},
        {'id': 'explanation_thermostat_sensor_drift', 'score': 0.45, 'eliminated': False},
        {'id': 'explanation_ambient_temp_spike', 'score': 0.3, 'eliminated': True},
    ],
    'facts': facts + [
        {'key': 'selected_strategy', 'value': selected},
        {'key': 'constraint_coolant_flow_zero', 'value': 'true'},
        {'key': 'constraint_pressure_upstream_high', 'value': 'true'},
        {'key': 'constraint_vibration_pump_area', 'value': 'true'},
    ],
    'rules': [
        {'id': 'r_dendral_gen', 'premise': ['constraint_coolant_flow_zero=true', 'constraint_pressure_upstream_high=true'], 'conclusion': 'generate_pump_hypotheses', 'certainty': 0.8},
        {'id': 'r_dendral_elim', 'premise': ['constraint_ambient_temp_normal=true'], 'conclusion': 'eliminate_ambient_spike', 'certainty': 0.8},
        {'id': 'r_dendral_rank', 'premise': ['constraint_vibration_pump_area=true', 'constraint_coolant_flow_zero=true'], 'conclusion': 'pump_seized_most_likely', 'certainty': 0.8},
    ],
    'goals': [{"id": "g1", "predicate": "exhaustive_explanation_set", "value": "true"}, {"id": "g2", "predicate": "implausible_eliminated", "value": "true"}, {"id": "g3", "predicate": "top_explanation_identified", "value": "true"}],
    'cases': [{"id": "c_dendral_1", "intent": "pump seizure confirmed", "architecture": "rule-based", "outcome_score": 0.8, "facts": [{"key": "flow_zero", "value": "true"}, {"key": "vibration", "value": "true"}]}],
    'state': [{"predicate": "hypothesis_space", "value": "open"}, {"predicate": "elimination_passes", "value": "0"}],
}

print(json.dumps(result, indent=2))
