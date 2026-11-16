import json
import os
import sys

def recover_session(json_path, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Opening {json_path}...")
    with open(json_path, 'r') as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {e}")
            return

    latest_files = {}

    messages = data.get('messages', [])
    print(f"Processing {len(messages)} messages...")

    for message in messages:
        for tool_call in message.get('toolCalls', []):
            if tool_call.get('status') != 'success':
                continue
            
            name = tool_call.get('name')
            args = tool_call.get('args', {})
            result_display = tool_call.get('resultDisplay', {})
            
            file_path = args.get('file_path')
            if not file_path:
                continue

            content = None
            if name == 'write_file':
                content = args.get('content')
            elif name == 'replace':
                if isinstance(result_display, dict):
                    content = result_display.get('newContent')
                # Fallback if newContent isn't in resultDisplay but was successful
                # (though usually resultDisplay is reliable for Gemini logs)
            
            if content:
                latest_files[file_path] = content
                print(f"  Found update for: {file_path}")

    for file_path, content in latest_files.items():
        # Clean the file path (it might be relative or absolute)
        # We'll treat all paths as relative to the recovery dir
        clean_path = file_path.lstrip('/')
        target_path = os.path.join(output_dir, clean_path)
        
        target_parent = os.path.dirname(target_path)
        if target_parent and not os.path.exists(target_parent):
            os.makedirs(target_parent)
            
        with open(target_path, 'w') as f:
            f.write(content)
        print(f"Recovered: {file_path} -> {target_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 recover_session.py <session_json_path> <output_dir>")
        sys.exit(1)
    
    recover_session(sys.argv[1], sys.argv[2])
