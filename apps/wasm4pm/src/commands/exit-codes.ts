import { defineCommand } from 'citty';

export const exitCodes = defineCommand({
  meta: {
    name: 'exit-codes',
    description: 'Show exit code reference and their meanings',
  },
  async run() {
    const BOLD = '\x1b[1m';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';
    const GREEN = '\x1b[32m';
    const YELLOW = '\x1b[33m';
    const RED = '\x1b[31m';

    process.stdout.write(`
${BOLD}wpm Exit Codes Reference${RESET}

${DIM}Exit codes help you understand command success/failure. Useful in shell scripts and CI/CD pipelines.${RESET}

${BOLD}Code${RESET}  ${BOLD}Name${RESET}                ${BOLD}Meaning${RESET}
${DIM}────────────────────────────────────────────────────────────────${RESET}
${GREEN}0${RESET}     Success               Command completed successfully
${YELLOW}1${RESET}     Config Error         Invalid config file, missing required flags
${YELLOW}2${RESET}     Source Error         Invalid event log format, missing/unreadable file
${RED}3${RESET}     Execution Error      Algorithm failed, timeout, out of memory
${RED}4${RESET}     Partial Failure      Some operations succeeded, some failed (e.g. in multi-algorithm comparisons or batch runs)
${RED}5${RESET}     System Error         I/O error, permission denied, system resource limits
${RED}6${RESET}     Conformance Fail     Fitness/precision below threshold (--assert-fitness, --assert-precision)

${BOLD}Examples:${RESET}

Check exit code:
  ${DIM}# Run a command and check result${RESET}
  wpm run log.xes
  echo "Exit code: $?"

Fail on low fitness:
  ${DIM}# Exit with code 6 if fitness < 0.85${RESET}
  wpm run log.xes --assert-fitness 0.85
  if [ $? -eq 6 ]; then
    echo "Fitness threshold not met"
  fi

Validate source:
  ${DIM}# Exit with code 2 if file is invalid${RESET}
  wpm validate log.xes
  if [ $? -eq 2 ]; then
    echo "Event log is not valid XES"
  fi

${BOLD}Common Patterns:${RESET}

Batch comparison gate:
  wpm compare dfg,heuristic,genetic -i log.xes
  if [ $? -eq 4 ]; then
    echo "Warning: At least one algorithm failed execution"
  fi

Shell script safe run:
  wpm run log.xes || exit $?  # Propagate exit code

CI/CD validation gate:
  wpm conformance -i log.xes --assert-fitness 0.8 || { echo "Quality gate failed"; exit 1; }

Retry on transient errors:
  for i in {1..3}; do
    wpm run log.xes && break || sleep 2
  done

${DIM}See: wpm <command> --help for command-specific information${RESET}

`);

    return;
  },
});
