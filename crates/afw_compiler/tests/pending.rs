// `<Pending>`: the built-in boundary element, with the build (and hydration adoption)
// of its children bracketed by `enterPending`/`exitPending`, so a resource the
// children read registers with it.

use std::path::Path;

use afw_compiler::codegen::{csr, hydrate, ssg};
use afw_compiler::lower::lower_module;
use afw_compiler::parse::ParseSession;

const SOURCE: &str = r#"import { Pending, resource } from "@opentf/afw";
import Header from "./Header.jsx";
export default function Profile() {
  const user = resource(() => fetch("/u").then((r) => r.json()));
  return (
    <Pending fallback={<p class="sk">Loading</p>} refetch="fallback" delay={200}>
      <Header name={user.data?.name} />
      <p>{user.data?.bio}</p>
    </Pending>
  );
}
"#;

fn compile(source: &str, page: bool) -> (String, String, String) {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("page.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    let m = lower_module("/app/page.jsx", &parsed.program, source, page).expect("a module");
    let c = csr::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    let h = hydrate::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    let s = ssg::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    for errors in [&c.errors, &h.errors, &s.errors] {
        assert!(errors.is_empty(), "codegen errors: {errors:?}");
    }
    (c.code, h.code, s.code)
}

#[test]
fn client_output_brackets_the_children_build() {
    let (code, _, _) = compile(SOURCE, true);
    assert!(code.contains("document.createElement(\"afw-internal-pending\")"), "{code}");
    assert!(code.contains("enterPending, exitPending"), "imported:\n{code}");
    let enter = code.find("enterPending(c0);").expect("enter");
    let read = code.find("user.data?.name").expect("the child's read");
    let exit = code.find("} finally { exitPending(); }").expect("exit");
    assert!(enter < read && read < exit, "the read happens inside the bracket:\n{code}");
    assert!(code.contains("setProp(c0, \"refetch\", \"fallback\")"), "{code}");
    assert!(code.contains("setProp(c0, \"delay\", (200))"), "{code}");
}

#[test]
fn hydrate_output_brackets_the_children_adoption() {
    let (_, code, _) = compile(SOURCE, true);
    assert!(code.contains("claimElement(") && code.contains("\"afw-internal-pending\")"), "{code}");
    // Once around the build path, once around the adopt path.
    assert!(code.matches("} finally { exitPending(); }").count() >= 2, "{code}");
    let adopt = code.find("hydrateSlot(").expect("slotted children are adopted");
    let enter = code[..adopt].rfind("enterPending(").expect("enter before adoption");
    assert!(enter < adopt, "{code}");
}

#[test]
fn a_childless_boundary_still_signals_its_adoption() {
    let (_, code, _) = compile(
        "import { Pending } from \"@opentf/afw\";\nexport default function P() { return <Pending fallback={<p>…</p>} />; }",
        true,
    );
    assert!(code.contains("} finally { exitPending(); }"), "{code}");
}

#[test]
fn server_output_renders_the_builtin_with_its_fallback() {
    let (_, _, code) = compile(SOURCE, true);
    assert!(code.contains("ssgComponent(\"afw-internal-pending\""), "{code}");
    assert!(code.contains("fallback: ({ __html: \"<p class=\\\"sk\\\">Loading</p>\" })"), "{code}");
    assert!(!code.contains("enterPending"), "{code}");
}

#[test]
fn other_components_are_not_bracketed() {
    let (code, _, _) = compile(
        "import Card from \"./Card.jsx\";\nexport default function P() { return <Card><p>x</p></Card>; }",
        true,
    );
    assert!(!code.contains("enterPending"), "{code}");
}
