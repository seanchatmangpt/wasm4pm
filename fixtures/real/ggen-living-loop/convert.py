import os
import json
import glob

def convert_json_to_ndjson(json_file_path):
    ndjson_file_path = json_file_path.replace('.json', '.jsonl')
    with open(json_file_path, 'r') as f:
        data = json.load(f)
    
    with open(ndjson_file_path, 'w') as f:
        # According to OCEL NDJSON format (or OCELRecord parsing), we just dump the objects and events.
        # But wait, `crates/ocel-core/src/intake.rs` expects `OCELRecord` which is tagged or untagged?
        # `#[serde(untagged)] pub enum OCELRecord { Event(OCELEvent), Object(OCELObject) }`
        # So we just dump the objects and events into NDJSON as JSON objects, each on its own line.
        for obj in data.get('ocel_objects', []):
            f.write(json.dumps(obj) + '\n')
        for evt in data.get('ocel_events', []):
            f.write(json.dumps(evt) + '\n')
            
    # Remove the original .json file? The orchestrator said "convert ... to proper .jsonl".
    os.remove(json_file_path)

fixtures_dir = '/Users/sac/wasm4pm/fixtures/real/ggen-living-loop'
json_files = glob.glob(os.path.join(fixtures_dir, '*.json'))
for jf in json_files:
    convert_json_to_ndjson(jf)
    print(f"Converted {jf}")

