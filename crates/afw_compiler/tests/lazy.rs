// Lazy components: a module-level `const Name = () => import("…")` (optionally with
// `.then((m) => m.X)`) is rewritten to `lazyComponent(<loader>, "<tag>")`, so `<Name>`
// compiles like any component while the bundler still splits the chunk.

use std::path::Path;

use afw_compiler::codegen::{csr, hydrate, ssg};
use afw_compiler::lower::lower_module;
use afw_compiler::parse::ParseSession;

const SOURCE: &str = r#"const Chart = () => import("./Chart.jsx");
export const LineChart = () => import("./charts.jsx").then((m) => m.LineChart);
const helper = () => import("./x.js");
const Dynamic = (id) => import(`./${id}.js`);
const Later = async () => import("./y.js");
let Mutable = () => import("./z.jsx");
export default function Page() {
  return <div onmouseenter={Chart}><Chart data={[1]}><b>kid</b></Chart><LineChart /></div>;
}
"#;

fn compile(source: &str, module: &str) -> (String, String, String) {
    let session = ParseSession::new();
    let parsed = session.parse(Path::new("page.jsx"), source);
    assert!(parsed.is_clean(), "parse errors: {:?}", parsed.errors);
    let m = lower_module(module, &parsed.program, source, true).expect("a module");
    let c = csr::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    let h = hydrate::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    let s = ssg::emit_module(&m.components, &m.module_stmts, &m.module_exprs);
    for errors in [&c.errors, &h.errors, &s.errors] {
        assert!(errors.is_empty(), "codegen errors: {errors:?}");
    }
    (c.code, h.code, s.code)
}

fn tag_of(code: &str, name: &str) -> String {
    let start = code.find(&format!("const {name} = lazyComponent(")).expect("rewritten");
    let line = &code[start..code[start..].find('\n').map_or(code.len(), |e| start + e)];
    line.rsplit('"').nth(1).expect("a tag").to_string()
}

#[test]
fn the_loader_shape_is_rewritten_with_the_import_left_in_place() {
    let (code, _, _) = compile(SOURCE, "/app/page.jsx");
    assert!(code.contains(r#"const Chart = lazyComponent(() => import("./Chart.jsx"), "afw-lazy-chart-"#), "{code}");
    assert!(code.contains(r#"export const LineChart = lazyComponent(() => import("./charts.jsx").then((m) => m.LineChart), "afw-lazy-line-chart-"#), "{code}");
    assert!(code.contains("lazyComponent } from \"@opentf/afw\""), "imported once:\n{code}");
    assert!(code.contains("document.createElement(Chart.tag)"), "used like any component:\n{code}");
    assert!(code.contains(".onmouseenter = Chart"), "callable to preload:\n{code}");
}

#[test]
fn other_shapes_stay_ordinary_code() {
    let (code, _, _) = compile(SOURCE, "/app/page.jsx");
    assert!(code.contains(r#"const helper = () => import("./x.js");"#), "lowercase: {code}");
    assert!(code.contains("const Dynamic = (id) => import("), "parameters / template path: {code}");
    assert!(code.contains(r#"const Later = async () => import("./y.js");"#), "async: {code}");
    assert!(code.contains(r#"let Mutable = () => import("./z.jsx");"#), "not const: {code}");
}

#[test]
fn every_target_derives_the_same_tag() {
    let (c, h, s) = compile(SOURCE, "/app/page.jsx");
    let tag = tag_of(&c, "Chart");
    assert_eq!(tag_of(&h, "Chart"), tag);
    assert_eq!(tag_of(&s, "Chart"), tag);
    assert!(s.contains("lazyComponent } from \"@opentf/afw/server\""), "the server entry:\n{s}");
    assert!(s.contains("ssgComponent(Chart.tag,"), "{s}");
    assert!(h.contains("claimElement(") && h.contains("Chart.tag"), "{h}");
}

#[test]
fn the_tag_differs_per_module_and_binding() {
    let (a, _, _) = compile(SOURCE, "/app/page.jsx");
    let (b, _, _) = compile(SOURCE, "/app/other/page.jsx");
    assert_ne!(tag_of(&a, "Chart"), tag_of(&b, "Chart"));
    assert_ne!(tag_of(&a, "Chart"), tag_of(&a, "LineChart"));
}

#[test]
fn a_module_without_lazy_components_imports_nothing_extra() {
    let (code, _, _) = compile("export default function P() { return <p>x</p>; }", "/app/page.jsx");
    assert!(!code.contains("lazyComponent"), "{code}");
}
