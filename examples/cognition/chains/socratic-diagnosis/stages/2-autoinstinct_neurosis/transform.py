import json
import sys

prev = json.load(sys.stdin)

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])

# Gather CD primitives from semantics stage
cd_facts = []
symptom_count = 0
for f in facts_raw:
    if not isinstance(f, dict):
        continue
    key = f.get('key', '')
    if key.startswith('cd_primitive_') or key.startswith('symptom_'):
        cd_facts.append(f)
    if key.startswith('symptom_') and f.get('value') == 'confirmed':
        symptom_count += 1

# Fallback
if not cd_facts:
    cd_facts = [
        {'key': 'cd_primitive_ATRANS', 'value': 'heat_dysregulation'},
        {'key': 'cd_primitive_EXPEL', 'value': 'respiratory_event'},
        {'key': 'cd_primitive_PTRANS', 'value': 'pathogen_entry_hypothesis'}
    ]
    symptom_count = 2

duration = next((f['value'] for f in facts_raw if isinstance(f, dict) and f.get('key') == 'duration'), '3 days')
duration_days = '3'
try:
    digits = ''.join(filter(str.isdigit, str(duration)))
    duration_days = str(int(digits) if digits else 3)
except Exception:
    pass

facts = [
    {'key': 'symptom_count', 'value': str(symptom_count) if symptom_count else '2'},
    {'key': 'duration_days', 'value': duration_days},
    {'key': 'severity', 'value': 'moderate'}
] + cd_facts

intent_json = {
    'intent': 'Model patient affect and anxiety level from symptom presentation',
    'candidates': [
        {'id': 'urgency_low', 'score': 0.1, 'eliminated': False},
        {'id': 'urgency_moderate', 'score': 0.5, 'eliminated': False},
        {'id': 'urgency_high', 'score': 0.0, 'eliminated': False},
        {'id': 'affect_anxious', 'score': 0.0, 'eliminated': False},
        {'id': 'affect_calm', 'score': 0.8, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {'id': 'r_multi_symptom_anxiety', 'premise': ['symptom_count >= 2'], 'conclusion': 'paranoia_score += 0.3', 'certainty': 1.0},
        {'id': 'r_duration_anxiety', 'premise': ['duration_days >= 3'], 'conclusion': 'paranoia_score += 0.2', 'certainty': 1.0},
        {'id': 'r_ptrans_threat', 'premise': ['cd_primitive_PTRANS present'], 'conclusion': 'paranoia_score += 0.3', 'certainty': 1.0},
        {'id': 'r_high_paranoia_urgency', 'premise': ['paranoia_score >= 0.7'], 'conclusion': 'urgency=high', 'certainty': 1.0},
        {'id': 'r_moderate_paranoia_urgency', 'premise': ['paranoia_score >= 0.4 AND paranoia_score < 0.7'], 'conclusion': 'urgency=moderate', 'certainty': 1.0}
    ],
    'goals': [
        {'id': 'g_affect_score', 'predicate': 'patient_affect_modeled', 'value': 'true'},
        {'id': 'g_urgency_level', 'predicate': 'urgency_classified', 'value': 'true'},
        {'id': 'g_paranoia_quantified', 'predicate': 'paranoia_score_computed', 'value': 'true'}
    ],
    'cases': [
        {'id': 'case_anxious_patient', 'intent': 'high urgency patient', 'architecture': 'autoinstinct_neurosis', 'outcome_score': 0.85, 'facts': [{'key': 'symptom_count', 'value': '3'}]},
        {'id': 'case_calm_patient', 'intent': 'low urgency patient', 'architecture': 'autoinstinct_neurosis', 'outcome_score': 0.9, 'facts': [{'key': 'symptom_count', 'value': '1'}]}
    ],
    'state': [
        {'predicate': 'paranoia_score', 'value': '0.0'},
        {'predicate': 'affect_model', 'value': 'neurosis_v1'},
        {'predicate': 'urgency_level', 'value': 'unknown'}
    ]
}

print(json.dumps(intent_json, indent=2))
