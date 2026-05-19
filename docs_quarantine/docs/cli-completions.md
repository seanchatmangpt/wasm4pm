# wpm Shell Completions

`wpm` ships tab-completion scripts for bash, zsh, and fish.
The `wpm completions <shell>` command prints the script for your shell so you can
pipe it directly into the right location.

## What gets completed

- All 24 top-level commands: `run`, `compare`, `diff`, `watch`, `predict`,
  `drift-watch`, `ml`, `powl`, `quality`, `conformance`, `validate`, `simulate`,
  `temporal`, `social`, `autoprocess`, `status`, `doctor`, `explain`, `init`,
  `results`, `swarm`, `agent`, `cognition`, `completions`
- Subcommand verbs for `cognition` (8 verbs), `powl` (9 verbs), `ml` (6 tasks),
  `predict` (6 tasks), `agent` (5 subcommands), `swarm` (3 subcommands)
- Flag arguments: `--format` (human/json/sarif/jsonl), `--algorithm` (15 algorithms),
  `--profile` (fast/balanced/quality/stream), `--method` (token-replay/alignments),
  `--level` (brief/detailed/academic), and more
- File arguments: `*.xes` and `*.json` for `--input`, `--model`, and positional log paths

## bash

Source the script in your current session:

```bash
source <(wpm completions bash)
```

Install system-wide (requires root):

```bash
wpm completions bash > /etc/bash_completion.d/wpm
```

Install per-user (no root required):

```bash
mkdir -p ~/.local/share/bash-completion/completions
wpm completions bash > ~/.local/share/bash-completion/completions/wpm
```

Add to `~/.bashrc` for permanent activation:

```bash
# wpm completions
source <(wpm completions bash)
```

Reload your shell or run `source ~/.bashrc`.

## zsh

Install into your fpath and regenerate the completion cache:

```bash
wpm completions zsh > "${fpath[1]}/_wpm"
compinit
```

For a per-user install without root:

```bash
mkdir -p ~/.zsh/completions
wpm completions zsh > ~/.zsh/completions/_wpm
# Add to ~/.zshrc if not already there:
echo 'fpath=(~/.zsh/completions $fpath)' >> ~/.zshrc
echo 'autoload -Uz compinit && compinit' >> ~/.zshrc
```

Reload: `exec zsh`

## fish

```bash
wpm completions fish > ~/.config/fish/completions/wpm.fish
```

Fish loads completions from this directory automatically on the next shell start
or after running `exec fish`.

## Verifying the installation

After installation, open a new shell and type:

```
wpm <TAB>
```

You should see the full list of commands. Then try:

```
wpm cognition <TAB>
```

You should see the 8 cognition verbs: `run`, `explain`, `verify`, `receipt`,
`adversarial`, `replay`, `plan`, `inspect`.

## Updating

Re-run the install command after upgrading wpm. The scripts are embedded in
the installed package and are always current with the CLI version.
