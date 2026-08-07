#!/usr/bin/env python3
"""Repair mask admission and Bloom indexing laws."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"PATCH_ADMISSION_REFUSED {path}: expected one match, observed {count}"
        )
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


branchless = "wasm4pm/src/branchless.rs"
replace_once(
    branchless,
    "        bcinr::mask::select_u64(condition, true_val, false_val)\n",
    "        let mask = 0u64.wrapping_sub((condition != 0) as u64);\n"
    "        bcinr::mask::select_u64(mask, true_val, false_val)\n",
)
replace_once(
    branchless,
    "        bcinr::mask::select_u32(condition, true_val, false_val)\n",
    "        let mask = 0u32.wrapping_sub((condition != 0) as u32);\n"
    "        bcinr::mask::select_u32(mask, true_val, false_val)\n",
)
replace_once(
    branchless,
    '''    #[test]
    fn test_select_u64_false() {
''',
    '''    #[test]
    fn test_select_u64_normalizes_any_nonzero_condition() {
        assert_eq!(select_u64(7, 42, 0), 42);
        assert_eq!(select_u64(u64::MAX, 42, 0), 42);
    }

    #[test]
    fn test_select_u64_false() {
''',
)
replace_once(
    branchless,
    '''    #[test]
    fn test_select_u32_false() {
''',
    '''    #[test]
    fn test_select_u32_normalizes_any_nonzero_condition() {
        assert_eq!(select_u32(7, 42, 0), 42);
        assert_eq!(select_u32(u32::MAX, 42, 0), 42);
    }

    #[test]
    fn test_select_u32_false() {
''',
)

bloom = "wasm4pm/src/probabilistic/bloom.rs"
replace_once(
    bloom,
    '''            #[cfg(feature = "bcinr")]
            {
                // Ensure word bounds in a branchless way
                let word =
                    bcinr::mask::select_u64((word < Self::WORDS) as u64, word as u64, 0) as usize;
                self.bits[word] |= 1u64 << bit_in_word;
            }
            #[cfg(not(feature = "bcinr"))]
            {
                if word < Self::WORDS {
                    self.bits[word] |= 1u64 << bit_in_word;
                }
            }
''',
    '''            debug_assert!(word < Self::WORDS);
            self.bits[word] |= 1u64 << bit_in_word;
''',
)

changed = [branchless, bloom]
subprocess.run(["rustfmt", *changed], cwd=ROOT, check=True)
subprocess.run(["git", "diff", "--check", "--", *changed], cwd=ROOT, check=True)
print("\n".join(changed))
