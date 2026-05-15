# wpm (wasm4pm) bash completion
# Install: wpm completions bash > /etc/bash_completion.d/wpm
#          or: wpm completions bash > ~/.local/share/bash-completion/completions/wpm

_wpm() {
  local cur prev words cword
  _init_completion 2>/dev/null || {
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    words=("${COMP_WORDS[@]}")
    cword=$COMP_CWORD
  }

  local top_commands="run compare diff watch predict drift-watch ml powl quality conformance validate simulate temporal social autoprocess status doctor explain init results swarm agent completions"

  # cognition verbs
  local cognition_verbs="run explain verify receipt adversarial replay plan inspect"

  # powl subcommands
  local powl_commands="parse simplify convert diff complexity footprints conformance import discover"

  # ml tasks
  local ml_tasks="classify cluster forecast anomaly regress pca"

  # predict tasks
  local predict_tasks="next-activity remaining-time outcome drift features resource"

  # agent subcommands
  local agent_commands="list execute audit status register"

  # swarm subcommands
  local swarm_commands="run status stop"

  # output formats
  local output_formats="human json sarif jsonl"

  # execution profiles
  local profiles="fast balanced quality stream"

  # discovery algorithms
  local algorithms="dfg alpha_plus_plus heuristic_miner inductive_miner hill_climbing declare simulated_annealing a_star aco pso genetic_algorithm optimized_dfg ilp simd_streaming_dfg process_skeleton"

  if [[ $cword -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${top_commands}" -- "${cur}") )
    return 0
  fi

  local command="${words[1]}"

  case "${command}" in
    cognition)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${cognition_verbs}" -- "${cur}") )
        return 0
      fi
      ;;
    powl)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${powl_commands}" -- "${cur}") )
        return 0
      fi
      ;;
    ml)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${ml_tasks}" -- "${cur}") )
        return 0
      fi
      ;;
    predict)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${predict_tasks}" -- "${cur}") )
        return 0
      fi
      ;;
    agent)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${agent_commands}" -- "${cur}") )
        return 0
      fi
      ;;
    swarm)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${swarm_commands}" -- "${cur}") )
        return 0
      fi
      ;;
    completions)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "${cur}") )
        return 0
      fi
      ;;
  esac

  # Flag completions
  case "${prev}" in
    --input|-i)
      COMPREPLY=( $(compgen -f -X '!*.@(xes|json)' -- "${cur}") )
      [[ ${#COMPREPLY[@]} -eq 0 ]] && COMPREPLY=( $(compgen -f -- "${cur}") )
      return 0
      ;;
    --format|-f)
      COMPREPLY=( $(compgen -W "${output_formats}" -- "${cur}") )
      return 0
      ;;
    --algorithm|-a)
      COMPREPLY=( $(compgen -W "${algorithms}" -- "${cur}") )
      return 0
      ;;
    --profile|-p)
      COMPREPLY=( $(compgen -W "${profiles}" -- "${cur}") )
      return 0
      ;;
    --model|-m)
      COMPREPLY=( $(compgen -f -X '!*.@(json|pnml|bpmn)' -- "${cur}") )
      [[ ${#COMPREPLY[@]} -eq 0 ]] && COMPREPLY=( $(compgen -f -- "${cur}") )
      return 0
      ;;
    --config|-c)
      COMPREPLY=( $(compgen -f -X '!*.@(toml|json)' -- "${cur}") )
      [[ ${#COMPREPLY[@]} -eq 0 ]] && COMPREPLY=( $(compgen -f -- "${cur}") )
      return 0
      ;;
    --output|-o)
      COMPREPLY=( $(compgen -f -- "${cur}") )
      return 0
      ;;
  esac

  # Positional file argument for commands that take a log file directly
  case "${command}" in
    run|autoprocess|validate|diff)
      if [[ "${cur}" != -* ]]; then
        COMPREPLY=( $(compgen -f -X '!*.@(xes|json)' -- "${cur}") )
        [[ ${#COMPREPLY[@]} -eq 0 ]] && COMPREPLY=( $(compgen -f -- "${cur}") )
        return 0
      fi
      ;;
  esac

  # General flag completions for commands with --input
  if [[ "${cur}" == -* ]]; then
    local common_flags="--input --format --config --verbose --quiet --no-save --help"
    case "${command}" in
      run)
        COMPREPLY=( $(compgen -W "${common_flags} --algorithm --profile --activity-key --output" -- "${cur}") )
        ;;
      compare)
        COMPREPLY=( $(compgen -W "${common_flags} --algorithms --profile" -- "${cur}") )
        ;;
      diff)
        COMPREPLY=( $(compgen -W "--format --verbose --help" -- "${cur}") )
        ;;
      predict)
        COMPREPLY=( $(compgen -W "${common_flags} --prefix --activity-key --top-k" -- "${cur}") )
        ;;
      drift-watch)
        COMPREPLY=( $(compgen -W "--input --format --window --interval --help" -- "${cur}") )
        ;;
      ml)
        COMPREPLY=( $(compgen -W "${common_flags} --profile" -- "${cur}") )
        ;;
      powl)
        COMPREPLY=( $(compgen -W "${common_flags} --model" -- "${cur}") )
        ;;
      quality)
        COMPREPLY=( $(compgen -W "${common_flags} --model" -- "${cur}") )
        ;;
      conformance)
        COMPREPLY=( $(compgen -W "${common_flags} --model --method" -- "${cur}") )
        ;;
      validate)
        COMPREPLY=( $(compgen -W "--format --verbose --strict --help" -- "${cur}") )
        ;;
      simulate)
        COMPREPLY=( $(compgen -W "${common_flags} --cases --seed" -- "${cur}") )
        ;;
      temporal)
        COMPREPLY=( $(compgen -W "${common_flags} --activity-key" -- "${cur}") )
        ;;
      social)
        COMPREPLY=( $(compgen -W "${common_flags} --resource-key" -- "${cur}") )
        ;;
      autoprocess)
        COMPREPLY=( $(compgen -W "--format --verbose --help" -- "${cur}") )
        ;;
      results)
        COMPREPLY=( $(compgen -W "--format --last --limit --help" -- "${cur}") )
        ;;
      cognition)
        COMPREPLY=( $(compgen -W "${common_flags} --prefix --activity-key" -- "${cur}") )
        ;;
      completions)
        COMPREPLY=( $(compgen -W "--help" -- "${cur}") )
        ;;
      *)
        COMPREPLY=( $(compgen -W "${common_flags}" -- "${cur}") )
        ;;
    esac
    return 0
  fi

  return 0
}

complete -F _wpm wpm
