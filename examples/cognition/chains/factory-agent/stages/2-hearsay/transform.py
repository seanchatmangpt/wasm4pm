import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]

result = {
    'intent': 'Fuse sensor streams (temperature, pressure, throughput) into production-state hypothesis via KSAR blackboard',
    'candidates': [
        {'id': 'hypothesis_normal_ops', 'score': 0.4, 'eliminated': False},
        {'id': 'hypothesis_overheating_event', 'score': 0.85, 'eliminated': False},
        {'id': 'hypothesis_throughput_degraded', 'score': 0.7, 'eliminated': False}
    ],
    'facts': facts + [
        {'key': 'sensor_temp_machine_1', 'value': '92C'},
        {'key': 'sensor_pressure_machine_1', 'value': '8.2bar'},
        {'key': 'throughput_station_3', 'value': '43units/hr'},
        {'key': 'throughput_target', 'value': '60units/hr'}
    ],
    'rules': [
        {'id': 'r_temp_alarm', 'premise': ['sensor_temp_machine_1=92C'], 'conclusion': 'overheating_hypothesis', 'certainty': 0.8},
        {'id': 'r_pressure_alarm', 'premise': ['sensor_pressure_machine_1=8.2bar'], 'conclusion': 'pressure_spike_hypothesis', 'certainty': 0.8},
        {'id': 'r_throughput_low', 'premise': ['throughput_station_3=43units/hr', 'throughput_target=60units/hr'], 'conclusion': 'degraded_throughput_hypothesis', 'certainty': 0.8},
        {'id': 'r_ksar_combine', 'premise': ['sensor_temp_machine_1=92C', 'sensor_pressure_machine_1=8.2bar'], 'conclusion': 'compound_anomaly', 'certainty': 0.8},
    ],
    'goals': [{'id': 'g1', 'predicate': 'identify_production_state_hypothesis', 'value': 'true'}],
    'cases': [{'id': 'c_heat_1', 'intent': 'overheating cascade', 'architecture': 'rule-based', 'outcome_score': 0.8, 'facts': []}],
    'state': [{'predicate': 'blackboard_level', 'value': 'sensor_fusion'}]
}

print(json.dumps(result, indent=2))
