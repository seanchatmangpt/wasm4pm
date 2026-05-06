// Zero-allocation PackedKeyTable implementation

#[derive(Debug, Clone)]
pub struct StaticPackedKeyTable<K, V, const N: usize> {
    entries: [(u64, K, V); N],
    size: usize,
}

impl<K: Default + Copy, V: Default + Copy, const N: usize> Default
    for StaticPackedKeyTable<K, V, N>
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K: Default + Copy, V: Default + Copy, const N: usize> StaticPackedKeyTable<K, V, N> {
    pub fn new() -> Self {
        Self {
            entries: [(0, K::default(), V::default()); N],
            size: 0,
        }
    }

    pub fn insert(&mut self, hash: u64, key: K, value: V) -> Result<(), &'static str> {
        let mut idx = 0;
        while idx < self.size && self.entries[idx].0 < hash {
            idx += 1;
        }

        if idx < self.size && self.entries[idx].0 == hash {
            self.entries[idx] = (hash, key, value);
            return Ok(());
        }

        if self.size >= N {
            return Err("Capacity exceeded");
        }

        for i in (idx..self.size).rev() {
            self.entries[i + 1] = self.entries[i];
        }

        self.entries[idx] = (hash, key, value);
        self.size += 1;
        Ok(())
    }

    #[inline]
    pub fn get(&self, hash: u64) -> Option<&V> {
        let mut low = 0;
        let mut high = self.size;

        while low < high {
            let mid = low + (high - low) / 2;
            let (h, _, _) = &self.entries[mid];
            if *h == hash {
                return Some(&self.entries[mid].2);
            } else if *h < hash {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        None
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.size
    }

    #[inline]
    pub fn is_empty(&self) -> bool {
        self.size == 0
    }
}
