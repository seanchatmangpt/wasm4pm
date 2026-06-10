import json
import sys

prev = json.load(sys.stdin)
output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
facts = [{'key': f.get('key', f'k{i}'), 'value': f.get('value', str(f))} for i, f in enumerate(facts_raw)]
machine_states = [f for f in facts if 'state' in f.get('key', '')]
candidates_raw = output.get('candidates', []) or [{'id': 'PTRANS_batch_A_station3', 'score': 0.9}]
candidates = [
    {
        'id': c.get('id', c.get('label', f'cand_{i}')),
        'score': c.get('score', 0.5),
        'eliminated': c.get('eliminated', False)
    }
    for i, c in enumerate(candidates_raw)
]

result = {
    'intent': "Parse operator command 'route batch A through station 3 then QA' into CD ATRANS/PTRANS primitives",
    'candidates': candidates or [{'id': 'PTRANS_batch_A_station3', 'score': 0.9, 'eliminated': False}],
    'facts': machine_states + [
        {'key': 'raw_command', 'value': 'route batch A through station 3 then QA'},
        {'key': 'actor', 'value': 'operator'},
        {'key': 'object', 'value': 'batch_A'}
    ],
    'rules': [
        {'id': 'r_route', 'premise': ['raw_command=route batch A through station 3 then QA', 'actor=operator'], 'conclusion': 'PTRANS(object,src,dest)', 'certainty': 0.8},
        {'id': 'r_then', 'premise': ['raw_command=route batch A through station 3 then QA'], 'conclusion': 'ordered_PTRANS_chain', 'certainty': 0.8},
        {'id': 'r_QA', 'premise': ['object=batch_A', 'actor=operator'], 'conclusion': 'ATRANS(ownership, QA_dept)', 'certainty': 0.8},
    ],
    'goals': [{'id': 'g1', 'predicate': 'parse_command_to_CD', 'value': 'true'}],
    'cases': [{'id': 'c_route_1', 'intent': 'PTRANS chain', 'architecture': 'rule-based', 'outcome_score': 0.8, 'facts': []}],
    'state': [{'predicate': 'command_parsed', 'value': 'false'}]
}

print(json.dumps(result, indent=2))
