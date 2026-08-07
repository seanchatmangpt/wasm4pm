#!/usr/bin/env python3
"""Fence global cache witnesses so cache_clear cannot erase a peer test's fixture."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = "wasm4pm/src/cache.rs"


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
    '''mod tests {
    use super::*;
''',
    '''mod tests {
    use super::*;

    /// Tests below share process-global caches. Unique keys prevent key
    /// collisions, but only this fence prevents `cache_clear()` from deleting
    /// another witness between its insert and read.
    static CACHE_TEST_FENCE: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
''',
)
for name in (
    "test_cache_clear",
    "test_columnar_cache_roundtrip",
    "test_interner_cache_shared",
):
    replace_once(
        f'''    fn {name}() {{
''',
        f'''    fn {name}() {{
        let _fence = CACHE_TEST_FENCE.lock().expect("cache test fence poisoned");
''',
    )

subprocess.run(["rustfmt", PATH], cwd=ROOT, check=True)
subprocess.run(["git", "diff", "--check", "--", PATH], cwd=ROOT, check=True)
print(PATH)
