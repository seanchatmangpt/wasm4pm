import os
import json
import re

def audit_tests(root_dir):
    manifest = []
    
    # Patterns for prohibited habits
    forbidden_patterns = {
        'mock': re.compile(r'mock', re.IGNORECASE),
        'jest_fn': re.compile(r'jest\.fn\(\)', re.IGNORECASE),
        'stub': re.compile(r'stub', re.IGNORECASE),
        'placeholder': re.compile(r'TODO|FIXME|placeholder', re.IGNORECASE)
    }

    for root, dirs, files in os.walk(root_dir):
        if 'node_modules' in root or 'dist' in root or 'target' in root or '.git' in root:
            continue
            
        for file in files:
            if file.endswith(('.test.ts', '.test.js', '_test.rs')):
                file_path = os.path.join(root, file)
                
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    
                metrics = {
                    'file': file_path,
                    'type': 'rust' if file.endswith('_test.rs') else 'typescript',
                    'loc': len(content.splitlines()),
                    'forbidden_found': []
                }
                
                for name, pattern in forbidden_patterns.items():
                    if pattern.search(content):
                        metrics['forbidden_found'].append(name)
                        
                manifest.append(metrics)
                
    with open('TEST_AUDIT_MANIFEST.json', 'w') as f:
        json.dump(manifest, f, indent=2)
    print("Audit manifest generated: TEST_AUDIT_MANIFEST.json")

if __name__ == '__main__':
    audit_tests('.')
