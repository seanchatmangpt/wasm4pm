
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
