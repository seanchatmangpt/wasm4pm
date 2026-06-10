import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
diagnosis = next((f['value'] for f in facts if f.get('key') == 'diagnosis'), 'dx_coolant_failure')

result = {
    'intent': 'Reduce gap from current degraded production state to target KPI state using means-ends analysis',
    'candidates': [
        {'id': 'op_coolant_flush', 'score': 0.9, 'eliminated': False},
        {'id': 'op_reduce_feed_rate', 'score': 0.7, 'eliminated': False},
        {'id': 'op_maintenance_dispatch', 'score': 0.8, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'current_temp', 'value': '92C'},
        {'key': 'target_temp', 'value': '75C'},
        {'key': 'diagnosis', 'value': diagnosis},
        {'key': 'current_throughput', 'value': '43units/hr'},
        {'key': 'target_throughput', 'value': '60units/hr'},
    ],
    'rules': [
        {'id': 'r_mea_temp', 'premise': ['current_temp=92C', 'target_temp=75C'], 'conclusion': 'temp_at_target=75C', 'certainty': 0.8},
        {'id': 'r_mea_throughput', 'premise': ['current_throughput=43units/hr', 'target_throughput=60units/hr'], 'conclusion': 'throughput_at_target=60units/hr', 'certainty': 0.8},
        {'id': 'r_mea_prereq', 'premise': ['diagnosis=dx_coolant_failure', 'current_temp=92C'], 'conclusion': 'production_stable=true', 'certainty': 0.8},
    ],
    'goals': [
        {'id': 'g_temp', 'predicate': 'temp_at_target', 'value': '75C'},
        {'id': 'g_throughput', 'predicate': 'throughput_at_target', 'value': '60units/hr'},
        {'id': 'g_stable', 'predicate': 'production_stable', 'value': 'true'},
    ],
    'cases': [{'id': 'c_gps_1', 'intent': 'coolant flush resolves', 'architecture': 'means-ends', 'outcome_score': 0.9, 'facts': []}],
    'state': [
        {'predicate': 'current_temp', 'value': '92C'},
        {'predicate': 'target_temp', 'value': '75C'},
        {'predicate': 'current_throughput', 'value': '43units/hr'},
        {'predicate': 'target_throughput', 'value': '60units/hr'},
        {'predicate': 'diagnosis', 'value': 'dx_coolant_failure'},
    ],
}

print(json.dumps(result, indent=2))
