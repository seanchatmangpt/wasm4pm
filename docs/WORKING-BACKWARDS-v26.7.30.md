# Working Backwards: wasm4pm v26.7.30

> **This is a target, not an announcement.** Working backwards means writing the press release
> for the finished thing *first*, then deriving what must be true to ship it. Nothing below is
> true today. Section 9 is the honest gap between here and there, and it is the useful part.
>
> Quotes are role-labeled and illustrative. No real person is quoted.

---

## PRESS RELEASE

### wasm4pm 26.7.30: process mining that shows its work

**A process-mining engine where every number comes with a proof and a receipt — so you can check
the result without reading the code.**

Process mining tells you how work actually flows through an organization: where cases stall, which
paths people really take, how far reality has drifted from the official process. The field has
good tools. What it has never had is a tool that can *prove* its own arithmetic.

wasm4pm 26.7.30 changes that. Every metric it reports — fitness, precision, simplicity — is
defined once, as a formula you can read in one line, and that formula is checked by a proof
assistant before the software ships. Every run emits a receipt: what went in, what came out, and
the exact version of everything involved. Re-run it a year later and you can confirm you got the
same answer for the same reason.

### The problem

If a process-mining tool tells you a model has 87% fitness, you have two options: trust it, or
read the source code.

For most people the second option isn't real. The arithmetic is buried in tens of thousands of
lines. Even for engineers, "read the source" doesn't scale — and it doesn't help when the same
metric is implemented in several places that quietly disagree.

That is not a hypothetical failure. In this codebase, an audit found **twelve separate
implementations of "fitness"** and **thirty-one implementations of eight metrics**, with tests
written to assert that some of them *differ*. The team had adapted to the drift instead of
removing it.

So the honest state of the art is: you get a number, and you take it on faith.

### The solution

wasm4pm inverts where the truth lives.

Each metric is declared once, in a form a non-programmer can read:

> fitness = ½ × (1 − missing ÷ consumed) + ½ × (1 − remaining ÷ produced)

That single declaration does four jobs at once. It generates the code that computes the metric —
so there is exactly one implementation, and drift is impossible rather than merely discouraged.
It carries the citation to the paper it came from. It is checked by a proof assistant, which
confirms the formula stays within its stated bounds. And it produces the test that checks the
running code against the published value.

The result: **you can audit the whole claim by reading one line of mathematics.** You never need
to read the implementation, because the implementation is not written by a person.

### What's new in 26.7.30

- **One definition per metric.** Every quality metric now has a single declared formula. The
  duplicate implementations are gone.
- **Machine-checked bounds.** Each metric formula is verified by a proof assistant before release.
  A metric that could report a value outside its valid range does not ship.
- **Receipts on every run.** Each result records its inputs, outputs, and the versions of every
  component involved, chained so that tampering is detectable.
- **Published-value tests.** For each algorithm with a published benchmark, the software asserts
  it reproduces the number from the paper — and separately asserts the number was *computed*, not
  pasted in.
- **Cited by construction.** Every algorithm carries its source citation as data, so the
  documentation, the reference tables, and the tests all draw from the same place.

### Quotes

*[Illustrative — role-labeled, not real attributions.]*

**Process-mining researcher:** "I can check the formula against the paper in about thirty seconds.
With every other tool I've used, verifying a metric meant reading someone's loop and hoping I
understood their edge cases."

**Compliance analyst:** "The receipt is the part that matters to me. When someone asks in six
months why we concluded what we concluded, I can show them exactly what ran."

**System owner:** "I don't read the implementation language this is written in. That used to mean
I couldn't verify my own system. Now the part I need to check is the part I can read."

### Getting started

```
wpm mining discover --algo dfg --log examples/purchasing.xes
wpm receipt show
```

The first command discovers a process model. The second shows the receipt for what just happened.

---

## WORKING BACKWARDS: WHAT MUST BE TRUE

The press release above describes a state that does not exist. Here is the gap, honestly.

### Currently false

| Claim in the release | Reality today |
|---|---|
| "One definition per metric" | 31 implementations of 8 metrics; 12 of `fitness` alone |
| "Every run emits a receipt" | Receipt machinery exists; not universal, not chained across all surfaces |
| "Cited by construction" | Citations exist as data for 60 algorithms — but a second repo says 65, and they disagree |
| "The implementation is not written by a person" | 0.18% of the code is generated today |
| "Published-value tests for each algorithm" | Citation pointers exist for 8 of 60 algorithms |
| "Machine-checked bounds on every metric" | A bounds law exists but is written in a form the engine cannot use, so nothing enforces it |

### Also currently true, and blocking

- The code generator **does not run**. It fails immediately and produces nothing.
- The test suite has **two failures**, both from hand-typed checksums going stale when a file was
  correctly regenerated.
- Running the generator once **silently deleted 146 lines** of finished, machine-verified
  mathematics, because that work had been written into a generated file instead of into the source
  of truth. It was recovered.

### The shortest path to making the release true

1. **Fix the generator.** One category of configuration change: load its queries from files rather
   than from a package. Package-sourced queries were never implemented and never will be. Two
   sibling projects already do it the working way.
2. **Turn on edit protection.** One setting converts a hand-edit to a generated file from silent
   data loss into a refusal. This is the cheapest high-leverage change available and should land
   before anything else, because it protects everything after it.
3. **Do `fitness` end to end, and only `fitness`.** One declared formula → one generated
   implementation → one gate that refuses bad input → one receipt. This is the minimum system that
   demonstrates the entire press release. It also removes the worst duplication in the codebase.
4. **Settle the algorithm count.** 60 or 65. Then make the count derived rather than typed, so it
   cannot disagree with itself again.
5. **Give the bounds law a usable form.** The current one can only describe fixed constants, which
   is why runtime-computed metrics escape it entirely.

Only then widen to the remaining metrics, then to the algorithms.

### What the release will still not claim

Even when true, this does not claim the software is *correct*. It claims something narrower and
checkable: the formula is stated once, it is verified against its stated bounds, the code is
generated from it rather than written beside it, and every run is reproducible. A wrong formula,
declared once and proven within its bounds, is still wrong — it is just wrong in one place, in
public, where you can see it.

That is a real improvement over wrong in twelve places where nobody can.

### On the version number

Versioning here is calendar-based: `26.7.30` means 2026, July, day 30 — today. If this ships
today, the gap list above is the release checklist and it is not close. Treat `26.7.30` as the
label on the target, and let the real release take whatever date it earns.
