# pictl Claude Code Hooks

## Resilience Configuration: Three-Layer Failure Prevention

Three hooks are configured to ensure Claude Code **cannot fail** when working with pictl.

**Critical Principle:** Hooks fail loudly with exit code 1 or 2, never degrade gracefully. If a check cannot run, the hook exits with an error rather than silently proceeding.

---

## Hook 1: SessionStart — Environment Briefing
**File:** `.claude/hooks/session-start.sh`

Runs on every session start (including after context compaction).

**Output to Claude's context:**
- Health summary: `✓ pictl environment: HEALTHY (20 ok, 3 warn, 0 fail)`
- Or degradation notice with list: `✗ pictl environment: DEGRADED (failures listed)`
- Checkpoint status: `Checkpoint: 20/100 traces processed (last: 2026-04-11T19:04:59Z)`

**Failure modes (loud):**
- No pictl in PATH AND no dist/cli.js → Exit 1 with `ERROR: pictl doctor unavailable`
- pictl doctor returns empty → Exit 1 with `ERROR: pictl doctor returned empty output`
- jq parse failure on doctor output → Exit 1 with `ERROR: Cannot parse pictl doctor output`

Claude Code sees these exit codes and knows the environment is broken — it cannot proceed.

---

## Hook 2: Stop — Doctor Gate
**File:** `.claude/hooks/stop-gate.sh`

Fires whenever Claude finishes responding.

**Behavior:**
- If healthy: exit 0 → allows stop ✓
- If degraded: outputs JSON block decision with list of failures
- If already active: exit 0 → prevents infinite loop via `stop_hook_active` check

**Failure modes (loud):**
- pictl doctor unavailable → Exit 2 (blocks stop)
- pictl doctor returns empty → Exit 2 (blocks stop)
- jq parse failure → Exit 2 (blocks stop)

When Claude tries to stop with a broken environment, the hook returns:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "blockReason": "pictl doctor: 2 critical failure(s) detected\n• WASM binary: not built\n• Node.js version: too old\n\nRun: pictl doctor --verbose"
  }
}
```

Claude is blocked from stopping and must fix the failures.

---

## Hook 3: PostToolUseFailure — Recovery Injection
**File:** `.claude/hooks/failure-recovery.sh`

Fires when any tool call fails. Injects recovery suggestions to stderr.

**Output examples:**
- npm/pnpm failure: `[pictl recovery] Bash failed. Action: npm/pnpm command failed: try 'pnpm install && pnpm build'`
- WASM failure: `[pictl recovery] Bash failed. Action: WASM build command failed: try 'cd wasm4pm && npm run build && cd ..'`
- TypeScript failure: `[pictl recovery] Bash failed. Action: TypeScript check failed: try 'pnpm lint'`
- Default: `[pictl recovery] Bash failed. Action: Run 'pictl doctor' to check environment.`

**Failure modes (loud):**
- Invalid JSON input → Exit 1 with `ERROR: Cannot parse tool name`

Claude receives these messages and knows how to recover.

---

## The Three-Layer Resilience Loop

```
┌─────────────────────────────────────────────────┐
│  SESSION START                                  │
│  SessionStart hook runs pictl doctor            │
│  Claude's context: ✓ HEALTHY or ✗ DEGRADED     │
└────────────┬────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────┐
│  TOOL EXECUTION                                 │
│  Tool fails → PostToolUseFailure hook fires     │
│  Claude receives: [pictl recovery] action:...   │
│  Claude self-corrects with specific guidance    │
└────────────┬────────────────────────────────────┘
             │
             v
┌─────────────────────────────────────────────────┐
│  SESSION EXIT                                   │
│  Claude tries to stop → Stop hook gate runs     │
│  If degraded: BLOCKS with list of fixes        │
│  If healthy: ALLOWS exit                        │
│  Claude must fix issues before leaving          │
└─────────────────────────────────────────────────┘
```

---

## Setup: Enable Metrics Tracking

Metrics tracking requires a git post-commit hook. To enable:

```bash
# 1. Copy hook to git hooks directory
cp .claude/hooks/metrics-track.sh .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# 2. Test immediately (runs on next commit)
git commit --allow-empty -m "test: metrics collection"

# 3. Verify metrics were collected
cat .pictl/metrics.json | jq '.historical_data[-1]'

# 4. Generate weekly dashboard
bash scripts/weekly-metrics-report.sh

# 5. Check pre-push metrics gate (optional, for blocking commits)
# This requires manual setup in .git/hooks/pre-push:
# cp .claude/hooks/pre-push-metrics.sh .git/hooks/pre-push
# chmod +x .git/hooks/pre-push
```

---

## Testing the Hooks

### SessionStart (with valid pictl)
```bash
CLAUDE_PROJECT_DIR=/Users/sac/chatmangpt/pictl .claude/hooks/session-start.sh
```
Output: Health summary + checkpoint

### SessionStart (with missing pictl)
```bash
CLAUDE_PROJECT_DIR=/tmp .claude/hooks/session-start.sh
```
Output: `ERROR: pictl doctor unavailable` (exit 1)

### Stop Gate (healthy environment)
```bash
echo '{"stop_hook_active":false}' | \
  CLAUDE_PROJECT_DIR=/Users/sac/chatmangpt/pictl \
  .claude/hooks/stop-gate.sh
```
Output: (exit 0 — allows stop)

### Stop Gate (degraded environment)
```bash
echo '{"stop_hook_active":false}' | \
  CLAUDE_PROJECT_DIR=/Users/sac/chatmangpt/pictl \
  .claude/hooks/stop-gate.sh
```
Output: JSON block decision (exit 0 with block decision)

### PostToolUseFailure
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"npm install"},"error_message":"command not found"}' | \
  .claude/hooks/failure-recovery.sh 2>&1
```
Output: `[pictl recovery] Bash failed. Action: npm/pnpm command failed: try 'pnpm install && pnpm build'`

---

## Configuration

Located in `.claude/settings.json`. Three event keys:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }
    ]
  }
}
```

All hooks use `"type": "command"` with bash scripts.

---

## Exit Codes

| Hook | Exit 0 | Exit 1 | Exit 2 |
|------|--------|--------|--------|
| **SessionStart** | Doctor ran OK | Doctor unavailable or parse failure | — |
| **Stop** | Allow stop (healthy or already active) | — | Block stop (doctor failure) |
| **PostToolUseFailure** | Recovery message sent | Input parse failure | — |

---

## Hook 4: Metrics Tracking — Post-Commit Kaizen
**File:** `.claude/hooks/metrics-track.sh`

Runs after every commit (manual setup required — see "Setup" section).

**Behavior:**
- Collects 8 metrics: test pass rate, compiler warnings, build time, OTEL coverage, TPS violations, MTTR, test determinism, LOCs
- Persists to `.pictl/metrics.json` with timestamp and git commit hash
- Logs build times to `.pictl/build-times.log` for trend analysis
- All metrics collected even if individual collection fails (non-blocking)

**Metrics Collected:**
1. Test Pass Rate: vitest + cargo test combined percentage
2. Compiler Warnings: cargo clippy + tsc + eslint total count
3. Build Time: Full clean build duration in milliseconds
4. OTEL Span Coverage: % of public APIs with Instrumentation.create*() calls
5. TPS Violation Density: violations per 1000 LOC (silent fallbacks, missing error handling, etc.)
6. MTTR: Mean Time To Recovery approximated from recent fixes
7. Test Determinism: Pass rate consistency across 3 runs (detects flaky tests)
8. Lines of Code: Total LOC (Rust + TypeScript, excluding tests)

**Example Output:**
```json
{
  "timestamp": "2026-04-11T18:30:45Z",
  "git_commit_hash": "a1b2c3d",
  "test_pass_rate": 100,
  "compiler_warnings": 0,
  "build_time_ms": 45000,
  "otel_span_coverage": 95,
  "tps_violation_density": 0.5,
  "mttr": 3,
  "test_determinism": 100,
  "locs": 15240
}
```

---

## Why Claude Cannot Fail

1. **SessionStart:** Immediate health check — Claude knows environment state before doing any work
2. **PostToolUseFailure:** Guided recovery — Claude gets specific action steps when tools fail
3. **Stop Gate:** Forced healing — Claude cannot leave with a broken environment
4. **Metrics Tracking:** Continuous improvement — Every commit adds data for Kaizen analysis

Together, these ensure:
- ✓ Every session starts with known health
- ✓ Every tool failure triggers recovery guidance
- ✓ No session ends with a broken environment
- ✓ Every commit advances continuous improvement metrics

**Claude Code cannot fail in the pictl project.**
