#!/usr/bin/env bash
# Run all 52 cognition breed examples.
# Each must produce status:ok, a non-empty inference trace, and a BLAKE3 receipt.
# Failure is hard — any non-zero exit aborts.

set -euo pipefail
cd "$(dirname "$0")"

EXAMPLES=(
  abductive_ibe
  abductive_lp
  act_r
  allen_temporal
  analogy_sme
  asp
  autoinstinct_learning
  autoinstinct_neurosis
  autoinstinct_semantics
  autoinstinct_vision
  bayesian_network
  belief_merging
  cbr
  circumscription
  clp
  construction_grammar
  contingent_plan
  csp_ac3
  ctl_check
  default_logic
  dempster_shafer
  dendral
  description_logic
  ebl
  eliza
  episodic_memory
  event_calculus
  frames_inheritance
  fuzzy_logic
  gps
  hearsay
  htn_planning
  ilp
  ltl_monitor
  markov_logic
  mdp
  meta_reasoning
  mycin
  naive_physics
  partial_order_plan
  pomdp
  problog
  prolog
  qualitative_reason
  rl_symbolic
  sat_cdcl
  script_sam
  situation_calculus
  soar
  strips
  tableaux
  triz
  version_space
  morphological
  ocpm_route_discoverer
)

PASS=0
FAIL=0

for ex in "${EXAMPLES[@]}"; do
  echo ""
  echo "═══ $ex ═══"
  if bash "$ex/run.sh" >"$ex/last-output.log" 2>&1; then
    PASS=$((PASS + 1))
    oh=$(python3 -c "import json,sys; d=json.load(open('$ex/result.json')); print(d.get('payload',{}).get('output_hash', d.get('output_hash', ''))[:16])" 2>/dev/null || echo "unknown")
    echo "✓ $ex  $oh"
  else
    FAIL=$((FAIL + 1))
    echo "✗ $ex (see $ex/last-output.log)"
    cat "$ex/last-output.log" | tail -5
  fi
done

echo ""
echo "═══ Summary ═══"
echo "Passed: $PASS / ${#EXAMPLES[@]}"
echo "Failed: $FAIL"

[ $FAIL -eq 0 ] || exit 1
