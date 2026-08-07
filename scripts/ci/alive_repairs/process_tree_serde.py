#!/usr/bin/env python3
"""Give recursive process trees a stable object-shaped serde contract."""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
PATH = "wasm4pm/src/process_tree.rs"


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
    '''#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "kind", rename_all = "snake_case"))]
pub enum ProcessTree {
''',
    '''#[derive(Debug, Clone, PartialEq)]
pub enum ProcessTree {
''',
)
replace_once(
    '''}

impl ProcessTree {
    // ── Constructors ──────────────────────────────────────────────────────
''',
    '''}

#[cfg(feature = "serde")]
impl Serialize for ProcessTree {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(tag = "kind", rename_all = "snake_case")]
        enum ProcessTreeRef<'a> {
            Leaf {
                activity: &'a Option<ActivityName>,
            },
            Operator {
                op: &'a ProcessTreeOperator,
                children: &'a [ProcessTree],
            },
        }

        match self {
            ProcessTree::Leaf(activity) => ProcessTreeRef::Leaf { activity }.serialize(serializer),
            ProcessTree::Operator { op, children } => ProcessTreeRef::Operator {
                op,
                children,
            }
            .serialize(serializer),
        }
    }
}

#[cfg(feature = "serde")]
impl<'de> Deserialize<'de> for ProcessTree {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(tag = "kind", rename_all = "snake_case")]
        enum ProcessTreeOwned {
            Leaf {
                activity: Option<ActivityName>,
            },
            Operator {
                op: ProcessTreeOperator,
                children: Vec<ProcessTree>,
            },
        }

        match ProcessTreeOwned::deserialize(deserializer)? {
            ProcessTreeOwned::Leaf { activity } => Ok(ProcessTree::Leaf(activity)),
            ProcessTreeOwned::Operator { op, children } => {
                Ok(ProcessTree::Operator { op, children })
            }
        }
    }
}

impl ProcessTree {
    // ── Constructors ──────────────────────────────────────────────────────
''',
)
replace_once(
    '''        let json = serde_json::to_string(&t).unwrap();
        let back: ProcessTree = serde_json::from_str(&json).unwrap();
        assert_eq!(t, back);
''',
    '''        let json = serde_json::to_string(&t).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["kind"], "operator");
        assert_eq!(value["children"][0]["kind"], "leaf");
        assert!(value["children"][0]["activity"].is_null());
        let back: ProcessTree = serde_json::from_str(&json).unwrap();
        assert_eq!(t, back);
''',
)

subprocess.run(["rustfmt", PATH], cwd=ROOT, check=True)
subprocess.run(["git", "diff", "--check", "--", PATH], cwd=ROOT, check=True)
print(PATH)
