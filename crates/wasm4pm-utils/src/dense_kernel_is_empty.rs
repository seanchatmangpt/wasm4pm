    #[inline]
    pub fn is_empty(&self) -> bool {
        for w in &self.words {
            if *w != 0 {
                return false;
            }
        }
        true
    }
}
