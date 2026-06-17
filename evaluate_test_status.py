import json

with open('TEST_AUDIT_MANIFEST.json', 'r') as f:
    manifest = json.load(f)

# Sort by number of forbidden patterns (descending)
sorted_manifest = sorted(manifest, key=lambda x: len(x['forbidden_found']), reverse=True)

print("--- TOP 10 HIGH-RISK TEST FILES ---")
for entry in sorted_manifest[:10]:
    print(f"File: {entry['file']}")
    print(f"  Forbidden patterns: {entry['forbidden_found']}")
    print(f"  LOC: {entry['loc']}")
    print("-" * 20)

