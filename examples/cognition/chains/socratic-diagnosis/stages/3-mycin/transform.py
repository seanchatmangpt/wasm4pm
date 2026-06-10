import json
import sys

prev = json.load(sys.stdin)

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])

# Extract urgency and paranoia from neurosis stage
urgency = 'moderate'
paranoia = '0.5'
for f in facts_raw:
    if not isinstance(f, dict):
        continue
    if f.get('key') == 'urgency_level':
        urgency = f.get('value', 'moderate')
    if f.get('key') == 'paranoia_score':
        paranoia = str(f.get('value', '0.5'))

# Collect symptom facts (carry forward all symptom_* and cd_primitive_* facts)
symptom_facts = []
for f in facts_raw:
    if not isinstance(f, dict):
        continue
    key = f.get('key', '')
    if key.startswith('symptom_') or key.startswith('cd_primitive_') or key in ('duration_days', 'severity', 'duration'):
        symptom_facts.append(f)

# Ensure core symptom facts are always present for MYCIN rules to fire
present_keys = {f['key'] for f in symptom_facts if isinstance(f, dict)}
seed_facts = [
    {'key': 'symptom_fever', 'value': 'confirmed'},
    {'key': 'symptom_cough', 'value': 'confirmed'},
    {'key': 'duration_days', 'value': '3'},
    {'key': 'cd_primitive_PTRANS', 'value': 'pathogen_entry_hypothesis'}
]
for sf in seed_facts:
    if sf['key'] not in present_keys:
        symptom_facts.append(sf)

facts = [
    {'key': 'urgency_level', 'value': urgency},
    {'key': 'paranoia_score', 'value': paranoia},
    {'key': 'severity', 'value': 'moderate'}
] + symptom_facts

intent_json = {
    'intent': 'Diagnose illness by combining certainty factors (CF) over confirmed symptom facts using MYCIN backward chaining',
    'candidates': [
        {'id': 'influenza', 'score': 0.0, 'eliminated': False},
        {'id': 'pneumonia', 'score': 0.0, 'eliminated': False},
        {'id': 'covid19', 'score': 0.0, 'eliminated': False},
        {'id': 'common_cold', 'score': 0.0, 'eliminated': False},
        {'id': 'tuberculosis', 'score': 0.0, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {'id': 'r_flu_fever_cough', 'premise': ['symptom_fever=confirmed', 'symptom_cough=confirmed'], 'conclusion': 'diagnosis=influenza CF=0.6', 'certainty': 1.0},
        {'id': 'r_flu_duration', 'premise': ['diagnosis=influenza', 'duration_days >= 2'], 'conclusion': 'diagnosis=influenza CF=0.7', 'certainty': 1.0},
        {'id': 'r_pneumonia_severity', 'premise': ['symptom_fever=confirmed', 'symptom_cough=confirmed', 'severity=moderate'], 'conclusion': 'diagnosis=pneumonia CF=0.4', 'certainty': 1.0},
        {'id': 'r_covid_ptrans', 'premise': ['cd_primitive_PTRANS=pathogen_entry_hypothesis', 'symptom_fever=confirmed'], 'conclusion': 'diagnosis=covid19 CF=0.5', 'certainty': 1.0},
        {'id': 'r_cold_mild', 'premise': ['symptom_cough=confirmed', 'urgency_level=low'], 'conclusion': 'diagnosis=common_cold CF=0.7', 'certainty': 1.0},
        {'id': 'r_urgency_boost', 'premise': ['urgency_level=high'], 'conclusion': 'CF_multiplier=1.2', 'certainty': 1.0}
    ],
    'goals': [
        {'id': 'g_primary_diagnosis', 'predicate': 'diagnosis_confirmed', 'value': 'true'},
        {'id': 'g_cf_threshold', 'predicate': 'certainty_factor', 'value': '>= 0.5'},
        {'id': 'g_differential_ranked', 'predicate': 'differential_diagnosis_ranked', 'value': 'true'}
    ],
    'cases': [
        {'id': 'case_flu_classic', 'intent': 'classic influenza diagnosis', 'architecture': 'mycin', 'outcome_score': 0.72, 'facts': [{'key': 'fever', 'value': 'confirmed'}, {'key': 'cough', 'value': 'confirmed'}]},
        {'id': 'case_pneumonia', 'intent': 'pneumonia diagnosis', 'architecture': 'mycin', 'outcome_score': 0.80, 'facts': [{'key': 'fever', 'value': 'confirmed'}, {'key': 'severity', 'value': 'severe'}]}
    ],
    'state': [
        {'predicate': 'backward_chain_depth', 'value': '0'},
        {'predicate': 'cf_accumulator', 'value': '0.0'},
        {'predicate': 'diagnosis_phase', 'value': 'pending'}
    ]
}

print(json.dumps(intent_json, indent=2))
