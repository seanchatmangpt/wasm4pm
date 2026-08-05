#!/usr/bin/env python3
"""Deterministically manufacture the currently admitted CI repairs.

This script mutates only the checked-out candidate tree. The workflow validates
that tree and creates unattached Git objects; it never updates a branch ref.
"""

from __future__ import annotations

import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"PATCH_ADMISSION_REFUSED {path}: expected one match, observed {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def patch_pnml() -> None:
    path = "wasm4pm/src/pnml_io.rs"
    replace_once(
        path,
        '''            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().trim().to_string();
                if text.is_empty() {
                    buf.clear();
                    continue;
                }
                match state {
                    ParseState::PlaceNameText => {
                        cur_place_label = Some(text);
                    }
                    ParseState::PlaceInitialMarkingText => {
                        cur_place_marking = parse_usize(&text);
                    }
                    ParseState::TransitionNameText => {
                        cur_trans_label = Some(text);
                    }
                    ParseState::ArcInscriptionText => {
                        cur_arc_weight = parse_usize(&text);
                    }
                    ParseState::InitialMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_im_place_idref.is_empty() {
                                initial_marking.insert(cur_im_place_idref.clone(), tokens);
                            }
                        }
                    }
                    ParseState::FinalMarkingsMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_fm_place_idref.is_empty() {
                                cur_fm_marking.insert(cur_fm_place_idref.clone(), tokens);
                            }
                        }
                    }
                    _ => {}
                }
            }
''',
        '''            Ok(Event::Text(ref e)) => {
                let text = e
                    .xml10_content()
                    .map_err(|err| format!("Failed to decode PNML text: {err}"))?;
                if text.is_empty() {
                    buf.clear();
                    continue;
                }
                match state {
                    ParseState::PlaceNameText => {
                        cur_place_label
                            .get_or_insert_with(String::new)
                            .push_str(&text);
                    }
                    ParseState::PlaceInitialMarkingText => {
                        cur_place_marking = parse_usize(&text);
                    }
                    ParseState::TransitionNameText => {
                        cur_trans_label
                            .get_or_insert_with(String::new)
                            .push_str(&text);
                    }
                    ParseState::ArcInscriptionText => {
                        cur_arc_weight = parse_usize(&text);
                    }
                    ParseState::InitialMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_im_place_idref.is_empty() {
                                initial_marking.insert(cur_im_place_idref.clone(), tokens);
                            }
                        }
                    }
                    ParseState::FinalMarkingsMarkingPlaceText => {
                        if let Some(tokens) = parse_usize(&text) {
                            if tokens > 0 && !cur_fm_place_idref.is_empty() {
                                cur_fm_marking.insert(cur_fm_place_idref.clone(), tokens);
                            }
                        }
                    }
                    _ => {}
                }
            }

            Ok(Event::GeneralRef(ref e)) => {
                let resolved = if let Some(ch) = e
                    .resolve_char_ref()
                    .map_err(|err| format!("Invalid PNML character reference: {err}"))?
                {
                    ch.to_string()
                } else {
                    let name = e
                        .decode()
                        .map_err(|err| format!("Failed to decode PNML entity reference: {err}"))?;
                    match name.as_ref() {
                        "lt" => "<".to_string(),
                        "gt" => ">".to_string(),
                        "amp" => "&".to_string(),
                        "apos" => "'".to_string(),
                        "quot" => "\\\"".to_string(),
                        _ => return Err(format!("Unsupported PNML entity reference: &{name};")),
                    }
                };

                match state {
                    ParseState::PlaceNameText => {
                        cur_place_label
                            .get_or_insert_with(String::new)
                            .push_str(&resolved);
                    }
                    ParseState::TransitionNameText => {
                        cur_trans_label
                            .get_or_insert_with(String::new)
                            .push_str(&resolved);
                    }
                    _ => {
                        return Err(format!(
                            "PNML entity reference is not valid in parser state {state:?}"
                        ));
                    }
                }
            }
''',
    )
    replace_once(
        path,
        '''    #[test]
    fn test_pnml_roundtrip() {
''',
        '''    #[test]
    fn test_from_pnml_decodes_split_entity_references() {
        let pnml = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="EntityTest" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p1"><name><text>A &amp; B &#x3C; C</text></name></place>
      <transition id="t1"><name><text>Quote &quot;value&quot;</text></name></transition>
    </page>
  </net>
</pnml>"#;

        let net = from_pnml(pnml).expect("entity-bearing PNML should parse");
        assert_eq!(net.places[0].label, "A & B < C");
        assert_eq!(net.transitions[0].label, "Quote \\"value\\"");
    }

    #[test]
    fn test_pnml_roundtrip() {
''',
    )


def patch_map_fixtures() -> None:
    for path in ("wasm4pm/src/automl_envelope.rs", "wasm4pm/src/statistical_analysis.rs"):
        target = ROOT / path
        text = target.read_text(encoding="utf-8")
        marker = "#[cfg(test)]"
        if text.count(marker) != 1:
            raise SystemExit(f"PATCH_ADMISSION_REFUSED {path}: test module marker changed")
        head, tail = text.split(marker, 1)
        if "use std::collections::HashMap;" not in tail:
            raise SystemExit(f"PATCH_ADMISSION_REFUSED {path}: stale fixture import absent")
        tail = tail.replace("use std::collections::HashMap;", "use std::collections::BTreeMap;", 1)
        if "HashMap::new()" not in tail:
            raise SystemExit(f"PATCH_ADMISSION_REFUSED {path}: stale fixture constructors absent")
        tail = tail.replace("HashMap::new()", "BTreeMap::new()")
        target.write_text(head + marker + tail, encoding="utf-8")


def patch_rf_fixture() -> None:
    replace_once(
        "wasm4pm/src/prediction_rf.rs",
        'let snap: RfPredictorSnapshot = serde_json::from_str().expect("deserialise");',
        'let snap: RfPredictorSnapshot = serde_json::from_str(snapshot_json).expect("deserialise");',
    )


def patch_breed_fixture() -> None:
    path = "crates/wasm4pm-cognition/tests/composed_pipeline_breed_handoff.rs"
    replace_once(
        path,
        '''    BreedProposal, ClosureBreed, CognitivePipelineBuilder, PipelineEvent, PipelineInput,
''',
        '''    BreedFailure, BreedInput, BreedProposal, ClosureBreed, CognitivePipelineBuilder,
    PipelineEvent, PipelineInput,
''',
    )
    replace_once(
        path,
        '''#[test]
fn one_breed_can_unlock_a_later_breed_without_consumer_pipeline_knowledge() {
    let classify = ClosureBreed::new(
        "classify_problem",
        vec!["explain:q-1".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                add_obligations: vec!["plan:array-search".to_string()],
                value: Some("array-search".to_string()),
                ..BreedProposal::default()
            })
        },
    );
    let plan = ClosureBreed::new(
        "plan_solution",
        vec!["plan:array-search".to_string()],
        AuthorityClass::Project,
        |_input| {
            Ok(BreedProposal {
                resolve_obligations: vec![
                    "explain:q-1".to_string(),
                    "plan:array-search".to_string(),
                ],
                value: Some("scan once with indexed memory".to_string()),
                ..BreedProposal::default()
            })
        },
    );
''',
        '''fn classify_problem(_input: BreedInput<'_>) -> Result<BreedProposal, BreedFailure> {
    Ok(BreedProposal {
        add_obligations: vec!["plan:array-search".to_string()],
        value: Some("array-search".to_string()),
        ..BreedProposal::default()
    })
}

fn plan_solution(_input: BreedInput<'_>) -> Result<BreedProposal, BreedFailure> {
    Ok(BreedProposal {
        resolve_obligations: vec![
            "explain:q-1".to_string(),
            "plan:array-search".to_string(),
        ],
        value: Some("scan once with indexed memory".to_string()),
        ..BreedProposal::default()
    })
}

#[test]
fn one_breed_can_unlock_a_later_breed_without_consumer_pipeline_knowledge() {
    let classify = ClosureBreed::new(
        "classify_problem",
        vec!["explain:q-1".to_string()],
        AuthorityClass::Project,
        classify_problem,
    );
    let plan = ClosureBreed::new(
        "plan_solution",
        vec!["plan:array-search".to_string()],
        AuthorityClass::Project,
        plan_solution,
    );
''',
    )


def main() -> None:
    patch_pnml()
    patch_map_fixtures()
    patch_rf_fixture()
    patch_breed_fixture()
    changed = [
        "wasm4pm/src/pnml_io.rs",
        "wasm4pm/src/automl_envelope.rs",
        "wasm4pm/src/prediction_rf.rs",
        "wasm4pm/src/statistical_analysis.rs",
        "crates/wasm4pm-cognition/tests/composed_pipeline_breed_handoff.rs",
    ]
    subprocess.run(["rustfmt", *changed], cwd=ROOT, check=True)
    subprocess.run(["git", "diff", "--check", "--", *changed], cwd=ROOT, check=True)
    print("\n".join(changed))


if __name__ == "__main__":
    main()
