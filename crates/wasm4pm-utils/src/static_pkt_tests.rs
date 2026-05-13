// Property tests for StaticPackedKeyTable
#[cfg(test)]
mod tests {
    use crate::static_pkt::StaticPackedKeyTable;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn test_static_pkt_insert_and_get(
            keys in prop::collection::vec((any::<u64>(), any::<u32>()), 0..10),
        ) {
            let mut table = StaticPackedKeyTable::<u32, u32, 10>::new();
            for (h, v) in keys.iter() {
                let _ = table.insert(*h, *v, *v);
            }
            for (h, v) in keys.iter() {
                assert_eq!(table.get(*h), Some(v));
            }
        }
    }
}
