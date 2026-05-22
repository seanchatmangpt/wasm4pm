
//! Proc-macro companion for Route-Driven TDD.
//!
//! # Usage
//!
//! ```rust,ignore
//! use wasm4pm_macros::{powl_test, powl_activity};
//!
//! #[powl_test(
//!     route = "my-route",
//!     model = "routes/test-harness/sequential-two-step.powl.json"
//! )]
//! fn test_my_route() {
//!     h.record_activity("A");
//!     h.record_activity("B");
//! }
//!
//! #[powl_activity(activity = "fixture.created")]
//! fn create_fixture() {
//!     // original body
//! }
//! ```
//!
//! `#[powl_test]` injects a `mut h: PowlTestHarness` local into the test body
//! and calls `h.finish()` after the body runs — panicking on any AndonPull.
//! Use `expect_refusal = "AndonVariant"` to assert a specific AndonPull fires.
//!
//! `#[powl_activity]` prepends a `wasm4pm::testing::record_activity("...")` call.

use proc_macro::TokenStream;
use proc_macro2::Span;
use quote::quote;
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, Ident, ItemFn, LitBool, LitStr, Result, Token,
};

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsers
// ─────────────────────────────────────────────────────────────────────────────

struct PowlTestArgs {
    route: LitStr,
    model: LitStr,
    expect_refusal: Option<String>,
}

impl Parse for PowlTestArgs {
    fn parse(input: ParseStream) -> Result<Self> {
        let mut route: Option<LitStr> = None;
        let mut model: Option<LitStr> = None;
        let mut expect_refusal: Option<String> = None;

        while !input.is_empty() {
            let key: Ident = input.parse()?;
            input.parse::<Token![=]>()?;

            match key.to_string().as_str() {
                "route" => route = Some(input.parse()?),
                "model" => model = Some(input.parse()?),
                "expect_refusal" => {
                    let s: LitStr = input.parse()?;
                    expect_refusal = Some(s.value());
                }
                "exact" => {
                    input.parse::<LitBool>()?;
                }
                other => {
                    return Err(syn::Error::new(key.span(), format!("unknown attribute '{other}'")));
                }
            }

            if !input.is_empty() {
                input.parse::<Token![,]>()?;
            }
        }

        Ok(Self {
            route: route
                .ok_or_else(|| syn::Error::new(Span::call_site(), "missing required 'route'"))?,
            model: model
                .ok_or_else(|| syn::Error::new(Span::call_site(), "missing required 'model'"))?,
            expect_refusal,
        })
    }
}

struct PowlActivityArgs {
    activity: LitStr,
}

impl Parse for PowlActivityArgs {
    fn parse(input: ParseStream) -> Result<Self> {
        let key: Ident = input.parse()?;
        if key != "activity" {
            return Err(syn::Error::new(key.span(), "expected 'activity = \"...\"'"));
        }
        input.parse::<Token![=]>()?;
        Ok(Self { activity: input.parse()? })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_test]
// ─────────────────────────────────────────────────────────────────────────────

/// Expands a test function into a route-driven test with a POWL conformance
/// check.
///
/// The harness is available as `h` inside the test body. After the body
/// runs, `h.finish()` is called and the verdict is asserted.
///
/// # Parameters
///
/// - `route` — the route ID string (required)
/// - `model` — path to the `.powl.json` model file (required)
/// - `exact` — ignored (all admitted tests require exact conformance)
/// - `expect_refusal` — assert a specific [`AndonPull`] variant fires
///
/// [`AndonPull`]: wasm4pm::testing::AndonPull
#[proc_macro_attribute]
pub fn powl_test(attr: TokenStream, item: TokenStream) -> TokenStream {
    let args = parse_macro_input!(attr as PowlTestArgs);
    let func = parse_macro_input!(item as ItemFn);

    let fn_name = &func.sig.ident;
    let fn_body = &func.block;
    let route = &args.route;
    let model_path = &args.model;

    let verdict_assert = match &args.expect_refusal {
        Some(refusal) => {
            let refusal_ident = Ident::new(refusal, Span::call_site());
            quote! {
                assert_eq!(
                    __verdict,
                    wasm4pm::testing::ConformanceVerdict::Andon(
                        wasm4pm::testing::AndonPull::#refusal_ident
                    ),
                    concat!(
                        "route '", #route,
                        "': expected AndonPull::",
                        stringify!(#refusal_ident),
                        " but got: {:?}"
                    ),
                    __verdict
                );
            }
        }
        None => {
            quote! {
                if !__verdict.is_passed() {
                    panic!(
                        concat!("route '", #route, "' AndonPull: {:?}"),
                        __verdict
                    );
                }
            }
        }
    };

    // Expand the model path relative to CARGO_MANIFEST_DIR of the calling crate.
    // concat! is evaluated at compile time in the consumer crate, so CARGO_MANIFEST_DIR
    // resolves to the package root of the crate being compiled (not wasm4pm-macros).
    quote! {
        #[test]
        fn #fn_name() {
            let __model_path = concat!(env!("CARGO_MANIFEST_DIR"), "/", #model_path);
            let mut h = wasm4pm::testing::PowlTestHarness::new(#route)
                .model(__model_path);
            #fn_body
            let __verdict = h.finish();
            #verdict_assert
        }
    }
    .into()
}

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_activity]
// ─────────────────────────────────────────────────────────────────────────────

/// Prepends a `wasm4pm::testing::record_activity("...")` call to the function.
///
/// The call is a no-op in production builds (inlined away). Under
/// `cfg(any(test, feature = "powl-test"))` it records the activity in the
/// thread-local trace buffer.
///
/// # Example
///
/// ```rust,ignore
/// #[powl_activity(activity = "fixture.created")]
/// fn create_fixture() { /* ... */ }
/// ```
#[proc_macro_attribute]
pub fn powl_activity(attr: TokenStream, item: TokenStream) -> TokenStream {
    let args = parse_macro_input!(attr as PowlActivityArgs);
    let func = parse_macro_input!(item as ItemFn);

    let fn_attrs = &func.attrs;
    let fn_vis = &func.vis;
    let fn_sig = &func.sig;
    let fn_body = &func.block;
    let activity = &args.activity;

    quote! {
        #(#fn_attrs)*
        #fn_vis #fn_sig {
            wasm4pm::testing::record_activity(#activity);
            #fn_body
        }
    }
    .into()
}
