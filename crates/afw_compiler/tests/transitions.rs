// Enter/exit transition props (`transition`, `in`, `out`) on HTML elements: the client
// and hydrate targets attach them with `setTransition`, the server output drops them,
// and a string value is rejected with the expression form.

use std::path::Path;

use afw_compiler::codegen::{csr, hydrate, ssg};
use afw_compiler::lower::{lower_module, transition_prop_diagnostic};
use afw_compiler::parse::ParseSession;

const SOURCE: &str = r#"import { fade, slide } from "@opentf/afw/transition";
export default function Panel() {
  let open = $state(false);
  let items = $state([{ id: 1 }]);
  return (
    <div>
      {open && <p transition={fade()}>hi</p>}
      <ul>{items.map((i) => <li key={i.id} in={slide()} out={fade({ duration: 100 })}>{i.id}</li>)}</ul>
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
    let parsed = session.parse(Path::new("Panel.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    let m = lower_module("/app/components/Panel.jsx", &parsed.program, source, false).expect("a module");
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

#[test]
fn client_output_attaches_each_transition_prop() {
    let code = compile(SOURCE, Target::Csr);
    assert!(code.contains("setTransition } from \"@opentf/afw\""), "imported:\n{code}");
    assert!(code.contains("\"both\", (fade())"), "{code}");
    assert!(code.contains("\"in\", (slide())"), "{code}");
    assert!(code.contains("\"out\", (fade({ duration: 100 }))"), "{code}");
    assert!(!code.contains("\"transition\""), "never an attribute:\n{code}");
    assert!(!code.contains("#transition"), "the reserved name stays internal:\n{code}");
}

#[test]
fn hydrate_output_attaches_transitions_to_adopted_elements() {
    let code = compile(SOURCE, Target::Hydrate);
    // Once in the build half and once in the adopt half of each region.
    assert!(code.matches("\"both\", (fade())").count() >= 2, "build + adopt:\n{code}");
    assert!(code.matches("\"in\", (slide())").count() >= 2, "build + adopt:\n{code}");
}

#[test]
fn server_output_drops_transition_props() {
    let code = compile(SOURCE, Target::Ssg);
    assert!(code.contains("\"<p>hi</p>\""), "a bare element:\n{code}");
    assert!(code.contains("return \"<li><!--$-->\""), "a bare list item:\n{code}");
    assert!(!code.contains("setTransition") && !code.contains("attr("), "{code}");
}

#[test]
fn svg_filter_inputs_stay_attributes() {
    let source = r#"export default function F() {
  let input = $state("SourceGraphic");
  return <svg><filter><feBlend in={input} in2="BackgroundImage" /></filter></svg>;
}"#;
    let code = compile(source, Target::Csr);
    assert!(!code.contains("setTransition"), "{code}");
    assert!(code.contains("bindAttr(") && code.contains("\"in\""), "a reactive attribute:\n{code}");
}

#[test]
fn component_props_named_like_transitions_pass_through() {
    let source = r#"import Toggle from "./Toggle.jsx";
export default function F() {
  let open = $state(false);
  return <Toggle in={open} transition={"fast"} />;
}"#;
    let code = compile(source, Target::Csr);
    assert!(!code.contains("setTransition"), "{code}");
    assert!(code.contains("\"in\""), "an ordinary prop:\n{code}");
}

fn diagnose(source: &str) -> Option<String> {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("C.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    transition_prop_diagnostic(&parsed.program).map(|(at, msg)| {
        assert!(source[at as usize..].starts_with(msg.split('`').nth(1).unwrap()), "points at the prop");
        msg
    })
}

#[test]
fn a_string_transition_on_an_element_is_rejected() {
    let msg = diagnose(r#"export default function C() { return <div transition="fade">x</div>; }"#).expect("rejected");
    assert!(msg.contains("transition={fade()}"), "{msg}");
    let msg = diagnose(r#"export default function C() { return <div out>x</div>; }"#).expect("valueless");
    assert!(msg.contains("out={fade()}"), "{msg}");
}

#[test]
fn expressions_components_and_filters_are_accepted() {
    assert!(diagnose("export default function C() { return <div transition={fade()}>x</div>; }").is_none());
    assert!(diagnose(r#"export default function C() { return <Toggle in="yes" />; }"#).is_none());
    assert!(diagnose(r#"export default function C() { return <svg><feBlend in="SourceGraphic" /></svg>; }"#).is_none());
}
