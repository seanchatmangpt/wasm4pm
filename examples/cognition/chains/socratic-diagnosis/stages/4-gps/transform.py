import json
import sys

prev = json.load(sys.stdin)

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
candidates_raw = output.get('candidates', [])

# Find top diagnosis candidate
diagnosis = 'influenza'
cf_score = '0.5'

if candidates_raw:
    active = [c for c in candidates_raw if isinstance(c, dict) and not c.get('eliminated', False)]
    if active:
        top = max(active, key=lambda c: float(c.get('score', 0)), default=None)
        if top and float(top.get('score', 0)) > 0:
            diagnosis = top.get('id', 'influenza')
            cf_score = str(top.get('score', 0.5))

# Carry forward key facts
carried_facts = []
for f in facts_raw:
    if not isinstance(f, dict):
        continue
    key = f.get('key', '')
    if key in ('symptom_fever', 'symptom_cough', 'urgency_level', 'severity', 'duration_days'):
        carried_facts.append(f)

# Ensure core facts present
present_keys = {f['key'] for f in carried_facts if isinstance(f, dict)}
for seed in [
    {'key': 'symptom_fever', 'value': 'confirmed'},
    {'key': 'symptom_cough', 'value': 'confirmed'},
    {'key': 'urgency_level', 'value': 'high'},
]:
    if seed['key'] not in present_keys:
        carried_facts.append(seed)

facts = [
    {'key': 'diagnosis', 'value': diagnosis},
    {'key': 'certainty_factor', 'value': cf_score}
] + carried_facts

# GPS rules must use premise=[] or premises that are already in facts.
# GPS backward-chains: goal -> rule conclusion -> rule premises as sub-goals.
# Using empty premises avoids infinite backward chaining.
intent_json = {
    'intent': f'Select treatment operators via means-ends analysis for {diagnosis}',
    'candidates': [
        {'id': 'administer_antiviral', 'score': 0.0, 'eliminated': False},
        {'id': 'prescribe_rest', 'score': 0.0, 'eliminated': False},
        {'id': 'prescribe_fluids', 'score': 0.0, 'eliminated': False},
        {'id': 'prescribe_antipyretic', 'score': 0.0, 'eliminated': False},
        {'id': 'hospitalize', 'score': 0.0, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {'id': 'r_select_antiviral', 'premise': [], 'conclusion': 'antiviral=selected', 'certainty': 1.0},
        {'id': 'r_select_antipyretic', 'premise': [], 'conclusion': 'antipyretic=selected', 'certainty': 1.0},
        {'id': 'r_select_fluids', 'premise': [], 'conclusion': 'fluids=selected', 'certainty': 1.0},
        {'id': 'r_select_rest', 'premise': [], 'conclusion': 'rest=selected', 'certainty': 1.0},
        {'id': 'r_treatment_plan_ready', 'premise': ['antiviral=selected', 'antipyretic=selected'], 'conclusion': 'treatment_plan=ready', 'certainty': 1.0}
    ],
    'goals': [
        {'id': 'g_treatment_plan', 'predicate': 'treatment_plan', 'value': 'ready'}
    ],
    'cases': [
        {'id': 'case_flu_treatment', 'intent': 'flu treatment planning', 'architecture': 'gps', 'outcome_score': 0.88, 'facts': [{'key': 'diagnosis', 'value': 'influenza'}]},
        {'id': 'case_mild_treatment', 'intent': 'mild illness treatment', 'architecture': 'gps', 'outcome_score': 0.9, 'facts': [{'key': 'diagnosis', 'value': 'common_cold'}]}
    ],
    'state': [
        {'predicate': 'current_state', 'value': f'patient_sick_{diagnosis}'},
        {'predicate': 'goal_state', 'value': 'patient_healthy'},
        {'predicate': 'operators_applied', 'value': 'none'}
    ]
}

print(json.dumps(intent_json, indent=2))
