import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])
candidates_raw = output.get('candidates', [])

# Collect all accumulated facts from the chain
all_facts = {}
for f in facts_raw:
    if isinstance(f, dict) and 'key' in f:
        all_facts[f['key']] = f.get('value', '')

# Extract plan sequence from STRIPS output
plan_sequence = all_facts.get('plan_sequence', 'antiviral,antipyretic,fluids,rest,followup')
plan_steps = all_facts.get('plan_steps_count', str(len(plan_sequence.split(',')) if plan_sequence else '5'))
diagnosis = all_facts.get('diagnosis', 'influenza')
cf = all_facts.get('certainty_factor', '0.5')
urgency = all_facts.get('urgency_level', 'moderate')
paranoia = all_facts.get('paranoia_score', '0.5')

# Reconstruct key symptom facts for the case feature vector
symptom_keys = ['symptom_fever', 'symptom_cough', 'symptom_fatigue', 'symptom_headache',
                 'duration_days', 'severity', 'cd_primitive_ATRANS', 'cd_primitive_EXPEL',
                 'cd_primitive_PTRANS']

retained_facts = []
for key in symptom_keys:
    if key in all_facts:
        retained_facts.append({'key': key, 'value': all_facts[key]})

if not retained_facts:
    retained_facts = [
        {'key': 'symptom_fever', 'value': 'confirmed'},
        {'key': 'symptom_cough', 'value': 'confirmed'},
        {'key': 'duration_days', 'value': '3'}
    ]

facts = [
    {'key': 'diagnosis', 'value': diagnosis},
    {'key': 'certainty_factor', 'value': cf},
    {'key': 'urgency_level', 'value': urgency},
    {'key': 'paranoia_score', 'value': paranoia},
    {'key': 'plan_sequence', 'value': plan_sequence},
    {'key': 'plan_steps_count', 'value': plan_steps}
] + retained_facts

# Build the new case to retain
new_case_id = f'case_{diagnosis}_2026_new'
new_case_features = {k.replace('symptom_', ''): v for k, v in all_facts.items() if k.startswith('symptom_')}
new_case_features.update({'duration': all_facts.get('duration_days', '3'), 'urgency': urgency})
new_case_outcome = f'diagnosis={diagnosis} CF={cf} plan=[{plan_sequence}]'

intent_json = {
    'intent': 'Retain the complete diagnosis-and-treatment case for future Jaccard similarity retrieval',
    'candidates': [
        {'id': 'retain_as_new_case', 'score': 0.0, 'eliminated': False},
        {'id': 'merge_with_existing_flu_case', 'score': 0.0, 'eliminated': False},
        {'id': 'flag_for_expert_review', 'score': 0.0, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {'id': 'r_jaccard_similarity', 'premise': ['query_features', 'case_features'], 'conclusion': 'similarity = |intersection| / |union| of symptom feature sets', 'certainty': 1.0},
        {'id': 'r_retain_threshold', 'premise': ['case_novelty_score > 0.3'], 'conclusion': 'retain as new case', 'certainty': 1.0},
        {'id': 'r_merge_threshold', 'premise': ['jaccard_similarity > 0.8', 'diagnosis_matches'], 'conclusion': 'merge with existing case', 'certainty': 1.0},
        {'id': 'r_expert_flag', 'premise': ['cf < 0.5 AND urgency=high'], 'conclusion': 'flag for expert review before retention', 'certainty': 1.0},
        {'id': 'r_outcome_encode', 'premise': ['plan_sequence confirmed'], 'conclusion': 'encode outcome = diagnosis + plan_sequence + cf', 'certainty': 1.0}
    ],
    'goals': [
        {'id': 'g_case_retained', 'predicate': 'case_indexed', 'value': 'true'},
        {'id': 'g_retrieval_ready', 'predicate': 'jaccard_index_updated', 'value': 'true'},
        {'id': 'g_outcome_encoded', 'predicate': 'outcome_stored', 'value': 'true'}
    ],
    'cases': [
        {'id': new_case_id, 'intent': f'new case: {diagnosis}', 'architecture': 'cbr', 'outcome_score': float(cf) if cf else 0.5, 'facts': [{'key': k, 'value': v} for k, v in list(new_case_features.items())[:3]]},
        {'id': 'case_flu_2026_001', 'intent': 'flu case 2026 #1', 'architecture': 'cbr', 'outcome_score': 0.72, 'facts': [{'key': 'fever', 'value': 'confirmed'}, {'key': 'cough', 'value': 'confirmed'}]},
        {'id': 'case_cold_2026_001', 'intent': 'cold case 2026 #1', 'architecture': 'cbr', 'outcome_score': 0.75, 'facts': [{'key': 'cough', 'value': 'confirmed'}]}
    ],
    'state': [
        {'predicate': 'case_library_size', 'value': '3'},
        {'predicate': 'retrieval_mode', 'value': 'jaccard'},
        {'predicate': 'retention_policy', 'value': 'novelty_threshold_0.3'}
    ]
}

print(json.dumps(intent_json, indent=2))
