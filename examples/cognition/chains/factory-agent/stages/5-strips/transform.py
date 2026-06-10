import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]

result = {
    'intent': 'Sequence corrective actions (stop-machine, adjust-param, restart) with STRIPS frame axioms',
    'candidates': [
        {'id': 'action_stop_machine_1', 'score': 0.95, 'eliminated': False},
        {'id': 'action_flush_coolant_system', 'score': 0.9, 'eliminated': False},
        {'id': 'action_adjust_feed_rate_70pct', 'score': 0.8, 'eliminated': False},
        {'id': 'action_restart_machine_1', 'score': 0.85, 'eliminated': False},
    ],
    'facts': facts + [
        {'key': 'machine_1_state', 'value': 'running'},
        {'key': 'coolant_system_state', 'value': 'failed'},
        {'key': 'feed_rate', 'value': '100pct'},
    ],
    'rules': [
        {'id': 'r_stop_machine', 'premise': ['machine_1_state=running'], 'conclusion': 'machine_1_state=stopped;!machine_1_state=running', 'certainty': 0.95},
        {'id': 'r_flush_coolant', 'premise': ['machine_1_state=stopped', 'coolant_system_state=failed'], 'conclusion': 'coolant_system_state=flushed;!coolant_system_state=failed', 'certainty': 0.9},
        {'id': 'r_adjust_feed', 'premise': ['machine_1_state=stopped', 'feed_rate=100pct'], 'conclusion': 'feed_rate=70pct;!feed_rate=100pct', 'certainty': 0.8},
        {'id': 'r_restart', 'premise': ['machine_1_state=stopped', 'coolant_system_state=flushed', 'feed_rate=70pct'], 'conclusion': 'machine_1_state=running_normal;!machine_1_state=stopped', 'certainty': 0.85},
    ],
    'goals': [
        {'id': 'g1', 'predicate': 'machine_1_state', 'value': 'stopped'},
    ],
    'cases': [{'id': 'c_strips_1', 'intent': 'stop flush restart sequence', 'architecture': 'strips', 'outcome_score': 0.9, 'facts': []}],
    'state': [
        {'predicate': 'machine_1_state', 'value': 'running'},
        {'predicate': 'coolant_system_state', 'value': 'failed'},
        {'predicate': 'feed_rate', 'value': '100pct'},
    ],
}

print(json.dumps(result, indent=2))
