<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/jira/hello-world-print.md; source-sha256: 112cc1904a4ca9cd4e7d84b9831314e9fa806ef29b0118474e4d8ac14a690b4d; reason: tooling or agent control surface -->


# Hello World Print

- Story ID: `hello-world-print`
- Feature file: `stories/hello-world-print.feature`
- QA procedure: `stories/hello-world-print-qa-procedure.md`

## Scenario

Print the approved observable output: given the program is run, when the program is run, then the program output is exactly "<output>".

## Definition of Done

Run the QA procedure in `stories/hello-world-print-qa-procedure.md` against a real build. Done
only when every one of the following holds, verified against real captured output (not
asserted from memory):

- [ ] The captured output is exactly `hello world.`
- [ ] There is no prompt, label, banner, explanation, diagnostic text, or other additional output before or after `hello world.`
- [ ] The output contains no extra words, punctuation, spaces, or blank lines.
- [ ] The program does not require user input to produce the output.

## Known fail conditions (do not ship if any of these hold)

- The program produces no output.
- The program produces text other than exactly `hello world.`
- The program adds any prompt, label, explanatory text, or diagnostic output.
- The program requires command-line options or interactive input for this story.
