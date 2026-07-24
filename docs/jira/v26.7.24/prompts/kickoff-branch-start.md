# Cloud agent prompt: kickoff — start work on a dedicated branch

Copy everything below the line into the cloud agent's task/prompt field, after it has been briefed
with `planning-and-diagramming-agent.md` (or combine both into one message if your agent runner
takes a single prompt).

---

Before doing anything else, set up your working branch:

```
cd ~/wasm4pm
git status --short          # confirm you're starting clean; if not, stop and report what you see
git checkout main
git pull --ff-only
git checkout -b docs/v26.7.24-planning-diagramming-followup
```

Do all work from `docs/jira/v26.7.24/prompts/planning-and-diagramming-agent.md` on this branch.
Stay inside the file-ownership boundary stated there (`docs/jira/v26.7.24/` and `docs/diagrams/`
only) — if you find you need to touch anything else to complete a task, stop and report why
instead of doing it.

When you're done (or you've hit a real, disclosed stopping point per that prompt's Definition of
Done):

```
git add docs/jira/v26.7.24 docs/diagrams
git status --short          # review exactly what's staged before committing
git commit -m "docs: re-verify v26.7.24 ground truth, add Eliza-ranking ADR, close diagram gaps"
git push -u origin docs/v26.7.24-planning-diagramming-followup
gh pr create --title "docs(v26.7.24): re-verified ground truth + Eliza-ranking decision" --body "<real summary of what you found/changed, per your task report>"
```

Do **not** merge the PR yourself — report the PR URL and wait for it to be reviewed and merged.

Report back:
1. The real per-file pass/fail counts from task 1 (or the real reason it couldn't complete).
2. Your ADR recommendation from task 2, in one paragraph.
3. Anything in §2/diagram citations that had actually drifted (task 3) — or confirmation nothing
   had.
4. Whether TICKET-057 is now newly-unblocked (task 4).
5. The PR URL.
