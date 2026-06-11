const fs = require('fs');

const breeds = [
  'eliza', 'cbr', 'dendral', 'strips', 'prolog', 'mycin', 'gps', 'soar', 'hearsay',
  'autoinstinct_neurosis', 'autoinstinct_semantics', 'autoinstinct_vision', 'autoinstinct_learning',
  'ltl_monitor', 'allen_temporal', 'fuzzy_logic', 'bayesian_network', 'csp_ac3', 'default_logic',
  'htn_planning', 'dempster_shafer', 'frames_inheritance', 'ebl', 'asp', 'description_logic',
  'abductive_lp', 'abductive_ibe', 'partial_order_plan', 'event_calculus', 'mdp', 'version_space',
  'belief_merging', 'qualitative_reason', 'script_sam', 'clp', 'situation_calculus', 'circumscription',
  'analogy_sme', 'act_r', 'problog', 'sat_cdcl', 'episodic_memory', 'rl_symbolic', 'ctl_check',
  'ilp', 'naive_physics', 'tableaux', 'construction_grammar', 'markov_logic', 'pomdp',
  'contingent_plan', 'meta_reasoning'
];

for (const breed of breeds) {
  if (!fs.existsSync(`docs/breeds/${breed}.md`)) {
    console.log(`Missing docs for ${breed}`);
  }
}
