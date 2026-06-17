import json
import sys

_raw = sys.stdin.read()
_idx = _raw.find('{')
prev = json.loads(_raw[_idx:]) if _idx != -1 else {}
prev_payload = prev.get('payload', {})
prev_output_hash = prev_payload.get('output_hash', '') or prev.get('output_hash', '')
prev_breed = prev_payload.get('breed', '') or prev.get('breed', '')

# Load base input from the template json
base_input = json.loads(r'''{
  "intent": "detect contradictory operational beliefs in a distributed deployment agent",
  "facts": [
    {
      "key": "belief:system_redundancy",
      "value": "high \u2014 multiple replicas ensure no single point of failure"
    },
    {
      "key": "belief:system_reliability",
      "value": "low \u2014 any single node outage causes full service loss"
    },
    {
      "key": "belief:deployment_is_automated",
      "value": "true \u2014 CI/CD pipeline handles all releases without human review"
    },
    {
      "key": "belief:deployment_requires_manual_approval",
      "value": "true \u2014 all production changes require sign-off from on-call engineer"
    },
    {
      "key": "belief:data_is_ephemeral",
      "value": "true \u2014 containers are stateless; no durable data written locally"
    },
    {
      "key": "belief:data_must_be_local",
      "value": "true \u2014 latency constraints require in-process data cache written to local disk"
    },
    {
      "key": "belief:scaling_is_horizontal",
      "value": "true \u2014 load is distributed across N identical stateless pods"
    },
    {
      "key": "belief:database_is_single_writer",
      "value": "true \u2014 all writes funnel through one primary to preserve ordering guarantees"
    },
    {
      "key": "belief:config_is_immutable",
      "value": "true \u2014 service config baked into container image at build time"
    },
    {
      "key": "belief:config_is_runtime_dynamic",
      "value": "true \u2014 feature flags and thresholds updated live via config service without redeploy"
    },
    {
      "key": "belief:observability_is_complete",
      "value": "true \u2014 every operation emits a span; no blind spots"
    },
    {
      "key": "belief:tracing_is_sampled",
      "value": "true \u2014 only 1% of traces are retained to control storage costs"
    }
  ],
  "candidates": [],
  "rules": [],
  "cases": [],
  "goals": [],
  "state": []
}''')

# Cryptographically bind to prior stage
if prev_output_hash:
    if 'facts' not in base_input:
        base_input['facts'] = []
    base_input['facts'].append({
        'key': 'prior_stage_hash',
        'value': f"{prev_breed}:{prev_output_hash}"
    })

print(json.dumps(base_input, indent=2))
