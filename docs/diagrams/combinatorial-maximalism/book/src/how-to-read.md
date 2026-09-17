<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/diagrams/combinatorial-maximalism/book/src/how-to-read.md; source-sha256: badf412a479b658a85e310cafca261210cf65d4b6c7416ea8e48cc040db8bb79; reason: tooling or agent control surface -->

# How to read this pattern language

Each pattern uses the same seven-part grammar:

1. **Context** identifies the recurring situation.
2. **Problem** isolates the representational failure the diagram addresses.
3. **Forces** name tensions that must remain simultaneously true.
4. **Solution** states a reusable drawing and reasoning rule.
5. **wasm4pm case** instantiates the rule in a real architecture.
6. **Falsifier** specifies evidence that would invalidate the diagram.
7. **Neighboring patterns** identify lawful combinations.

The repeated grammar is intentional. Christopher Alexander’s pattern language works because each pattern is independently useful and also participates in a network. This book applies the same principle to architecture visualization.

## View standing

Every diagram belongs to one or more view classes:

- **Current**: supported by source-grounded relationships now.
- **Target**: an intended composition or invariant not yet fully implemented.
- **Diagnostic**: a hypothesis-generating picture, often with illustrative values.
- **Historical**: a time-ordered record requiring dated evidence.
- **Planning**: a coordination model, not runtime proof.
- **Doctrine**: a normative invariant that implementations must satisfy.

These classes are independent of Mermaid parser standing. A diagram may parse perfectly while depicting a false runtime. Conversely, a beta grammar may fail in one renderer while the underlying architecture claim remains valid.
