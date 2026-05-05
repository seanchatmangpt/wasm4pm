# WIP Status Dashboard

**Last Updated:** 2026-04-11 (automatic updates on every commit)

> Work-In-Progress (WIP) limits enforce Toyota Production System (TPS) principles: prevent context thrashing, ensure serial task completion, maintain sustainable pace.

---

## Quick Status

| Metric | Value | Status |
|--------|-------|--------|
| **Max Concurrent PRs** | 3 | ✅ |
| **Your Open PRs** | — | (Updated by CI) |
| **WIP Limit Usage** | —% | (Updated by CI) |
| **Oldest PR Age** | — hours | (Updated by CI) |

---

## Configuration

See [`.pictl/wip-config.json`](.pictl/wip-config.json) for full settings.

| Setting | Value | Purpose |
|---------|-------|---------|
| `max_concurrent_prs` | 3 | Maximum open PRs per developer |
| `max_review_hours` | 24 | Time before PR marked stale |
| `escalation_hours` | 48 | Time before escalation required |
| `merge_block_hours` | 72 | Time before merge blocked |

---

## Status Checks

### Local (Pre-Push)
Runs automatically before `git push`:

```bash
$ git push origin feature/my-feature

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WIP Limit Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User: seanchatmangpt
  Repo: seanchatmangpt/pictl
  Open PRs: 2 / 3

  ✅ WIP limit check passed
  2 open PRs (limit: 3)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Exit codes:
- **0**: WIP limit OK, proceed with push
- **1**: WIP limit exceeded, push blocked

### GitHub Actions (PR Open)
Runs when PR is opened or marked ready for review:

```yaml
Job: check-wip-limit
  ✅ WIP limit check passed: 2/3 PRs
  PR #123 can proceed
```

Fails if user has >3 open PRs (blocks merge).

### GitHub Actions (Hourly Staleness Check)
Runs every hour, processes all open PRs:

| Age | Action | Label | Comment |
|-----|--------|-------|---------|
| <24h | None | — | — |
| 24-48h | Label | ⏳ stale | "Please review or provide update" |
| 48-72h | Escalate | ⏰ escalation | "Merge/close required within 24h" |
| >72h | Block | 🚫 merge-blocked | "Decision required to merge" |

---

## Typical Workflow

### Day 1: Open PR
```
$ git push origin feat/agent-healing
  ✅ WIP check: 2/3 PRs (you have 1 slot)
  PR #456 opened
```

### Day 1-2: In Review
```
GitHub Actions: ✅ No action (PR age <24h)
```

### Day 2-3: Stale Label Added
```
GitHub Actions: ⏳ Added label "⏳-stale"
Comment: "PR in review 24h+. Please review or provide update."
```

### Day 2-4: Escalation
```
GitHub Actions: ⏰ Escalation comment
"PR in review 48h+. Merge or close within 24h (target: 72h limit)"
```

### Day 3+: Merge Blocked
```
GitHub Actions: 🚫 Comment & label "merge-blocked"
You must obtain decision to proceed beyond 72h
```

### Resolution: Merge or Close
```
$ git pull origin main --rebase
$ git push origin feat/agent-healing
  ✅ WIP check: 1/3 PRs (after merge)
  PR #456 merged
```

---

## Troubleshooting

### "WIP LIMIT EXCEEDED" — Can't Push

**Problem:** You have 3+ open PRs

**Fix:**
1. Check your open PRs: `gh pr list --author @me --state open`
2. Merge or close one PR
3. Try push again

```bash
# List your open PRs
gh pr list --author @me --state open

# Merge a PR (if approved)
gh pr merge 123

# Close a PR (if no longer needed)
gh pr close 456 --delete-branch

# Try push again
git push origin <branch>
```

### Hook Not Running

**Problem:** Pre-push hook doesn't run

**Fix:** Install hooks:
```bash
bash .claude/scripts/setup-hooks.sh
```

Verify:
```bash
ls -la .git/hooks/pre-push
# Should be executable (-rwxr-xr-x)
```

### Can't Merge PR (>72h)

**Problem:** PR is merge-blocked due to staleness

**Fix:**
1. Request explicit decision from reviewer (use @mention)
2. Or close the PR if no longer needed
3. GitHub Actions will unblock once decision is made or PR is closed

---

## Philosophy: Why WIP Limits?

**Toyota Production System (TPS):**
- Context switching = waste (muda)
- Finishing one thing well > Starting many things
- Sustainable pace > Hero mode
- Visible defects = opportunity to improve

**In Software:**
- Each PR in review = context switch cost
- Limit to 3 ensures focus on getting things merged
- 24-72 hour window = enough time for review + feedback
- No infinite review loops

See [`CLAUDE.md`](../../CLAUDE.md) (Toyota Production System section) for full philosophy.

---

## Configuration: How to Adjust Limits

Edit `.pictl/wip-config.json`:

```json
{
  "max_concurrent_prs": 3,           // Change to enforce different limit
  "max_review_hours": 24,            // Change to extend review window
  "escalation_hours": 48,            // Change escalation threshold
  "merge_block_hours": 72,           // Change merge-block threshold
  "auto_label_stale": true,          // Disable auto-labeling if desired
  "auto_comment_escalation": true,   // Disable auto-comments if desired
  "exclude_labels": [...]            // Add labels to skip (e.g., "blocked")
}
```

After editing, commit and push:
```bash
git add .pictl/wip-config.json
git commit -m "config(wip): adjust limits to max 5 concurrent PRs"
git push origin <branch>
```

Changes take effect immediately on next check (local hook or GitHub Actions).

---

## Metrics & Reporting

### Weekly WIP Metrics

Track in your team's metrics dashboard:

| Metric | Formula | Target |
|--------|---------|--------|
| **Avg PRs Open** | Sum(open_prs) / days | <2 per dev |
| **Avg Review Time** | Sum(merge_date - created_date) / count | <24h |
| **% Stale PRs** | stale_count / total_count | <10% |
| **% Escalations** | escalation_count / total_count | <5% |
| **% Merge-Blocked** | blocked_count / total_count | 0% |

**Kaizen (Continuous Improvement):**
- If avg review time >24h, increase reviewer bandwidth
- If escalations >5%, improve communication on blockers
- If merge-blocked >0%, identify and remove blocking issues

---

## See Also

- [`.pictl/wip-config.json`](.pictl/wip-config.json) — WIP configuration
- [`.claude/hooks/wip-check.sh`](../.claude/hooks/wip-check.sh) — Local pre-push hook
- [`.github/workflows/wip-check.yml`](../../.github/workflows/wip-check.yml) — GitHub Actions WIP limit
- [`.github/workflows/pr-staleness.yml`](../../.github/workflows/pr-staleness.yml) — Hourly staleness detection
- [`CLAUDE.md`](../../CLAUDE.md) (Toyota Production System section) — Philosophy & principles
