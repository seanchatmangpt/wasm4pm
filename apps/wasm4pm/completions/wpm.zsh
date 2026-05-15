#compdef wpm
# wpm (wasm4pm) zsh completion
# Install: wpm completions zsh > "${fpath[1]}/_wpm"
# Then reload: compinit

_wpm() {
  local state line
  typeset -A opt_args

  _arguments -C \
    '--json[Output results as JSON]' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '(-h --help)'{-h,--help}'[Show help]' \
    '1: :_wpm_commands' \
    '*::args:->args'

  case $state in
    args)
      case $line[1] in
        run)         _wpm_run ;;
        compare)     _wpm_compare ;;
        diff)        _wpm_diff ;;
        watch)       _wpm_watch ;;
        predict)     _wpm_predict ;;
        drift-watch) _wpm_drift_watch ;;
        ml)          _wpm_ml ;;
        powl)        _wpm_powl ;;
        quality)     _wpm_quality ;;
        conformance) _wpm_conformance ;;
        validate)    _wpm_validate ;;
        simulate)    _wpm_simulate ;;
        temporal)    _wpm_temporal ;;
        social)      _wpm_social ;;
        autoprocess) _wpm_autoprocess ;;
        status)      _wpm_status ;;
        doctor)      _wpm_doctor ;;
        explain)     _wpm_explain ;;
        init)        _wpm_init ;;
        results)     _wpm_results ;;
        swarm)       _wpm_swarm ;;
        agent)       _wpm_agent ;;
        cognition)   _wpm_cognition ;;
        completions) _wpm_completions ;;
      esac
      ;;
  esac
}

_wpm_commands() {
  local commands
  commands=(
    'run:Discover a process model from an event log'
    'compare:Compare multiple algorithms side-by-side with sparklines'
    'diff:Compare two event logs via Jaccard similarity'
    'watch:Re-run discovery on config changes'
    'predict:Predictive process monitoring (6 perspectives)'
    'drift-watch:Real-time EWMA concept drift monitoring'
    'ml:ML-powered process mining (classify, cluster, forecast, anomaly, regress, pca)'
    'powl:Partial-order workflow language model analysis'
    'quality:Multi-dimensional quality assessment'
    'conformance:Measure log-to-model fitness and precision'
    'validate:Validate event log schema and data quality'
    'simulate:Monte Carlo simulation and process tree playout'
    'temporal:Analyze temporal profiles and performance patterns'
    'social:Mine social networks from event logs'
    'autoprocess:Autonomic control loop (Perception → Decision → Protection → Optimization)'
    'status:WASM engine health and system info'
    'doctor:Environment diagnostic (24 checks)'
    'explain:Human/academic algorithm explanations'
    'init:Scaffold wasm4pm.toml and .env.example'
    'results:Browse saved discovery and prediction results'
    'swarm:Multi-worker swarm coordination'
    'agent:Van der Aalst autonomous adversarial agents'
    'cognition:Cognitive process mining (run, explain, verify, receipt, adversarial, replay, plan, inspect)'
    'completions:Print shell completion script'
  )
  _describe 'wpm command' commands
}

# Shared flag helpers

_wpm_input_flag() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"'
}

_wpm_format_flag() {
  _arguments \
    '--format[Output format]:format:(human json sarif jsonl)'
}

_wpm_common_flags() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--verbose[Enable verbose output]' \
    '--quiet[Suppress non-error output]' \
    '--no-save[Do not auto-save results]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_algorithm_flag() {
  _arguments \
    '(-a --algorithm)'{-a,--algorithm}'[Discovery algorithm]:algorithm:(dfg alpha_plus_plus heuristic_miner inductive_miner hill_climbing declare simulated_annealing a_star aco pso genetic_algorithm optimized_dfg ilp simd_streaming_dfg process_skeleton)'
}

_wpm_profile_flag() {
  _arguments \
    '(-p --profile)'{-p,--profile}'[Execution profile]:profile:(fast balanced quality stream)'
}

# Per-command completions

_wpm_run() {
  _arguments \
    '1:event log:_files -g "*.xes *.json"' \
    '(-a --algorithm)'{-a,--algorithm}'[Discovery algorithm]:algorithm:(dfg alpha_plus_plus heuristic_miner inductive_miner hill_climbing declare simulated_annealing a_star aco pso genetic_algorithm optimized_dfg ilp simd_streaming_dfg process_skeleton)' \
    '(-p --profile)'{-p,--profile}'[Execution profile]:profile:(fast balanced quality stream)' \
    '--activity-key[XES activity attribute key (default: concept:name)]:key:' \
    '--output[Output file path]:output file:_files' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '--quiet[Suppress non-error output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_compare() {
  _arguments \
    '1:algorithms (comma-separated):' \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '(-p --profile)'{-p,--profile}'[Execution profile]:profile:(fast balanced quality stream)' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_diff() {
  _arguments \
    '1:first event log:_files -g "*.xes *.json"' \
    '2:second event log:_files -g "*.xes *.json"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_watch() {
  _arguments \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_predict() {
  local state line
  _arguments -C \
    '1:prediction task:->task' \
    '*::args:->args'

  case $state in
    task)
      local tasks
      tasks=(
        'next-activity:Predict the next activity in a running case'
        'remaining-time:Predict remaining time until case completion'
        'outcome:Predict case outcome (conforming vs deviating)'
        'drift:Detect concept drift in the event log'
        'features:Extract predictive features from case prefixes'
        'resource:Recommend resource or intervention'
      )
      _describe 'prediction task' tasks
      ;;
    args)
      _arguments \
        '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
        '--prefix[Activity prefix for prediction (comma-separated)]:prefix:' \
        '--activity-key[XES activity attribute key]:key:' \
        '--top-k[Number of top predictions to return]:k:' \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '--no-save[Do not auto-save results]' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_drift_watch() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '--window[Drift detection window size]:window:' \
    '--interval[Check interval in ms]:interval:' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_ml() {
  local state line
  _arguments -C \
    '1:ML task:->task' \
    '*::args:->args'

  case $state in
    task)
      local tasks
      tasks=(
        'classify:Classify traces using decision tree or naive Bayes'
        'cluster:Cluster traces using k-means or DBSCAN'
        'forecast:Forecast drift trends'
        'anomaly:Detect anomalies in process drift signal'
        'regress:Regress remaining time'
        'pca:PCA dimensionality reduction on trace features'
      )
      _describe 'ML task' tasks
      ;;
    args)
      _arguments \
        '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
        '(-p --profile)'{-p,--profile}'[Execution profile]:profile:(balanced quality)' \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '--no-save[Do not auto-save results]' \
        '--verbose[Enable verbose output]' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_powl() {
  local state line
  _arguments -C \
    '1:POWL subcommand:->subcmd' \
    '*::args:->args'

  case $state in
    subcmd)
      local subcmds
      subcmds=(
        'parse:Parse a POWL model from file'
        'simplify:Simplify a POWL model'
        'convert:Convert POWL to process tree or Petri net'
        'diff:Compute difference between two POWL models'
        'complexity:Compute complexity metrics for a POWL model'
        'footprints:Compute footprint matrix from POWL model'
        'conformance:Check log conformance against POWL model'
        'import:Import POWL model from external format'
        'discover:Discover a POWL model from an event log'
      )
      _describe 'POWL subcommand' subcmds
      ;;
    args)
      _arguments \
        '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
        '(-m --model)'{-m,--model}'[Path to model file]:model file:_files -g "*.json *.pnml *.bpmn"' \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '--no-save[Do not auto-save results]' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_quality() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '(-m --model)'{-m,--model}'[Path to model file]:model file:_files -g "*.json *.pnml"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_conformance() {
  _arguments \
    '1:event log:_files -g "*.xes *.json"' \
    '(-m --model)'{-m,--model}'[Path to model file]:model file:_files -g "*.json *.pnml"' \
    '--method[Conformance method]:method:(token-replay alignments)' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--config[Path to config file]:config file:_files -g "*.toml *.json"' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_validate() {
  _arguments \
    '1:event log:_files -g "*.xes *.json"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--strict[Enable strict validation mode]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_simulate() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '--cases[Number of cases to simulate]:cases:' \
    '--seed[Random seed for reproducibility]:seed:' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_temporal() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '--activity-key[XES activity attribute key]:key:' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_social() {
  _arguments \
    '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
    '--resource-key[XES resource attribute key]:key:' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--no-save[Do not auto-save results]' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_autoprocess() {
  _arguments \
    '1:event log:_files -g "*.xes *.json"' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_status() {
  _arguments \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_doctor() {
  _arguments \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '--verbose[Enable verbose output]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_explain() {
  _arguments \
    '(-a --algorithm)'{-a,--algorithm}'[Algorithm to explain]:algorithm:(dfg alpha_plus_plus heuristic_miner inductive_miner hill_climbing declare simulated_annealing a_star aco pso genetic_algorithm optimized_dfg ilp)' \
    '(-m --model)'{-m,--model}'[Path to model file]:model file:_files' \
    '--level[Explanation level]:level:(brief detailed academic)' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_init() {
  _arguments \
    '--force[Overwrite existing config files]' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_results() {
  _arguments \
    '--last[Print the most recent result]' \
    '--limit[Maximum number of results to show]:limit:' \
    '--format[Output format]:format:(human json sarif jsonl)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm_swarm() {
  local state line
  _arguments -C \
    '1:swarm subcommand:->subcmd' \
    '*::args:->args'

  case $state in
    subcmd)
      local subcmds
      subcmds=(
        'run:Run swarm coordination'
        'status:Show swarm status'
        'stop:Stop swarm workers'
      )
      _describe 'swarm subcommand' subcmds
      ;;
    args)
      _arguments \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_agent() {
  local state line
  _arguments -C \
    '1:agent subcommand:->subcmd' \
    '*::args:->args'

  case $state in
    subcmd)
      local subcmds
      subcmds=(
        'list:List all registered van der Aalst agents'
        'execute:Execute a specific agent against an event log'
        'audit:View correction audit trail'
        'status:Check agent health'
        'register:Register a custom agent from config'
      )
      _describe 'agent subcommand' subcmds
      ;;
    args)
      _arguments \
        '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
        '--dry-run[Detect violations only, do not correct]' \
        '--last[Number of recent audit entries]:n:' \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_cognition() {
  local state line
  _arguments -C \
    '1:cognition verb:->verb' \
    '*::args:->args'

  case $state in
    verb)
      local verbs
      verbs=(
        'run:Run cognitive process mining on an event log'
        'explain:Generate a cognitive explanation of a process model'
        'verify:Verify process model against event evidence'
        'receipt:Generate a cryptographic receipt for a process run'
        'adversarial:Adversarial validation of process claims'
        'replay:Replay an event log against a process model'
        'plan:Generate an execution plan for process analysis'
        'inspect:Inspect internal state of the process mining engine'
      )
      _describe 'cognition verb' verbs
      ;;
    args)
      _arguments \
        '(-i --input)'{-i,--input}'[Path to event log]:event log:_files -g "*.xes *.json"' \
        '--prefix[Activity prefix (comma-separated)]:prefix:' \
        '--activity-key[XES activity attribute key]:key:' \
        '--format[Output format]:format:(human json sarif jsonl)' \
        '--no-save[Do not auto-save results]' \
        '--verbose[Enable verbose output]' \
        '(-h --help)'{-h,--help}'[Show help]'
      ;;
  esac
}

_wpm_completions() {
  _arguments \
    '1:shell:(bash zsh fish)' \
    '(-h --help)'{-h,--help}'[Show help]'
}

_wpm "$@"
