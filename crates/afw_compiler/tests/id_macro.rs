// `$id()` (SPEC §3.6): a top-level `const x = $id()` in a component lowers to
// `componentId(n)` — numbered in source order, imported from the client runtime or
// the server runtime per target — and anything else is rejected with where it belongs.

use std::path::Path;

use afw_compiler::codegen::{csr, hydrate, ssg};
use afw_compiler::lower::{id_macro_diagnostic, lower_module};
use afw_compiler::parse::ParseSession;

const FIELD: &str = r#"export default function Field({ label }) {
  const inputId = $id(), hintId = $id();
  const errorId = $id();
  return (
    <div>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-describedby={`${hintId} ${errorId}`} />
      <p id={hintId}>hint</p>
    </div>
  );
}
"#;

enum Target {
    Csr,
    Hydrate,
    Ssg,
}

fn compile(source: &str, target: Target) -> String {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("Field.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    assert!(id_macro_diagnostic(&parsed.program, false).is_none(), "valid $id() rejected");
    let m = lower_module("/app/components/Field.jsx", &parsed.program, source, false).expect("a module");
    let (code, errors) = match target {
        Target::Csr => {
            let out = csr::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
            (out.code, out.errors)
        }
        Target::Hydrate => {
            let out = hydrate::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
            (out.code, out.errors)
        }
        Target::Ssg => {
            let out = ssg::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
            (out.code, out.errors)
        }
    };
    assert!(errors.is_empty(), "codegen errors: {errors:?}\n{code}");
    code
}

/// The diagnostic for `source` (`page` = a page module), as (text at the offset, message).
fn diagnose(source: &str, page: bool) -> Option<(String, String)> {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("C.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    id_macro_diagnostic(&parsed.program, page)
        .map(|(at, msg)| (source[at as usize..].chars().take(3).collect(), msg))
}

#[test]
fn ids_are_numbered_in_source_order_on_every_target() {
    for target in [Target::Csr, Target::Hydrate, Target::Ssg] {
        let code = compile(FIELD, target);
        assert!(code.contains("const inputId = componentId(0);"), "{code}");
        assert!(code.contains("const hintId = componentId(1);"), "{code}");
        assert!(code.contains("const errorId = componentId(2);"), "{code}");
        assert!(!code.contains("$id"), "the macro never reaches the output:\n{code}");
    }
}

#[test]
fn the_helper_comes_from_the_client_or_the_server_runtime() {
    let client = compile(FIELD, Target::Csr);
    let header = client.lines().find(|l| l.contains("from \"@opentf/afw\"")).expect("runtime import");
    assert!(header.contains("componentId"), "{client}");

    let server = compile(FIELD, Target::Ssg);
    let header = server.lines().find(|l| l.contains("from \"@opentf/afw/server\"")).expect("server import");
    assert!(header.contains("componentId"), "{server}");
}

#[test]
fn an_id_is_a_plain_string_not_a_signal() {
    let code = compile(FIELD, Target::Csr);
    assert!(!code.contains("inputId.value"), "no `.value` on an id:\n{code}");
}

#[test]
fn a_component_without_ids_imports_no_helper() {
    let code = compile("export default function P() { return <p>hi</p>; }", Target::Csr);
    assert!(!code.contains("componentId"), "{code}");
    let code = compile("export default function P() { return <p>hi</p>; }", Target::Ssg);
    assert!(!code.contains("componentId"), "{code}");
}

#[test]
fn a_legacy_macro_import_is_dropped() {
    let code = compile(
        "import { $id } from \"@opentf/afw\";\nexport default function P() { const id = $id(); return <p id={id}/>; }",
        Target::Csr,
    );
    assert!(!code.contains("$id"), "{code}");
    assert!(code.contains("const id = componentId(0);"), "{code}");
}

#[test]
fn misplaced_calls_are_rejected_at_the_call() {
    for bad in [
        // inside a handler, an effect, a condition, a loop, a nested helper
        "export default function C() { const f = () => $id(); return <p onClick={f}/>; }",
        "export default function C() { $effect(() => { const x = $id(); }); return <p/>; }",
        "export default function C(props) { if (props.a) { const x = $id(); } return <p/>; }",
        "export default function C() { for (const i of [1]) { const x = $id(); } return <p/>; }",
        // in the view itself
        "export default function C() { return <p id={$id()}/>; }",
        // `let`, arguments, a destructure, part of an expression
        "export default function C() { let x = $id(); return <p id={x}/>; }",
        "export default function C() { const x = $id(\"name\"); return <p id={x}/>; }",
        "export default function C() { const x = $id() + \"-a\"; return <p id={x}/>; }",
        // mixed with a non-id declarator, and at module scope
        "export default function C() { const x = $id(), y = 1; return <p id={x}/>; }",
        "const x = $id();\nexport default function C() { return <p id={x}/>; }",
    ] {
        let (at, msg) = diagnose(bad, false).unwrap_or_else(|| panic!("expected rejection: {bad}"));
        assert_eq!(at, "$id", "points at the call: {bad}");
        assert!(msg.contains("top-level `const name = $id();`"), "{msg}");
    }
}

#[test]
fn a_page_or_layout_cannot_use_it_but_its_components_can() {
    let (at, msg) =
        diagnose("export default function Page() { const id = $id(); return <p id={id}/>; }", true).expect("page");
    assert_eq!(at, "$id");
    assert!(msg.contains("not available in a page or layout"), "{msg}");

    let colocated = "function Row() { const id = $id(); return <p id={id}/>; }\n\
                     export default function Page() { return <Row/>; }";
    assert!(diagnose(colocated, true).is_none(), "a page module's own components may use it");
    // In a component module the default export is a component, not a page.
    assert!(diagnose("export default function C() { const id = $id(); return <p id={id}/>; }", false).is_none());
}

#[test]
fn an_unrelated_dollar_call_is_left_alone() {
    assert!(diagnose("export default function C() { const x = $state(0); return <p>{x}</p>; }", false).is_none());
}
