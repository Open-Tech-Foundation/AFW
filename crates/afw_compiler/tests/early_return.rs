// A `return` ahead of a component's view used to compile into setup code whose result was
// thrown away, so the component silently rendered its other branch. It is rejected now,
// at the early `return`, with the conditional-view fix.

use std::path::Path;

use afw_compiler::lower::early_return_diagnostic;
use afw_compiler::parse::ParseSession;

fn diagnose(src: &str) -> Option<(String, String)> {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("C.jsx"), src);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    early_return_diagnostic(&parsed.program).map(|(at, msg)| (src[at as usize..].chars().take(6).collect(), msg))
}

#[test]
fn an_early_return_in_a_component_is_rejected_at_that_return() {
    let (at, msg) = diagnose(
        "export default function C(props) { if (props.inline) { return <p/>; } return <nav/>; }",
    )
    .expect("rejected");
    assert_eq!(at, "return");
    assert!(msg.contains("returns before its view"), "{msg}");
    assert!(msg.contains("return cond ? <A /> : <B />"), "{msg}");
}

#[test]
fn guards_returning_null_and_returns_in_loops_count_too() {
    let (_, msg) = diagnose("export function Row(props) { if (!props.date) return null; return <p/>; }").expect("guard");
    assert!(msg.starts_with("`Row` returns before its view"), "{msg}");
    assert!(diagnose("const C = () => { for (const x of [1]) { return <i/>; } return <b/>; };").is_some());
}

#[test]
fn nested_functions_helpers_and_a_single_conditional_return_are_fine() {
    for ok in [
        "export default function C(props) { return props.inline ? <p/> : <nav/>; }",
        "export default function C() { const pick = (x) => { if (x) return 1; return 2; }; return <p>{pick(1)}</p>; }",
        "export default function C() { function f(x) { if (x) return 1; return 2; } return <p>{f(1)}</p>; }",
        "export default function C() { class K { m() { return 1; } } return <p/>; }",
        "export function helper(x) { if (x) return 1; return 2; }",
    ] {
        assert!(diagnose(ok).is_none(), "should compile: {ok}");
    }
}
