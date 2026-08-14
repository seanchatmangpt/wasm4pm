
# QA Procedure: Hello World Print

## Story

- Story ID: `hello-world-print`
- Story artifact: `stories/hello-world-print.feature`

## Scope

Verify the program's user-visible output for the approved story. The only required behavior is that running the program prints exactly: "hello world."

## Preconditions

- The program is available in the form a user is expected to run.
- No command-line options, prompts, or setup inputs are required for this story.
- The QA environment can capture the full text output produced by the program.

## Procedure

1. Start output capture using the normal QA mechanism for the program's user interface.
2. Run the program exactly as a user would run it, without adding command-line options or entering any input.
3. Wait for the program to finish producing output.
4. Compare the complete captured output to the expected text: "hello world."

## Pass Criteria

- The captured output is exactly `hello world.`
- There is no prompt, label, banner, explanation, diagnostic text, or other additional output before or after `hello world.`
- The output contains no extra words, punctuation, spaces, or blank lines.
- The program does not require user input to produce the output.

## Fail Criteria

- The program produces no output.
- The program produces text other than exactly `hello world.`
- The program adds any prompt, label, explanatory text, or diagnostic output.
- The program requires command-line options or interactive input for this story.
