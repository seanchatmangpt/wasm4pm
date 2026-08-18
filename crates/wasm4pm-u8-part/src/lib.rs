#![cfg_attr(all(target_arch = "wasm32", not(test)), no_std)]

//! Minimal interchangeable WASM part for the construct-only standing runtime.
//!
//! The semantic request surface is exactly one `u8`. The byte does not carry
//! code, query text, executable IR, or business data. It selects a
//! pre-admitted host-side construct capsule over a corpus that already has
//! standing. This crate deliberately has no dependencies and no runtime data
//! strings. The only intentional string-bearing WASM metadata is the import
//! and export boundary supplied by the object format.

/// Exhaustive size of the semantic selector alphabet.
pub const SELECTOR_COUNT: u16 = 256;

/// The host owns the admitted selector -> execution-capsule relation.
///
/// A conforming host must establish OCEL v2/corpus/part standing before
/// instantiating this module. `construct` is not a dynamic query interface: its
/// argument is the already-bounded capsule selector.
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "chatman")]
extern "C" {
    #[link_name = "construct"]
    fn host_construct(selector: u8) -> u64;
}

/// Execute one pre-admitted construct capsule.
///
/// There is no application-level branch in this function and no payload other
/// than the semantic byte. On WebAssembly core the Rust `u8` ABI is represented
/// by the core numeric ABI; the standing host is responsible for transporting
/// exactly one octet as the selector.
#[no_mangle]
pub extern "C" fn run(selector: u8) -> u64 {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        host_construct(selector)
    }

    // Native builds exist only so the zero-dependency boundary has a direct
    // unit-test oracle. This path is not evidence for the WASM host boundary.
    #[cfg(not(target_arch = "wasm32"))]
    {
        selector as u64
    }
}

#[cfg(all(target_arch = "wasm32", not(test)))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! {
    core::arch::wasm32::unreachable()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selector_universe_is_exactly_one_byte() {
        let mut seen = [false; SELECTOR_COUNT as usize];
        for selector in u8::MIN..=u8::MAX {
            let observed = run(selector);
            assert_eq!(observed, selector as u64);
            seen[selector as usize] = true;
        }
        assert!(seen.into_iter().all(core::convert::identity));
    }
}
