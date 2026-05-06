use crate::dense_kernel::{DenseError, DenseIndex, NodeKind};
use proptest::prelude::*;

fn any_node_kind() -> impl Strategy<Value = NodeKind> {
    prop_oneof![
        Just(NodeKind::Generic),
        Just(NodeKind::Place),
        Just(NodeKind::Transition),
        Just(NodeKind::Port),
    ]
}

proptest! {
    #[test]
    fn test_dense_index_properties(
        symbols in prop::collection::vec(("[a-zA-Z0-9]{1,20}", any_node_kind()), 1..50)
    ) {
        // Remove duplicates for a baseline test
        let mut unique_map = std::collections::HashMap::new();
        for (s, k) in symbols.iter() {
            unique_map.insert(s.clone(), *k);
        }
        let unique_symbols: Vec<_> = unique_map.into_iter().collect();

        let index = DenseIndex::compile(unique_symbols.clone()).expect("Failed to compile unique symbols");

        // AC 1: Determinism
        let mut shuffled = unique_symbols.clone();
        shuffled.reverse();
        let index2 = DenseIndex::compile(shuffled).expect("Failed to compile shuffled symbols");
        assert_eq!(index.symbols(), index2.symbols(), "Symbols must be sorted and deterministic");

        // AC 3: Structural Minimality (Contiguous IDs)
        let n = index.len();
        for i in 0..n {
            let symbol = index.symbol(i as u32).expect("Missing symbol for contiguous ID");
            let dense_id = index.dense_id(symbol).expect("Missing dense ID for symbol");
            assert_eq!(dense_id, i as u32, "Dense ID must be equal to its position in sorted symbols");
        }

        // AC 4: Hot-path lookup
        for (s, _) in &unique_symbols {
            assert!(index.dense_id(s).is_some(), "Symbol must be found in index");
        }
    }

    #[test]
    fn test_dense_index_duplicate_detection(
        s in "[a-zA-Z0-9]{1,20}",
        k1 in any_node_kind(),
        k2 in any_node_kind(),
    ) {
        let symbols = vec![
            (s.clone(), k1),
            (s.clone(), k2),
        ];

        let result = DenseIndex::compile(symbols);
        assert!(matches!(result, Err(DenseError::DuplicateSymbol { .. })));
    }
}
