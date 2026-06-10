import json
import sys

prev = json.load(sys.stdin)

output = prev.get('payload', {}).get('output', {})
facts_raw = output.get('facts', [])

# Extract confirmed symptoms from eliza output
confirmed_symptoms = []
for f in facts_raw:
    if isinstance(f, dict) and f.get('key', '').startswith('symptom_'):
        confirmed_symptoms.append({'key': f['key'], 'value': f.get('value', 'confirmed')})

# Fall back to seed if eliza produced nothing
if not confirmed_symptoms:
    confirmed_symptoms = [
        {'key': 'symptom_fever', 'value': 'confirmed'},
        {'key': 'symptom_cough', 'value': 'confirmed'}
    ]

# Build narrative from confirmed symptoms
symptom_names = [f['key'].replace('symptom_', '') for f in confirmed_symptoms]
narrative = 'patient reports ' + ' and '.join(symptom_names)

facts = [{'key': 'symptom_narrative', 'value': narrative}] + confirmed_symptoms

# Carry forward duration/severity if present
for f in facts_raw:
    if isinstance(f, dict) and f.get('key') in ('duration', 'severity'):
        facts.append(f)

intent_json = {
    'intent': 'Parse symptom narrative into Conceptual Dependency primitives (ATRANS/PTRANS/INGEST/EXPEL)',
    'candidates': [
        {'id': 'ATRANS_heat_transfer', 'score': 0.0, 'eliminated': False},
        {'id': 'PTRANS_pathogen_entry', 'score': 0.0, 'eliminated': False},
        {'id': 'EXPEL_cough_reflex', 'score': 0.0, 'eliminated': False},
        {'id': 'INGEST_infection', 'score': 0.0, 'eliminated': False},
        {'id': 'MBUILD_symptom_model', 'score': 0.0, 'eliminated': False}
    ],
    'facts': facts,
    'rules': [
        {'id': 'r_fever_cd', 'premise': ['symptom=fever'], 'conclusion': 'ATRANS(heat, body, environment)', 'certainty': 1.0},
        {'id': 'r_cough_cd', 'premise': ['symptom=cough'], 'conclusion': 'EXPEL(air, lungs, mouth)', 'certainty': 1.0},
        {'id': 'r_infection_cd', 'premise': ['fever AND cough'], 'conclusion': 'PTRANS(pathogen, external, respiratory_tract)', 'certainty': 1.0},
        {'id': 'r_duration_cd', 'premise': ['duration > 2 days'], 'conclusion': 'MBUILD(immune_response, active)', 'certainty': 1.0}
    ],
    'goals': [
        {'id': 'g_cd_parse', 'predicate': 'cd_primitives_extracted', 'value': 'true'},
        {'id': 'g_semantic_structure', 'predicate': 'semantic_roles_assigned', 'value': 'true'}
    ],
    'cases': [
        {'id': 'case_fever_semantics', 'intent': 'fever CD primitive', 'architecture': 'autoinstinct_semantics', 'outcome_score': 0.9, 'facts': [{'key': 'symptom', 'value': 'fever'}]},
        {'id': 'case_cough_semantics', 'intent': 'cough CD primitive', 'architecture': 'autoinstinct_semantics', 'outcome_score': 0.88, 'facts': [{'key': 'symptom', 'value': 'cough'}]}
    ],
    'state': [
        {'predicate': 'parsing_mode', 'value': 'cd_primitives'},
        {'predicate': 'narrative_processed', 'value': 'false'},
        {'predicate': 'primitives_found', 'value': '0'}
    ]
}

print(json.dumps(intent_json, indent=2))
