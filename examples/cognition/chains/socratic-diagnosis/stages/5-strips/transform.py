import json
import sys

prev = json.load(sys.stdin)

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
candidates_raw = output.get('candidates', [])

# Extract diagnosis and urgency from GPS output
diagnosis = 'influenza'
urgency = 'moderate'

for f in facts_raw:
    if not isinstance(f, dict):
        continue
    if f.get('key') == 'diagnosis':
        diagnosis = f.get('value', 'influenza')
    if f.get('key') == 'urgency_level':
        urgency = f.get('value', 'moderate')

# Which operators GPS selected
selected_ops = set()
for c in (candidates_raw or []):
    if isinstance(c, dict) and not c.get('eliminated', False) and float(c.get('score', 0)) > 0:
        cid = c.get('id', '')
        if 'antiviral' in cid:
            selected_ops.add('antiviral')
        elif 'antipyretic' in cid:
            selected_ops.add('antipyretic')
        elif 'fluids' in cid:
            selected_ops.add('fluids')
        elif 'rest' in cid:
            selected_ops.add('rest')

if not selected_ops:
    selected_ops = {'antiviral', 'antipyretic', 'fluids', 'rest'}

facts = [
    {'key': 'diagnosis', 'value': diagnosis},
    {'key': 'urgency_level', 'value': urgency}
] + [{'key': op, 'value': 'selected'} for op in sorted(selected_ops)]

# STRIPS: single operator that executes the plan when all preconditions met
# Initial state encodes the conditions; goal is plan_executed
intent_json = {
    'intent': f'Execute STRIPS treatment plan for {diagnosis}',
    'candidates': [
        {'id': 'step1_administer_antiviral', 'score': 0.0, 'eliminated': False},
        {'id': 'step2_prescribe_antipyretic', 'score': 0.0, 'eliminated': False},
        {'id': 'step3_prescribe_fluids', 'score': 0.0, 'eliminated': False},
        {'id': 'step4_prescribe_rest', 'score': 0.0, 'eliminated': False},
        {'id': 'step5_followup_in_48h', 'score': 0.0, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {
            'id': 'r_execute_treatment_plan',
            'premise': ['antiviral_needed=true', 'fever_present=true'],
            'conclusion': 'treatment_plan=executed;!antiviral_needed=true;!fever_present=true',
            'certainty': 1.0
        }
    ],
    'goals': [
        {'id': 'g_plan_executed', 'predicate': 'treatment_plan', 'value': 'executed'}
    ],
    'cases': [
        {'id': 'case_flu_strips', 'intent': 'influenza STRIPS plan', 'architecture': 'strips', 'outcome_score': 0.9, 'facts': [{'key': 'operators', 'value': ','.join(sorted(selected_ops))}]},
        {'id': 'case_cold_strips', 'intent': 'cold STRIPS plan', 'architecture': 'strips', 'outcome_score': 0.85, 'facts': [{'key': 'operators', 'value': 'fluids,rest'}]}
    ],
    'state': [
        {'predicate': 'antiviral_needed', 'value': 'true'},
        {'predicate': 'fever_present', 'value': 'true'},
        {'predicate': 'diagnosis', 'value': diagnosis}
    ]
}

print(json.dumps(intent_json, indent=2))
