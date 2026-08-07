#!/usr/bin/env python3
"""Preserve PNML text fragments across XML entity events, then trim labels once."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = "wasm4pm/src/pnml_io.rs"


def replace_once(old: str, new: str) -> None:
    target = ROOT / PATH
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"PATCH_ADMISSION_REFUSED {PATH}: expected one match, observed {count}"
        )
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "reader.config_mut().trim_text(true);",
    "reader.config_mut().trim_text(false);",
)
replace_once(
    '''                if text.is_empty() {
                    buf.clear();
                    continue;
                }
''',
    '''                if text.trim().is_empty() {
                    buf.clear();
                    continue;
                }
''',
)
replace_once(
    '''                                label: cur_place_label.clone(),
''',
    '''                                label: cur_place_label
                                    .as_deref()
                                    .map(str::trim)
                                    .filter(|label| !label.is_empty())
                                    .map(str::to_string),
''',
)
replace_once(
    '''                                label: cur_trans_label.clone(),
''',
    '''                                label: cur_trans_label
                                    .as_deref()
                                    .map(str::trim)
                                    .filter(|label| !label.is_empty())
                                    .map(str::to_string),
''',
)

subprocess.run(["rustfmt", PATH], cwd=ROOT, check=True)
subprocess.run(["git", "diff", "--check", "--", PATH], cwd=ROOT, check=True)
print(PATH)
