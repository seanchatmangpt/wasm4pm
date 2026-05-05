# WIP Limits — Quick Start Guide

**Status:** ✅ Complete. All components installed and tested.

---

## What is This?

WIP (Work-In-Progress) limits enforce **Toyota Production System (TPS)** principles in your development workflow:

- **Max 3 concurrent PRs** per developer
- **Auto-label PRs** that stay in review >24 hours
- **Escalate PRs** in review >48 hours  
- **Block merges** of PRs in review >72 hours
- **Local hook** prevents pushing when limit exceeded

---

## Installation (One-Time Setup)

```bash
# From repo root
bash .claude/scripts/setup-hooks.sh
```

This installs the pre-push hook that checks WIP limits locally.

**Verify:**
```bash
ls -la .git/hooks/pre-push
# Should show: -rwxr-xr-x (executable)
```

---

## How It Works

### 1. Local Pre-Push Hook (Instant Feedback)

When you try to push:

```bash
$ git push origin feature/my-feature

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WIP Limit Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  User: seanchatmangpt
  Open PRs: 2 / 3

  ✅ WIP limit check passed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Exit codes:**
- **0** = OK, push proceeds
- **1** = WIP limit exceeded, push blocked

### 2. GitHub Actions: PR Open Gate

When you open a PR:
- **Queries your open PRs** via GitHub API
- **Checks limit** (max 3 concurrent)
- **Blocks merge** if limit exceeded
- **Posts comment** explaining the limit

### 3. Hourly Staleness Detector

Every hour, automatic checks run:

| Age | Action |
|-----|--------|
| <24h | None |
| 24-48h | Add label `⏳-stale` |
| 48-72h | Add label `⏰-escalation` + comment |
| >72h | Add label `🚫-merge-blocked` + comment |

---

## Common Scenarios

### Scenario 1: Normal Workflow (Gets Merged in <24h)

```
Day 0, 10am
  ├─ You: git push origin feat/agent-healing
  │   └─ Hook: ✅ WIP OK (2/3 PRs)
  └─ PR #456 opens

Day 0, 2pm
  ├─ Reviewer: approves
  └─ You: merge PR #456
     └─ Hook: ✅ WIP OK (1/3 PRs after merge)
```

**Result:** Clean merge, no stale labels.

---

### Scenario 2: PR Needs Review Attention

```
Day 0, 10am
  ├─ You: open PR #457
  └─ Waiting for reviewer

Day 1, 10am (24h elapsed)
  ├─ Staleness check runs
  ├─ Label added: ⏳-stale
  └─ Comment: "PR in review 24h+. Please review or update."

Day 2, 10am (48h elapsed)
  ├─ Label added: ⏰-escalation
  └─ Comment: "Escalation: Merge or close within 24h."

Day 3, 10am (72h elapsed)
  ├─ Label added: 🚫-merge-blocked
  └─ Comment: "Merge blocked: Requires explicit decision."
```

**What you do:**
1. Pin the reviewer: `@alice please review`
2. Provide update: push a new commit
3. Once approved: merge (label auto-removes or you manually remove)

---

### Scenario 3: WIP Limit Exceeded

```
You have 3 open PRs (at limit), try to push 4th:

$ git push origin feat/agent-4
❌ WIP LIMIT EXCEEDED
   You have 3 open PRs (max: 3)
   Merge one first.
```

**What you do:**
1. Merge or close an existing PR
2. Try push again: `git push origin feat/agent-4`
3. Hook now passes: ✅ OK

**Alternative (verify before pushing):**
```bash
bash .claude/hooks/wip-check.sh
# Shows your current WIP status without pushing
```

---

## Configuration

Edit `.pictl/wip-config.json` to customize limits:

```json
{
  "max_concurrent_prs": 3,           // Change to allow more PRs
  "max_review_hours": 24,            // Hours before stale label
  "escalation_hours": 48,            // Hours before escalation
  "merge_block_hours": 72,           // Hours before merge blocked
  "enabled": true,                   // Toggle on/off
  "exclude_labels": [...]            // Skip PRs with these labels
}
```

After editing, commit and push:
```bash
git add .pictl/wip-config.json
git commit -m "config(wip): adjust limits"
git push origin <branch>
```

Changes take effect on next check.

---

## Common Issues

### "gh: command not found"

**Fix:** Install GitHub CLI
```bash
# macOS
brew install gh

# Ubuntu/Linux
sudo apt-get install gh
```

### "gh auth login" required

**Fix:** Authenticate with GitHub
```bash
gh auth login
# Follow prompts
```

### Hook doesn't run on push

**Fix:** Re-install hooks
```bash
bash .claude/scripts/setup-hooks.sh
```

### Can't bypass WIP limit

**Solution:** Merge an open PR first
```bash
gh pr merge 123  # Merge existing PR
git push origin feature  # Now hook passes
```

**Exception:** If you have a hotfix, add a label and exclude it:
```bash
gh pr edit 999 --add-label "hotfix"
# Then in .pictl/wip-config.json:
# "exclude_labels": ["blocked", "hotfix"]
```

---

## Philosophy

**Why WIP limits?**

From Toyota Production System (TPS):
- Context switching = waste
- Limit to 3 PRs = sustained focus
- Finish one thing before starting another
- Observable defects (stale label) = opportunity to improve

**What does this prevent?**
- Opening 10 PRs, merging none (thrashing)
- Reviewer context-switching between 10 PRs
- Stale PRs blocking new work
- Burnout from parallel context loading

**What does this enable?**
- Faster merge times
- Better review quality
- Sustainable pace
- Visible process improvement

---

## Documentation

- **Full Guide:** [`.pictl/WIP-IMPLEMENTATION.md`](.pictl/WIP-IMPLEMENTATION.md)
- **Dashboard:** [`.pictl/wip-status.md`](.pictl/wip-status.md)
- **Configuration:** [`.pictl/wip-config.json`](.pictl/wip-config.json)
- **TPS Philosophy:** [`.../../CLAUDE.md`](../../CLAUDE.md) (Toyota Production System section)

---

## Next Steps

1. ✅ **Install hooks** (run once):
   ```bash
   bash .claude/scripts/setup-hooks.sh
   ```

2. ✅ **Test locally:**
   ```bash
   bash .claude/hooks/wip-check.sh
   # Shows your current WIP status
   ```

3. ✅ **Push and verify:**
   ```bash
   git push origin <branch>
   # Hook runs automatically on push
   ```

4. ✅ **Check GitHub Actions:**
   - Open a PR
   - See WIP check in Actions tab
   - Staleness labels appear hourly

---

**Questions?**

See [`.pictl/WIP-IMPLEMENTATION.md`](.pictl/WIP-IMPLEMENTATION.md) for:
- Full architecture
- Detailed troubleshooting
- Integration examples
- Metrics & reporting
- FAQs

**Status:** ✅ Ready to use. All tests passing.
