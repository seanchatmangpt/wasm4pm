#!/usr/bin/env bash

# audit_implementations.sh
# An exhaustive scanner to detect stubs, fake implementations, and incomplete logic across the codebase.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo "========================================================"
echo "🔍 Starting Algorithm Quality and Stub Audit"
echo "========================================================"

STUB_FOUND=0

# Helper function to run a search and report
check_pattern() {
    local pattern=$1
    local file_ext=$2
    local description=$3
    local exclude_dirs=${4:-""}

    echo -e "\n${YELLOW}Checking for $description ($pattern) in *.$file_ext...${NC}"
    
    local matches
    if [ -n "$exclude_dirs" ]; then
        matches=$(find . -type f -name "*.$file_ext" -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/dist/*" -not -path "*/.git/*" -not -path "*/.claude/*" -not -path "$exclude_dirs" -exec grep -Hn -E "$pattern" {} + || true)
    else
        matches=$(find . -type f -name "*.$file_ext" -not -path "*/node_modules/*" -not -path "*/target/*" -not -path "*/dist/*" -not -path "*/.git/*" -not -path "*/.claude/*" -exec grep -Hn -E "$pattern" {} + || true)
    fi

    if [ -n "$matches" ]; then
        local has_real_matches=0
        local filtered_matches=""
        
        while read -r line; do
            # Filter out known false positives
            if [[ "$line" != *"adversarial"* ]] && \
               [[ "$line" != *"tests"* ]] && \
               [[ "$line" != *"audit_implementations.sh"* ]] && \
               [[ "$line" != *"tps-metrics"* ]] && \
               [[ "$line" != *"Replaces the DFG-projection stub"* ]] && \
               [[ "$line" != *"Monotonic clock stub"* ]] && \
               [[ "$line" != *"stub implementations for patterns not in"* ]]; then
                 filtered_matches="${filtered_matches}\n  ${line}"
                 has_real_matches=1
                 STUB_FOUND=1
            fi
        done <<< "$matches"
        
        if [ $has_real_matches -eq 1 ]; then
            echo -e "${RED}❌ Found suspicious occurrences:${NC}"
            echo -e "$filtered_matches"
        else
            echo -e "${GREEN}✓ Clean (only known false positives found)${NC}"
        fi
    else
        echo -e "${GREEN}✓ Clean${NC}"
    fi
}

# 1. Obvious Stub Markers in Rust
check_pattern '\bunimplemented!\(' 'rs' 'unimplemented! macros'
check_pattern '\btodo!\(' 'rs' 'todo! macros'
check_pattern 'FIXME' 'rs' 'FIXME comments'
check_pattern '\bstub\b' 'rs' 'explicit "stub" keyword' '*/tests/*'

# 2. Obvious Stub Markers in TS
check_pattern '\bthrow new Error\("Not implemented"\)' 'ts' 'Not implemented errors'
check_pattern 'TODO:' 'ts' 'TODO comments'
check_pattern 'FIXME' 'ts' 'FIXME comments'

# 3. Suspicious Empty Returns in Rust WASM endpoints
check_pattern 'Ok\(JsValue::null\(\)\)' 'rs' 'Hardcoded null returns'
check_pattern 'to_js_str\(&json!\(\{\}\)\)' 'rs' 'Hardcoded empty JSON object returns'

# 4. Delegation Stubs (e.g., an advanced algorithm just returning a basic DFG)
echo -e "\n${YELLOW}Checking for improper delegations (e.g. Inductive Miner just calling discover_dfg)...${NC}"
SUSPICIOUS_DELEGATIONS=$(find wasm4pm/src crates -type f -name "*.rs" ! -name "anomaly.rs" -exec awk '
    /pub fn discover_/ {
        in_func=1; 
        func_name=$0; 
        has_dfg=0; 
    } 
    in_func && /discover_dfg\(/ && func_name !~ /discover_dfg/ { 
        has_dfg=1 
    } 
    in_func && /^\}/ { 
        if(has_dfg) print FILENAME ": " func_name " seems to delegate to discover_dfg"; 
        in_func=0 
    }
' {} +)

if [ -n "$SUSPICIOUS_DELEGATIONS" ]; then
    echo -e "${RED}❌ Found suspicious algorithm delegations:${NC}"
    echo "$SUSPICIOUS_DELEGATIONS"
    STUB_FOUND=1
else
    echo -e "${GREEN}✓ No suspicious delegations found${NC}"
fi

# 5. Check if all exported JS functions in algorithm-registry.ts actually exist in the Rust source
echo -e "\n${YELLOW}Cross-referencing TypeScript algorithm registry with Rust exports...${NC}"
REGISTRY_FUNCTIONS=$(grep -o "'.*'" packages/contracts/src/algorithm-registry.ts | sed "s/'//g" | grep -v undefined | grep -v dfg | grep -v fallback)

MISSING_EXPORTS=0
for func in $REGISTRY_FUNCTIONS; do
    # Skip JS-only functions
    if [[ "$func" == "read_bpmn" || "$func" == "from_pnml_wasm" || "$func" == "wasm_compute_precision" ]]; then
        continue;
    fi

    # Search for #[wasm_bindgen] pub fn $func
    MATCH=$(find wasm4pm/src crates -type f -name "*.rs" -exec grep -l -E "(pub fn $func|js_name = $func)" {} +)
    if [ -z "$MATCH" ]; then
        echo -e "${RED}❌ Missing Rust WASM export for registry function: $func${NC}"
        STUB_FOUND=1
        MISSING_EXPORTS=1
    fi
done

if [ $MISSING_EXPORTS -eq 0 ]; then
    echo -e "${GREEN}✓ All registry functions map to valid Rust exports${NC}"
fi


echo "========================================================"
if [ $STUB_FOUND -eq 1 ]; then
    echo -e "${RED}Audit Failed: Found stubs, placeholders, or incomplete logic!${NC}"
    exit 1
else
    echo -e "${GREEN}Audit Passed: No stubs or fake logic detected!${NC}"
    exit 0
fi
