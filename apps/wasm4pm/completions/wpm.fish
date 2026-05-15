# wpm (wasm4pm) fish completion
# Install: wpm completions fish > ~/.config/fish/completions/wpm.fish

# Disable file completions for wpm by default
complete -c wpm -f

# Top-level command descriptions
complete -c wpm -n '__fish_use_subcommand' -a 'run'          -d 'Discover a process model from an event log'
complete -c wpm -n '__fish_use_subcommand' -a 'compare'      -d 'Compare multiple algorithms side-by-side'
complete -c wpm -n '__fish_use_subcommand' -a 'diff'         -d 'Compare two event logs via Jaccard similarity'
complete -c wpm -n '__fish_use_subcommand' -a 'watch'        -d 'Re-run discovery on config changes'
complete -c wpm -n '__fish_use_subcommand' -a 'predict'      -d 'Predictive process monitoring (6 perspectives)'
complete -c wpm -n '__fish_use_subcommand' -a 'drift-watch'  -d 'Real-time EWMA concept drift monitoring'
complete -c wpm -n '__fish_use_subcommand' -a 'ml'           -d 'ML-powered process mining'
complete -c wpm -n '__fish_use_subcommand' -a 'powl'         -d 'Partial-order workflow language analysis'
complete -c wpm -n '__fish_use_subcommand' -a 'quality'      -d 'Multi-dimensional quality assessment'
complete -c wpm -n '__fish_use_subcommand' -a 'conformance'  -d 'Measure log-to-model fitness and precision'
complete -c wpm -n '__fish_use_subcommand' -a 'validate'     -d 'Validate event log schema and data quality'
complete -c wpm -n '__fish_use_subcommand' -a 'simulate'     -d 'Monte Carlo simulation and process tree playout'
complete -c wpm -n '__fish_use_subcommand' -a 'temporal'     -d 'Analyze temporal profiles and performance patterns'
complete -c wpm -n '__fish_use_subcommand' -a 'social'       -d 'Mine social networks from event logs'
complete -c wpm -n '__fish_use_subcommand' -a 'autoprocess'  -d 'Autonomic control loop (Perception → Decision → Protection → Optimization)'
complete -c wpm -n '__fish_use_subcommand' -a 'status'       -d 'WASM engine health and system info'
complete -c wpm -n '__fish_use_subcommand' -a 'doctor'       -d 'Environment diagnostic (24 checks)'
complete -c wpm -n '__fish_use_subcommand' -a 'explain'      -d 'Human/academic algorithm explanations'
complete -c wpm -n '__fish_use_subcommand' -a 'init'         -d 'Scaffold wasm4pm.toml and .env.example'
complete -c wpm -n '__fish_use_subcommand' -a 'results'      -d 'Browse saved discovery and prediction results'
complete -c wpm -n '__fish_use_subcommand' -a 'swarm'        -d 'Multi-worker swarm coordination'
complete -c wpm -n '__fish_use_subcommand' -a 'agent'        -d 'Van der Aalst autonomous adversarial agents'
complete -c wpm -n '__fish_use_subcommand' -a 'cognition'    -d 'Cognitive process mining verbs'
complete -c wpm -n '__fish_use_subcommand' -a 'completions'  -d 'Print shell completion script'

# Helper: detect which subcommand is active
function __wpm_subcommand
  set -l cmd (commandline -poc)
  set -l subcmds run compare diff watch predict drift-watch ml powl quality conformance validate simulate temporal social autoprocess status doctor explain init results swarm agent cognition completions
  for i in (seq 2 (count $cmd))
    if contains -- $cmd[$i] $subcmds
      echo $cmd[$i]
      return 0
    end
  end
  return 1
end

function __wpm_seen_subcommand
  set -l subcmd (__wpm_subcommand)
  test -n "$subcmd"
end

function __wpm_subcommand_is
  set -l subcmd (__wpm_subcommand)
  test "$subcmd" = "$argv[1]"
end

# ------ cognition subcommand verbs ------
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'run'         -d 'Run cognitive process mining on an event log'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'explain'     -d 'Generate a cognitive explanation of a process model'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'verify'      -d 'Verify process model against event evidence'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'receipt'     -d 'Generate a cryptographic receipt for a process run'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'adversarial' -d 'Adversarial validation of process claims'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'replay'      -d 'Replay an event log against a process model'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'plan'        -d 'Generate an execution plan for process analysis'
complete -c wpm -n '__wpm_subcommand_is cognition' -a 'inspect'     -d 'Inspect internal engine state'

# ------ powl subcommands ------
complete -c wpm -n '__wpm_subcommand_is powl' -a 'parse'       -d 'Parse a POWL model from file'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'simplify'    -d 'Simplify a POWL model'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'convert'     -d 'Convert POWL to process tree or Petri net'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'diff'        -d 'Compute difference between two POWL models'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'complexity'  -d 'Compute complexity metrics for a POWL model'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'footprints'  -d 'Compute footprint matrix from POWL model'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'conformance' -d 'Check log conformance against POWL model'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'import'      -d 'Import POWL model from external format'
complete -c wpm -n '__wpm_subcommand_is powl' -a 'discover'    -d 'Discover a POWL model from an event log'

# ------ ml tasks ------
complete -c wpm -n '__wpm_subcommand_is ml' -a 'classify' -d 'Classify traces (decision tree, naive Bayes)'
complete -c wpm -n '__wpm_subcommand_is ml' -a 'cluster'  -d 'Cluster traces (k-means, DBSCAN)'
complete -c wpm -n '__wpm_subcommand_is ml' -a 'forecast' -d 'Forecast drift trends'
complete -c wpm -n '__wpm_subcommand_is ml' -a 'anomaly'  -d 'Detect anomalies in drift signal'
complete -c wpm -n '__wpm_subcommand_is ml' -a 'regress'  -d 'Regress remaining time'
complete -c wpm -n '__wpm_subcommand_is ml' -a 'pca'      -d 'PCA dimensionality reduction'

# ------ predict tasks ------
complete -c wpm -n '__wpm_subcommand_is predict' -a 'next-activity'  -d 'Predict next activity in running case'
complete -c wpm -n '__wpm_subcommand_is predict' -a 'remaining-time' -d 'Predict remaining time until completion'
complete -c wpm -n '__wpm_subcommand_is predict' -a 'outcome'        -d 'Predict case outcome'
complete -c wpm -n '__wpm_subcommand_is predict' -a 'drift'          -d 'Detect concept drift'
complete -c wpm -n '__wpm_subcommand_is predict' -a 'features'       -d 'Extract predictive features from prefixes'
complete -c wpm -n '__wpm_subcommand_is predict' -a 'resource'       -d 'Recommend resource or intervention'

# ------ agent subcommands ------
complete -c wpm -n '__wpm_subcommand_is agent' -a 'list'     -d 'List all registered agents'
complete -c wpm -n '__wpm_subcommand_is agent' -a 'execute'  -d 'Execute a specific agent against an event log'
complete -c wpm -n '__wpm_subcommand_is agent' -a 'audit'    -d 'View correction audit trail'
complete -c wpm -n '__wpm_subcommand_is agent' -a 'status'   -d 'Check agent health'
complete -c wpm -n '__wpm_subcommand_is agent' -a 'register' -d 'Register a custom agent from config'

# ------ swarm subcommands ------
complete -c wpm -n '__wpm_subcommand_is swarm' -a 'run'    -d 'Run swarm coordination'
complete -c wpm -n '__wpm_subcommand_is swarm' -a 'status' -d 'Show swarm status'
complete -c wpm -n '__wpm_subcommand_is swarm' -a 'stop'   -d 'Stop swarm workers'

# ------ completions shells ------
complete -c wpm -n '__wpm_subcommand_is completions' -a 'bash' -d 'Generate bash completion script'
complete -c wpm -n '__wpm_subcommand_is completions' -a 'zsh'  -d 'Generate zsh completion script'
complete -c wpm -n '__wpm_subcommand_is completions' -a 'fish' -d 'Generate fish completion script'

# ------ shared flags (available after a subcommand is seen) ------

# --input / -i: complete .xes and .json files
complete -c wpm -n '__wpm_seen_subcommand' -s i -l input -d 'Path to event log' -r -F

# --format: output format values
complete -c wpm -n '__wpm_seen_subcommand' -l format -d 'Output format' -r -a 'human json sarif jsonl'

# --config: .toml / .json config files
complete -c wpm -n '__wpm_seen_subcommand' -l config -d 'Path to config file' -r -F

# --algorithm / -a: discovery algorithms
complete -c wpm -n '__wpm_seen_subcommand' -s a -l algorithm -d 'Discovery algorithm' -r -a '
  dfg
  alpha_plus_plus
  heuristic_miner
  inductive_miner
  hill_climbing
  declare
  simulated_annealing
  a_star
  aco
  pso
  genetic_algorithm
  optimized_dfg
  ilp
  simd_streaming_dfg
  process_skeleton'

# --profile / -p: execution profiles
complete -c wpm -n '__wpm_seen_subcommand' -s p -l profile -d 'Execution profile' -r -a 'fast balanced quality stream'

# --model / -m: model files
complete -c wpm -n '__wpm_seen_subcommand' -s m -l model -d 'Path to model file' -r -F

# --activity-key: XES attribute key
complete -c wpm -n '__wpm_seen_subcommand' -l activity-key -d 'XES activity attribute key (default: concept:name)' -r

# --resource-key: XES resource key
complete -c wpm -n '__wpm_seen_subcommand' -l resource-key -d 'XES resource attribute key' -r

# --prefix: activity prefix for predictions
complete -c wpm -n '__wpm_seen_subcommand' -l prefix -d 'Activity prefix for prediction (comma-separated)' -r

# --method: conformance method
complete -c wpm -n '__wpm_subcommand_is conformance' -l method -d 'Conformance method' -r -a 'token-replay alignments'

# --level: explanation level
complete -c wpm -n '__wpm_subcommand_is explain' -l level -d 'Explanation level' -r -a 'brief detailed academic'

# --cases: simulation case count
complete -c wpm -n '__wpm_subcommand_is simulate' -l cases -d 'Number of cases to simulate' -r

# --seed: random seed
complete -c wpm -n '__wpm_subcommand_is simulate' -l seed -d 'Random seed for reproducibility' -r

# --top-k: prediction count
complete -c wpm -n '__wpm_subcommand_is predict' -l top-k -d 'Number of top predictions to return' -r

# --window / --interval: drift watch
complete -c wpm -n '__wpm_subcommand_is drift-watch' -l window   -d 'Drift detection window size' -r
complete -c wpm -n '__wpm_subcommand_is drift-watch' -l interval -d 'Check interval in milliseconds' -r

# --limit: results
complete -c wpm -n '__wpm_subcommand_is results' -l limit -d 'Maximum number of results to show' -r

# --last: results / agent audit
complete -c wpm -n '__wpm_subcommand_is results' -l last -d 'Print the most recent result'
complete -c wpm -n '__wpm_subcommand_is agent'   -l last -d 'Number of recent audit entries' -r

# --dry-run: agent execute
complete -c wpm -n '__wpm_subcommand_is agent' -l dry-run -d 'Detect violations only, do not correct'

# Boolean flags available everywhere
complete -c wpm -n '__wpm_seen_subcommand' -l verbose -d 'Enable verbose output'
complete -c wpm -n '__wpm_seen_subcommand' -l quiet   -d 'Suppress non-error output'
complete -c wpm -n '__wpm_seen_subcommand' -l no-save -d 'Do not auto-save results'
complete -c wpm -n '__wpm_seen_subcommand' -s h -l help -d 'Show help'

# Global flags
complete -c wpm -l json   -d 'Output results as JSON'
complete -c wpm -l config -d 'Path to config file' -r -F
complete -c wpm -s h -l help -d 'Show help'
