# Two New CLI UX Gaps Identified

## Gap 3: Machine-Readable Warning Levels in JSON Output

**Problem:** When commands run with `--format json`, all warnings/alerts use the same severity level in output. There's no way for automation/scripts to distinguish between:
- An informational hint (e.g., "This algorithm may produce underfitting models")
- A warning requiring attention (e.g., "Log has unusual trace durations; consider drift analysis")
- A critical alert (e.g., "Algorithm timed out; results may be incomplete")

**Impact:** Integration tools (CI/CD, monitoring dashboards) can't automatically route warnings to appropriate channels or set alert thresholds. All messages look equally important in JSON output.

**Current behavior:**
```bash
$ wpm run log.xes --format json
{
  "status": "ok",
  "payload": { ... },
  "meta": { ... }
  # No severity level field
}
```

**Desired behavior:**
```bash
$ wpm run log.xes --format json
{
  "status": "ok",
  "payload": { ... },
  "warnings": [
    {
      "code": "PERF_LOW_EVENT_RATE",
      "severity": "info",  # "info" | "warn" | "critical"
      "message": "Event rate is unusually low",
      "threshold_exceeded": 0.5,
      "recommended_action": "Consider using faster algorithm"
    }
  ],
  "meta": { ... }
}
```

**Implementation sketch:**
1. Add `warnings?: Array<{ code, severity, message, recommendedAction? }>` to `CommandResult` interface
2. Create a `WarningCollector` class that tracks warnings during command execution
3. Severity levels: `'info' | 'warn' | 'critical'` with clear semantics:
   - `info`: Informational, doesn't affect correctness
   - `warn`: May affect results or performance; operator attention needed
   - `critical`: Affects correctness or safety; manual intervention recommended
4. Emit warnings from various checks (performance analysis, conformance gates, etc.)
5. Include warning in JSON output when `--format json` is used

**Files affected:**
- `apps/wasm4pm/src/output.ts` — Add warnings to CommandResult
- `apps/wasm4pm/src/warning-collector.ts` (new) — Warning tracking and severity mapping
- `apps/wasm4pm/src/commands/*.ts` — Emit warnings during execution

---

## Gap 4: Shell Completion Suggestions with Context

**Problem:** When users type `wpm run --algorithm [TAB]`, the shell doesn't provide intelligent completions because there's no completion helper. Additionally, when a command partially fails or requires user choice (e.g., selecting between similar algorithm names), the CLI doesn't suggest shell completions for the next step.

**Impact:** Users must memorize algorithm names or run `wpm algorithms` to see options. New users have poor onboarding experience. No shell integration for common workflows.

**Current behavior:**
```bash
$ wpm run --algorithm [TAB]
# No completions (unless manually configured in shell)

$ wpm run log.xes --algorithm heuris[TAB]
# Shell doesn't know about heuristic_miner or heuristic-miner variants
```

**Desired behavior:**
```bash
$ wpm run --algorithm [TAB]
# Completes to: dfg heuristic inductive ilp genetic ... (with descriptions in bash-completion format)

$ wpm run log.xes --algorithm heuris[TAB]
# Suggests: heuristic_miner (noise-tolerant, good for real logs)

$ wpm run --profile [TAB]
# Completes to: fast balanced quality stream (with profile descriptions)

$ wpm completions install bash  # Install completions into ~/.bash_completion.d/
$ wpm completions install zsh   # Install completions into ~/.zsh/completions/
```

**Implementation sketch:**
1. Create `apps/wasm4pm/src/commands/completions.ts` — New `wpm completions` command
2. Subcommands:
   - `wpm completions bash` — Output bash-completion script (or `install bash`)
   - `wpm completions zsh` — Output zsh completion script
   - `wpm completions fish` — Output fish shell script
3. Add `--install` flag to auto-install into user's shell config:
   - Bash: append to `~/.bash_completion.d/wpm.bash` (or create if missing)
   - Zsh: append to `~/.zsh/completions/_wpm`
   - Fish: copy to `~/.config/fish/completions/wpm.fish`
4. Completion functions should:
   - List algorithms with descriptions (from registry metadata)
   - List profiles with brief explanations
   - List commands with help text
   - Context-aware: Only suggest valid options for current command
5. Add context hints to error output:
   - When algorithm not found: "Run `wpm completions bash --install` to get completions"
   - When option is ambiguous: Suggest closest matches + completion installation

**Files affected:**
- `apps/wasm4pm/src/commands/completions.ts` (new) — Completion generation and installation
- `apps/wasm4pm/src/cli.ts` — Register completions command
- `apps/wasm4pm/src/output.ts` — Add completion hint to error messages
- `apps/wasm4pm/src/error-recovery.ts` — Suggest completion installation when relevant

**Why these gaps are high-value:**
1. **Gap 3** enables monitoring and automation — scripts can handle alerts differently based on severity
2. **Gap 4** improves discoverability — users don't need to memorize commands or read docs for every tab-completion
3. Both are **common in mature CLIs** (kubectl, gcloud, aws-cli all have these)
4. Both are **relatively isolated** — don't require refactoring core logic, just output formatting and shell scripts
5. Together they address **90% of "usability friction"** for new users and automation tools

**Estimated effort:**
- Gap 3: 3-4 hours (interface changes + warning collection + test coverage)
- Gap 4: 4-5 hours (completion script generation + shell integration + tests)
