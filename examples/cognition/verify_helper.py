#!/usr/bin/env python3
import sys
import json
import re
import os

def check_hex_64(val):
    return bool(re.match(r'^[0-9a-fA-F]{64}$', str(val)))

def check_hex_16(val):
    return bool(re.match(r'^[0-9a-fA-F]{16}$', str(val)))

def check_no_placeholders(val):
    s = str(val).lower()
    for placeholder in ['placeholder', 'sample', 'fake', 'stub', 'todo', 'calculated_at_runtime', 'verified_via_gate', 'assume success']:
        if placeholder in s:
            return False
    return True

def compare_runs(f1, f2):
    try:
        with open(f1, 'r') as file1:
            r1 = json.load(file1)
        with open(f2, 'r') as file2:
            r2 = json.load(file2)
    except Exception as e:
        print(f"Error loading JSON files: {e}", file=sys.stderr)
        return False

    p1 = r1.get('payload', {})
    p2 = r2.get('payload', {})

    h1 = p1.get('output_hash') or r1.get('output_hash')
    h2 = p2.get('output_hash') or r2.get('output_hash')

    rp1 = p1.get('replay_pointer') or r1.get('replay_pointer')
    rp2 = p2.get('replay_pointer') or r2.get('replay_pointer')

    o1 = p1.get('output') or r1.get('output')
    o2 = p2.get('output') or r2.get('output')

    if not h1 or h1 != h2:
        print(f"FAIL: output_hash mismatch or empty. Run1: {h1}, Run2: {h2}", file=sys.stderr)
        return False

    if not rp1 or rp1 != rp2:
        print(f"FAIL: replay_pointer mismatch or empty. Run1: {rp1}, Run2: {rp2}", file=sys.stderr)
        return False

    if not o1 or o1 != o2:
        print(f"FAIL: output object mismatch or empty.", file=sys.stderr)
        return False

    # Also verify that output_hash is 64 hex characters
    if not check_hex_64(h1):
        print(f"FAIL: output_hash '{h1}' is not a valid 64-character hex BLAKE3 hash", file=sys.stderr)
        return False

    # Also verify that replay_pointer is 16 hex characters
    if not check_hex_16(rp1):
        print(f"FAIL: replay_pointer '{rp1}' is not a valid 16-character hex string", file=sys.stderr)
        return False

    print("PASS: Runs are identical and valid.")
    return True

def check_receipt(rf):
    try:
        with open(rf, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"FAIL: Error loading receipt JSON: {e}", file=sys.stderr)
        return False

    required = ['run_id', 'status', 'breed', 'output_hash', 'replay_pointer']
    for req in required:
        if req not in data:
            print(f"FAIL: Missing required field '{req}' in receipt", file=sys.stderr)
            return False
        val = data[req]
        if not val:
            print(f"FAIL: Field '{req}' is empty in receipt", file=sys.stderr)
            return False
        if not check_no_placeholders(val):
            print(f"FAIL: Field '{req}' has placeholder value: '{val}'", file=sys.stderr)
            return False

    # Check hash formats
    run_id = data['run_id']
    output_hash = data['output_hash']
    replay_pointer = data['replay_pointer']

    if not check_hex_64(run_id):
        print(f"FAIL: run_id '{run_id}' is not a valid 64-character hex string", file=sys.stderr)
        return False
    if not check_hex_64(output_hash):
        print(f"FAIL: output_hash '{output_hash}' is not a valid 64-character hex string", file=sys.stderr)
        return False
    if not check_hex_16(replay_pointer):
        print(f"FAIL: replay_pointer '{replay_pointer}' is not a valid 16-character hex string", file=sys.stderr)
        return False

    print(f"PASS: Receipt '{rf}' is authentic and valid.")
    return True

def verify_chain_linkage(stages_dir):
    stages = [
        "00-abductive_ibe", "01-abductive_lp", "02-act_r", "03-allen_temporal",
        "04-analogy_sme", "05-asp", "06-autoinstinct_learning", "07-autoinstinct_neurosis",
        "08-autoinstinct_semantics", "09-autoinstinct_vision", "10-bayesian_network",
        "11-belief_merging", "12-cbr", "13-circumscription", "14-clp",
        "15-construction_grammar", "16-contingent_plan", "17-csp_ac3", "18-ctl_check",
        "19-default_logic", "20-dempster_shafer", "21-dendral", "22-description_logic",
        "23-ebl", "24-eliza", "25-episodic_memory", "26-event_calculus",
        "27-frames_inheritance", "28-fuzzy_logic", "29-gps", "30-hearsay",
        "31-htn_planning", "32-ilp", "33-ltl_monitor", "34-markov_logic",
        "35-mdp", "36-meta_reasoning", "37-mycin", "38-naive_physics",
        "39-partial_order_plan", "40-pomdp", "41-problog", "42-prolog",
        "43-qualitative_reason", "44-rl_symbolic", "45-sat_cdcl", "46-script_sam",
        "47-situation_calculus", "48-soar", "49-strips", "50-tableaux",
        "51-version_space"
    ]

    for i in range(1, len(stages)):
        curr_stage = stages[i]
        prev_stage = stages[i-1]

        intent_file = os.path.join(stages_dir, curr_stage, "intent.json")
        result_file = os.path.join(stages_dir, prev_stage, "result.json")

        if not os.path.exists(intent_file):
            print(f"FAIL: Missing intent file for current stage: {intent_file}", file=sys.stderr)
            return False
        if not os.path.exists(result_file):
            print(f"FAIL: Missing result file for previous stage: {result_file}", file=sys.stderr)
            return False

        try:
            with open(intent_file, 'r') as f:
                intent_data = json.load(f)
            with open(result_file, 'r') as f:
                result_data = json.load(f)
        except Exception as e:
            print(f"FAIL: Error loading stage files: {e}", file=sys.stderr)
            return False

        # Find prior_stage_hash in intent facts
        facts = intent_data.get('facts', [])
        prior_hash_fact = None
        for fact in facts:
            if fact.get('key') == 'prior_stage_hash':
                prior_hash_fact = fact.get('value')
                break

        if not prior_hash_fact:
            print(f"FAIL: Stage {curr_stage} intent is missing 'prior_stage_hash' fact", file=sys.stderr)
            return False

        parts = prior_hash_fact.split(':', 1)
        if len(parts) != 2:
            print(f"FAIL: Stage {curr_stage} prior_stage_hash format is invalid: '{prior_hash_fact}'", file=sys.stderr)
            return False

        expected_breed, expected_hash = parts
        prev_breed = prev_stage.split('-', 1)[1]

        if expected_breed != prev_breed:
            print(f"FAIL: Stage {curr_stage} expected breed '{expected_breed}' but previous was '{prev_breed}'", file=sys.stderr)
            return False

        # Get output hash of previous stage result
        payload = result_data.get('payload', {})
        actual_hash = payload.get('output_hash') or result_data.get('output_hash')

        if not actual_hash:
            print(f"FAIL: Previous stage {prev_stage} result is missing output_hash", file=sys.stderr)
            return False

        if expected_hash != actual_hash:
            print(f"FAIL: Hash linkage broken between {prev_stage} and {curr_stage}. Expected: {expected_hash}, Actual: {actual_hash}", file=sys.stderr)
            return False

        # Check formats and verify that there are no placeholders/fakes
        if not check_hex_64(actual_hash):
            print(f"FAIL: Output hash '{actual_hash}' for stage {prev_stage} is not a valid 64-char hex", file=sys.stderr)
            return False

    print(f"PASS: All {len(stages)} stages successfully link hashes in chain sequence.")
    return True

def main():
    if len(sys.argv) < 2:
        print("Usage: verify_helper.py <command> [args]", file=sys.stderr)
        sys.exit(2)

    cmd = sys.argv[1]
    if cmd == "compare-runs":
        if len(sys.argv) < 4:
            print("Usage: verify_helper.py compare-runs <file1> <file2>", file=sys.stderr)
            sys.exit(2)
        success = compare_runs(sys.argv[2], sys.argv[3])
        sys.exit(0 if success else 1)
    elif cmd == "check-receipt":
        if len(sys.argv) < 3:
            print("Usage: verify_helper.py check-receipt <receipt_file>", file=sys.stderr)
            sys.exit(2)
        success = check_receipt(sys.argv[2])
        sys.exit(0 if success else 1)
    elif cmd == "verify-chain-linkage":
        if len(sys.argv) < 3:
            print("Usage: verify_helper.py verify-chain-linkage <stages_dir>", file=sys.stderr)
            sys.exit(2)
        success = verify_chain_linkage(sys.argv[2])
        sys.exit(0 if success else 1)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(2)

if __name__ == '__main__':
    main()
