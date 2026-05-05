# WIP (Work-In-Progress) Limits Implementation

**Version:** 1.0  
**Last Updated:** 2026-04-11  
**Status:** ✅ Complete

This document describes the WIP limit and PR staleness detection system for pictl, implementing Toyota Production System (TPS) principles to prevent context thrashing and ensure serial task completion.

---

## Overview

The WIP system consists of three layers:

1. **Local (Pre-Push Hook)** — Prevents pushing if user exceeds WIP limit
2. **PR Open Gate (GitHub Actions)** — Rejects PR if user exceeds WIP limit at open time
3. **Hourly Staleness Detector (GitHub Actions)** — Labels, escalates, and blocks stale PRs

---

## Architecture

```
Developer Push
    ↓
Local Pre-Push Hook (.git/hooks/pre-push)
    ↓ (calls)
.claude/hooks/wip-check.sh
    ├─ Queries: gh pr list --author $USER --state open
    ├─ Compares: $OPEN_PRS vs max_concurrent_prs (3)
    ├─ Exit 0: OK to push
    └─ Exit 1: Block push (display message)

PR Opened / Ready for Review
    ↓
GitHub Actions: wip-check.yml
    ├─ Trigger: PR opened, ready_for_review, synchronize
    ├─ Load: .pictl/wip-config.json
    ├─ Query: gh pr list --author $AUTHOR --state open
    ├─ Compare: $OPEN_PRS vs max_concurrent_prs
    ├─ Action: Comment + Label if exceeded
    └─ Exit 1: Block merge (fail workflow)

Every Hour (Cron: 0 * * * *)
    ↓
GitHub Actions: pr-staleness.yml
    ├─ Fetch: All open PRs with timestamps
    ├─ Calculate: hours_in_review = now - created_at
    ├─ Actions:
    │   ├─ 24-48h: Add label "⏳-stale"
    │   ├─ 48-72h: Add label "⏰-escalation" + comment
    │   └─ >72h: Add label "🚫-merge-blocked" + comment
    └─ Exit 0: Report summary
```

---

## Files Created

| File | Purpose | Type |
|------|---------|------|
| `.pictl/wip-config.json` | Configuration (max_concurrent_prs, thresholds, etc.) | Config |
| `.pictl/wip-status.md` | Dashboard showing current WIP status | Dashboard |
| `.pictl/WIP-IMPLEMENTATION.md` | This document | Documentation |
| `.github/workflows/wip-check.yml` | PR open gate (GitHub Actions) | Workflow |
| `.github/workflows/pr-staleness.yml` | Hourly staleness detector | Workflow |
| `.claude/hooks/wip-check.sh` | Local pre-push hook logic | Script |
| `.claude/scripts/setup-hooks.sh` | Hook installation script | Setup |

---

## Configuration

### `.pictl/wip-config.json`

```json
{
  "max_concurrent_prs": 3,
  "max_review_hours": 24,
  "escalation_hours": 48,
  "merge_block_hours": 72,
  "enabled": true,
  "check_interval_minutes": 60,
  "wip_prefix": "WIP:",
  "auto_label_stale": true,
  "auto_comment_escalation": true,
  "notify_on_limit": true,
  "exclude_drafts": true,
  "exclude_labels": ["blocked", "dependencies", "waiting-on-external"]
}
```

**Key Fields:**
- `max_concurrent_prs` — Hard limit on open PRs per user (prevents thrashing)
- `max_review_hours` — Time before label "⏳-stale" added (24 hours)
- `escalation_hours` — Time before escalation comment (48 hours)
- `merge_block_hours` — Time before merge blocked (72 hours)
- `enabled` — Global kill switch
- `auto_label_stale` — Automatically add stale label
- `auto_comment_escalation` — Automatically post escalation comments
- `exclude_drafts` — Don't count draft PRs toward limit
- `exclude_labels` — Exclude PRs with certain labels (e.g., "blocked") from staleness checks

---

## Installation

### 1. Install Local Git Hooks

```bash
# From repo root
bash .claude/scripts/setup-hooks.sh
```

This creates `.git/hooks/pre-push` with WIP limit check.

### 2. Verify Hooks Installed

```bash
ls -la .git/hooks/pre-push
# Should show: -rwxr-xr-x (executable)
```

### 3. Test Locally

```bash
# Try to push (will run pre-push hook)
git push origin feature/test-branch

# If you have <3 open PRs: push proceeds
# If you have ≥3 open PRs: push blocked with message
```

---

## Usage

### Local Pre-Push Check

Runs automatically when you `git push`:

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

Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 8 threads
Sending data to GitHub...
...
```

**Exit Codes:**
- **0** — OK, push proceeds
- **1** — WIP limit exceeded, push blocked

### Manual WIP Check (Without Push)

```bash
# Run the check directly
bash .claude/hooks/wip-check.sh

# Output shows current WIP status
```

### GitHub Actions: PR Open Gate

When you open a PR or mark it ready for review:

1. **GitHub Actions workflow runs** (`.github/workflows/wip-check.yml`)
2. **Queries your open PRs** (via `gh pr list`)
3. **If you have >3 open PRs:**
   - Posts comment: "⚠️ WIP Limit Exceeded — You have N open PRs (limit: 3)"
   - Fails workflow (blocks merge)
4. **If you have ≤3 open PRs:**
   - Posts comment: "✅ WIP limit check passed"
   - Allows workflow to proceed

### GitHub Actions: Hourly Staleness Check

Every hour, the staleness detector processes all open PRs:

**24-48 hours in review:**
- Adds label: `⏳-stale`
- (Optional) Posts comment: "This PR has been in review 24h+. Please review or provide update."

**48-72 hours in review:**
- Adds label: `⏰-escalation`
- Posts comment: "Escalation: PR in review 48h+. Merge or close within 24h."

**>72 hours in review:**
- Adds label: `🚫-merge-blocked`
- Posts comment: "Merge blocked: PR in review >72h. Requires explicit decision."
- **Prevents merge** until label removed

---

## Workflows

### Workflow 1: Normal PR Lifecycle (Gets Merged in <24h)

```
Day 0, 10:00 AM
  ├─ Developer: git push origin feat/my-feature
  │   └─ Pre-push hook: ✅ WIP check (1/3 PRs)
  ├─ GitHub: PR #456 opened
  │   └─ Actions: ✅ WIP limit OK (1/3 PRs)
  └─ Notification: @reviewer please review

Day 0, 2:00 PM
  ├─ Reviewer: approves PR #456
  └─ Developer: merges PR #456
     └─ Pre-push hook: ✅ WIP check (0/3 PRs after merge)
```

**Result:** No stale labels, clean merge.

---

### Workflow 2: PR Needs Review Attention (Gets Stale)

```
Day 0, 10:00 AM
  ├─ Developer: opens PR #457
  └─ No reviewer available

Day 1, 10:00 AM (24h elapsed)
  ├─ Hourly staleness check runs
  ├─ Label added: ⏳-stale
  └─ Comment posted: "PR in review 24h+. Please review or update."

Day 2, 10:00 AM (48h elapsed)
  ├─ Hourly staleness check runs
  ├─ Label added: ⏰-escalation
  └─ Comment posted: "Escalation: Merge or close within 24h (target 72h)."

Day 3, 10:00 AM (72h elapsed)
  ├─ Hourly staleness check runs
  ├─ Label added: 🚫-merge-blocked
  ├─ Comment posted: "Merge blocked: Requires explicit decision."
  └─ **Merge prevented until label removed**

Day 3, 2:00 PM
  ├─ Developer: pins reviewer, provides update
  └─ Reviewer: approves
  └─ Label 🚫-merge-blocked is removed manually or automatically
  └─ PR merges successfully
```

**Result:** Labels track escalation, comment history documents delays.

---

### Workflow 3: WIP Limit Exceeded

```
Scenario: Developer has 3 open PRs (at limit), tries to open 4th

Day 1, 10:00 AM
  ├─ Developer: git push origin feat/agent-4
  │   └─ Pre-push hook: ❌ BLOCKED (3/3 PRs already open)
  │
  ├─ Message displayed:
  │   "❌ WIP LIMIT EXCEEDED
  │    You have 3 open PRs (max: 3).
  │    Merge an existing PR first."
  │
  └─ Push rejected (exit 1)

Developer's action:
  1. git merge PR #1 (merge existing PR)
  2. git push origin feat/agent-4 (retry)
     └─ Pre-push hook: ✅ OK (2/3 PRs now)
     └─ Push succeeds

Developer can also verify before pushing:
  bash .claude/hooks/wip-check.sh
  # Shows: 3/3 PRs, ❌ BLOCKED
```

**Result:** Forces serial task completion before starting new work.

---

## Troubleshooting

### Issue: "gh: command not found"

**Cause:** GitHub CLI not installed

**Fix:**
```bash
# macOS
brew install gh

# Ubuntu/Linux
sudo apt-get install gh

# Verify
gh --version
gh auth status
```

### Issue: Pre-push hook doesn't run

**Cause:** Hook not installed or not executable

**Fix:**
```bash
# Reinstall hooks
bash .claude/scripts/setup-hooks.sh

# Verify
ls -la .git/hooks/pre-push
# Must show: -rwxr-xr-x (executable)

chmod +x .git/hooks/pre-push  # If needed
```

### Issue: Hook gives authentication error

**Cause:** GitHub CLI not authenticated

**Fix:**
```bash
gh auth login

# Follow prompts:
# 1. Select: GitHub.com
# 2. Select: HTTPS
# 3. Authenticate with browser
```

### Issue: Can't bypass WIP limit

**Wrong approach:**
```bash
# DON'T do this:
git push origin feature --no-verify  # Bypasses hooks (not recommended)
```

**Correct approach:**
```bash
# First, merge an open PR to free up a slot
gh pr merge 123  # Merge existing PR

# Then push
git push origin feature  # Pre-push hook: ✅ OK
```

### Issue: "merge_block_hours" not blocking merge

**Cause:** Label `🚫-merge-blocked` exists but merge not blocked in GitHub UI

**Fix:** Add branch protection rule:

In GitHub repo settings → Branches → Add rule:
- Pattern: `main` (or your main branch)
- Require status checks: ✅
- Include: "WIP Limit Check" (if using actions to block)
- Require PRs with review: ✅ (requires human review to override)

---

## Metrics & Monitoring

### Weekly WIP Report

Track these metrics to measure system health:

| Metric | Target | How to Calculate |
|--------|--------|------------------|
| **Avg Open PRs** | <2 per dev | Sum(daily_open_count) / 7 days |
| **Avg Merge Time** | <24 hours | Sum(merge_date - created_date) / count |
| **% Stale PRs** | <10% | stale_labeled_count / total_count |
| **% Escalations** | <5% | escalation_labeled_count / total_count |
| **% Merge-Blocked** | 0% | blocked_labeled_count / total_count |

### Query GitHub for Metrics

```bash
# Count stale PRs (labeled with ⏳-stale)
gh pr list --state closed --search "label:⏳-stale" --repo seanchatmangpt/pictl | wc -l

# Count escalations (labeled with ⏰-escalation)
gh pr list --state closed --search "label:⏰-escalation" --repo seanchatmangpt/pictl | wc -l

# Average time in review (requires parsing timestamps)
gh pr list --state closed --limit 20 --json createdAt,mergedAt,number
```

---

## Configuration Tuning

### Scenario 1: Team is Too Conservative (WIP limit too low)

**Problem:** 3 PR limit is causing developers to context-switch waiting for reviews

**Solution:** Increase to 4 or 5 PRs

```json
{
  "max_concurrent_prs": 5,  // Increased from 3
  "max_review_hours": 24,
  "escalation_hours": 48,
  "merge_block_hours": 72
}
```

### Scenario 2: PRs Stay in Review Too Long

**Problem:** Reviewers are slow, 72h merge-block is being reached frequently

**Solution:** Decrease escalation/block thresholds OR improve reviewer bandwidth

**Option A: Tighten thresholds**
```json
{
  "max_concurrent_prs": 3,
  "max_review_hours": 12,    // Reduced from 24
  "escalation_hours": 24,    // Reduced from 48
  "merge_block_hours": 48    // Reduced from 72
}
```

**Option B: Improve reviewer bandwidth**
- Add more reviewers (assign multiple reviewers)
- Rotate reviewer on-call duty
- Block time for code review

### Scenario 3: False Positives (WIP check blocks legitimate work)

**Problem:** Developer has blocked PR (e.g., "waiting on external dependencies"), but WIP check counts it

**Solution:** Exclude PRs with certain labels

```json
{
  "max_concurrent_prs": 3,
  "exclude_labels": ["blocked", "dependencies", "waiting-external", "RFC"]
}
```

Then tag blocked PR:
```bash
gh pr edit 456 --add-label "blocked"
# Now PR doesn't count toward WIP limit
```

---

## Integration with CI/CD

### Before Merge

The following checks should pass:

1. ✅ **Local pre-push hook** passes (WIP limit OK)
2. ✅ **GitHub Actions: wip-check.yml** passes (WIP limit OK at PR open)
3. ✅ **Tests pass** (unit, integration, smoke)
4. ✅ **Code review approved** (human review)
5. ✅ **Status checks green** (linting, type-check, build)
6. ✅ **PR not stale** (no `🚫-merge-blocked` label)

### CI Workflow Example

```yaml
# .github/workflows/test.yml (example)
on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
      - run: npm run build
      # ... other checks ...

  merge-gates:
    needs: test
    if: success()
    runs-on: ubuntu-latest
    steps:
      - name: Check PR not stale
        run: |
          if gh pr view --json labels | grep -q "merge-blocked"; then
            echo "❌ PR is merge-blocked (stale)"
            exit 1
          fi
```

---

## Philosophy: Why WIP Limits?

Extracted from `CLAUDE.md` (Toyota Production System section):

### The Problem

**Context Switching = Waste (Muda)**
- Each PR in review = context switch
- Developer A opens PR → waits for review → opens PR2 while waiting
- Reviewer context-switches between A1 and A2
- A1 and A2 accumulate in review → A1 merges after 3 days

### The Solution

**WIP Limits enforce focus:**
1. Max 3 concurrent PRs = max 3 pending reviews
2. Once one merges, dev can open another
3. Steady state: always 1-2 PRs in flight (not 10)
4. Reviewer: clear priority on oldest PR first

### Benefits

| Benefit | How WIP Helps |
|---------|---------------|
| **Faster feedback loops** | Review old PR first, unblock dev faster |
| **Lower defect cost** | Small batches → easier to test → fewer bugs |
| **Sustainable pace** | No context thrashing → focus → quality |
| **Observable quality** | Stale label = signal to improve review process |

---

## Maintenance

### Update Configuration

Edit `.pictl/wip-config.json` and commit:

```bash
git add .pictl/wip-config.json
git commit -m "config(wip): increase max_concurrent_prs to 5"
git push origin main
```

Changes take effect immediately on next check.

### Update Workflows

Edit `.github/workflows/wip-check.yml` or `pr-staleness.yml`:

```bash
git add .github/workflows/wip-check.yml
git commit -m "ci(wip): add slack notification on escalation"
git push origin main
```

Changes take effect on next PR/schedule trigger.

### Add Exclusions

To exclude a PR from WIP count, add label:

```bash
gh pr edit 456 --add-label "blocked"
# Now PR doesn't count toward max_concurrent_prs
```

To exclude a PR from staleness checks:

```bash
gh pr edit 456 --add-label "dependencies"
# Now stale labels won't be applied
```

---

## FAQ

**Q: What if I have an emergency PR that needs to bypass WIP limit?**

A: Mark it with a label and exclude that label:
```bash
gh pr edit 999 --add-label "hotfix"
# Then update .pictl/wip-config.json:
"exclude_labels": ["blocked", "hotfix"]
```

**Q: Can I merge a PR with 🚫-merge-blocked label?**

A: Yes, but it requires:
1. Remove the label manually: `gh pr edit 456 --remove-label "🚫-merge-blocked"`
2. Or wait until the label is auto-removed (if staleness check removes it)
3. Or override via GitHub PR UI (if branch protection allows)

**Q: Why is my PR labeled "stale" but not "escalation"?**

A: Different thresholds:
- ⏳-stale: Added at 24 hours
- ⏰-escalation: Added at 48 hours
- 🚫-merge-blocked: Added at 72 hours

PR is labeled with the **highest** threshold reached.

**Q: Can I disable WIP limits entirely?**

A: Yes, set in `.pictl/wip-config.json`:
```json
{
  "enabled": false
}
```

But this defeats the purpose of the system. Better to adjust limits than disable.

---

## See Also

- `.pictl/wip-config.json` — Configuration file
- `.pictl/wip-status.md` — Dashboard template
- `.github/workflows/wip-check.yml` — PR open gate workflow
- `.github/workflows/pr-staleness.yml` — Hourly staleness detector
- `.claude/hooks/wip-check.sh` — Local pre-push hook script
- `.claude/scripts/setup-hooks.sh` — Hook installation script
- `CLAUDE.md` (Toyota Production System section) — Philosophy & principles

---

**Last Updated:** 2026-04-11  
**Status:** ✅ Complete and Operational
