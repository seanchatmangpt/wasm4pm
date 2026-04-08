//! Process tree data model for POWL → ProcessTree conversion.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PtOperator {
    Sequence,
    Xor,
    Parallel,
    Loop,
}

impl PtOperator {
    pub fn as_str(self) -> &'static str {
        match self {
            PtOperator::Sequence => "->",
            PtOperator::Xor => "X",
            PtOperator::Parallel => "+",
            PtOperator::Loop => "*",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProcessTree {
    pub label: Option<String>,
    pub operator: Option<PtOperator>,
    #[serde(default)]
    pub children: Vec<ProcessTree>,
}

impl ProcessTree {
    pub fn leaf(label: Option<String>) -> Self {
        ProcessTree {
            label,
            operator: None,
            children: Vec::new(),
        }
    }

    pub fn internal(operator: PtOperator, children: Vec<ProcessTree>) -> Self {
        ProcessTree {
            label: None,
            operator: Some(operator),
            children,
        }
    }

    pub fn to_repr(&self) -> String {
        match (&self.operator, &self.label) {
            (None, None) => "tau".to_string(),
            (None, Some(l)) => l.clone(),
            (Some(op), _) => {
                let children: Vec<String> = self.children.iter().map(|c| c.to_repr()).collect();
                format!("{} ( {} )", op.as_str(), children.join(", "))
            }
        }
    }
}
