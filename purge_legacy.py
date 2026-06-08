import os
import re

dirs = ['/Users/sac/wasm4pm', '/Users/sac/wasm4pm-compat']

exclude_dirs = {'.git', 'target', 'node_modules', 'dist', 'build', '.cargo', '.ggen', 'vendors'}
exclude_files = {'Cargo.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store'}
exclude_exts = {'.png', '.jpg', '.jpeg', '.gif', '.pdf', '.rlib', '.exe', '.dll', '.so', '.dylib', '.wasm', '.log', '.out', '.map', '.swp', '.swo'}

def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        return False
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return False
        
    orig_content = content
    
    content = re.sub(r'(?i)', '', content)
    content = re.sub(r'(?i)', '', content)
    content = re.sub(r'(?i)', '', content)
    content = re.sub(r'(?i)', '', content)
    content = re.sub(r'(?i)', '', content)
    
    if content != orig_content:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated: {filepath}")
            return True
        except Exception as e:
            print(f"Error writing {filepath}: {e}")
    return False

updated_count = 0
for d in dirs:
    for root, dirnames, filenames in os.walk(d):
        dirnames[:] = [dn for dn in dirnames if dn not in exclude_dirs]
        for filename in filenames:
            if filename in exclude_files:
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in exclude_exts:
                continue
            filepath = os.path.join(root, filename)
            if filename.endswith('.lock') or filename == '.DS_Store':
                continue
            if process_file(filepath):
                updated_count += 1

print(f"Total files updated: {updated_count}")