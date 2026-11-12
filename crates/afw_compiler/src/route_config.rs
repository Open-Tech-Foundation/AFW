//! The render policy a folder's `_config.{js,ts}` declares, read without running it.
//!
//! A `_config.js` default-exports `defineRoute({ … })` (imported from `@opentf/afw` under
//! any local name) or a plain object literal. The build needs `render` and `data` before
//! any bundle exists — a `client` page must never enter the server bundle — so both must be
//! string literals. `paths` may be any expression: it runs at build time inside the server
//! bundle, so only its presence is reported here. Every other key is an error, so a typo
//! never silently falls back to the inherited policy.

use std::path::Path;

use oxc::ast::ast::{
    ExportDefaultDeclarationKind, Expression, ImportDeclarationSpecifier, ObjectPropertyKind, PropertyKey, Statement,
};

use oxc::span::GetSpan;

use crate::parse::ParseSession;

const CORE_MODULE: &str = "@opentf/afw";
const RENDERS: &[&str] = &["server", "static", "client"];
const DATA: &[&str] = &["server", "client"];
/// Keys of the next phase (caching): an error that says so, not "unknown key".
const LATER: &[&str] = &["revalidate", "cache"];

/// What one `_config.js` declares. `None` fields are inherited from the folder above.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RouteConfig {
    pub render: Option<String>,
    pub data: Option<String>,
    pub paths: bool,
}

/// Why a `_config.js` could not be read, with the offending span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteConfigError {
    pub message: String,
    pub offset: usize,
    pub len: usize,
}

fn error(message: impl Into<String>, span: oxc::span::Span) -> RouteConfigError {
    RouteConfigError { message: message.into(), offset: span.start as usize, len: (span.end - span.start) as usize }
}

/// Read the policy the `_config.js` at `path` declares.
pub fn route_config(path: &Path, source: &str) -> Result<RouteConfig, RouteConfigError> {
    let session = ParseSession::new();
    let parsed = session.parse(path, source);
    if let Some(e) = parsed.errors.first() {
        let span = e.labels.as_ref().first().map(|l| (l.offset(), l.len())).unwrap_or((0, 0));
        return Err(RouteConfigError { message: e.message.to_string(), offset: span.0 as usize, len: span.1 as usize });
    }

    // Local names bound to `defineRoute` from @opentf/afw.
    let mut define_names: Vec<String> = Vec::new();
    for stmt in &parsed.program.body {
        let Statement::ImportDeclaration(decl) = stmt else { continue };
        if decl.source.value.as_str() != CORE_MODULE {
            continue;
        }
        for spec in decl.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec {
                if s.imported.name().as_str() == "defineRoute" {
                    define_names.push(s.local.name.as_str().to_string());
                }
            }
        }
    }

    let mut default = None;
    for stmt in &parsed.program.body {
        match stmt {
            Statement::ExportDefaultDeclaration(d) => default = Some(d),
            Statement::ExportNamedDeclaration(e) if !e.export_kind.is_type() => {
                return Err(error("a _config.js has only a default export: `export default defineRoute({ … })`", e.span));
            }
            _ => {}
        }
    }
    let Some(default) = default else {
        return Err(error("a _config.js must `export default defineRoute({ … })`", oxc::span::Span::new(0, 0)));
    };

    let object = match &default.declaration {
        ExportDefaultDeclarationKind::ObjectExpression(o) => o.as_ref(),
        ExportDefaultDeclarationKind::CallExpression(call) => {
            let Expression::Identifier(callee) = &call.callee else {
                return Err(error("export `defineRoute({ … })` from @opentf/afw, or a plain object", call.span));
            };
            if !define_names.iter().any(|n| n == callee.name.as_str()) {
                return Err(error(format!("`{}` is not `defineRoute` from @opentf/afw", callee.name), call.span));
            }
            match call.arguments.first().and_then(|a| a.as_expression()) {
                Some(Expression::ObjectExpression(o)) if call.arguments.len() == 1 => o.as_ref(),
                _ => return Err(error("defineRoute takes one object literal: `defineRoute({ render: \"static\" })`", call.span)),
            }
        }
        _ => return Err(error("export `defineRoute({ … })` from @opentf/afw, or a plain object", default.span)),
    };

    let mut config = RouteConfig::default();
    for prop in &object.properties {
        let ObjectPropertyKind::ObjectProperty(p) = prop else {
            return Err(error("spreads are not allowed: the build reads this object without running it", prop_span(prop)));
        };
        if p.computed {
            return Err(error("computed keys are not allowed in a _config.js", p.span));
        }
        let key = match &p.key {
            PropertyKey::StaticIdentifier(id) => id.name.as_str().to_string(),
            PropertyKey::StringLiteral(s) => s.value.as_str().to_string(),
            _ => return Err(error("use a plain key (render, data, paths)", p.span)),
        };
        match key.as_str() {
            "render" => config.render = Some(literal(&p.value, "render", RENDERS)?),
            "data" => config.data = Some(literal(&p.value, "data", DATA)?),
            "paths" => config.paths = true,
            k if LATER.contains(&k) => {
                return Err(error(format!("`{k}` is part of route caching, which is not available yet"), p.span));
            }
            k => return Err(error(format!("unknown key `{k}` (expected render, data or paths)"), p.span)),
        }
    }
    Ok(config)
}

/// A string literal from `allowed`, or an error saying why it must be one.
fn literal(value: &Expression, key: &str, allowed: &[&str]) -> Result<String, RouteConfigError> {
    let list = allowed.iter().map(|v| format!("\"{v}\"")).collect::<Vec<_>>().join(", ");
    match value {
        Expression::StringLiteral(s) if allowed.contains(&s.value.as_str()) => Ok(s.value.as_str().to_string()),
        Expression::StringLiteral(s) => Err(error(format!("`{key}` must be one of {list}, not \"{}\"", s.value), s.span)),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() && t.quasis.len() == 1 => {
            let v = t.quasis[0].value.raw.as_str();
            if allowed.contains(&v) { Ok(v.to_string()) } else {
                Err(error(format!("`{key}` must be one of {list}, not \"{v}\""), t.span))
            }
        }
        other => Err(error(
            format!("`{key}` must be a string literal ({list}): it decides what each bundle contains, so the build reads it without running the file"),
            other.span(),
        )),
    }
}

fn prop_span(prop: &ObjectPropertyKind) -> oxc::span::Span {
    prop.span()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(source: &str) -> Result<RouteConfig, RouteConfigError> {
        route_config(Path::new("/app/admin/_config.ts"), source)
    }
    fn message(source: &str) -> String {
        read(source).unwrap_err().message
    }

    #[test]
    fn reads_define_route_under_any_local_name() {
        let c = read("import { defineRoute as route } from \"@opentf/afw\";\nexport default route({ render: \"client\", data: \"client\" });").unwrap();
        assert_eq!(c, RouteConfig { render: Some("client".into()), data: Some("client".into()), paths: false });
    }

    #[test]
    fn reads_a_plain_object_and_paths_of_any_shape() {
        let c = read("import { db } from \"../db.js\";\nexport default { render: `static`, paths: async () => (await db.slugs()).map((slug) => ({ slug })) };").unwrap();
        assert_eq!(c, RouteConfig { render: Some("static".into()), data: None, paths: true });
    }

    #[test]
    fn missing_keys_are_inherited() {
        assert_eq!(read("export default {};").unwrap(), RouteConfig::default());
        let c = read("import { defineRoute } from \"@opentf/afw\"; export default defineRoute({ paths: () => [] });").unwrap();
        assert_eq!(c.render, None);
        assert!(c.paths);
    }

    #[test]
    fn render_and_data_must_be_known_literals() {
        assert!(message("export default { render: \"edge\" };").contains("`render` must be one of \"server\", \"static\", \"client\", not \"edge\""));
        assert!(message("const r = \"static\"; export default { render: r };").contains("must be a string literal"));
        assert!(message("export default { render: isAdmin ? \"client\" : \"server\" };").contains("must be a string literal"));
        assert!(message("export default { data: \"static\" };").contains("`data` must be one of \"server\", \"client\""));
    }

    #[test]
    fn unknown_later_and_unreadable_keys_are_errors() {
        assert!(message("export default { rendr: \"static\" };").contains("unknown key `rendr`"));
        assert!(message("export default { render: \"static\", revalidate: 60 };").contains("not available yet"));
        assert!(message("const base = {}; export default { ...base };").contains("spreads are not allowed"));
        assert!(message("export default { [\"render\"]: \"static\" };").contains("computed keys"));
    }

    #[test]
    fn the_export_must_be_define_route_or_an_object() {
        assert!(message("export const render = \"static\";").contains("only a default export"));
        assert!(message("const c = {}; export default c;").contains("or a plain object"));
        assert!(message("import { defineRoute } from \"./mine.js\"; export default defineRoute({});").contains("is not `defineRoute` from @opentf/afw"));
        assert!(message("import { defineRoute } from \"@opentf/afw\"; export default defineRoute(opts);").contains("one object literal"));
        assert!(message("// nothing\n").contains("must `export default defineRoute"));
    }

    #[test]
    fn an_error_points_at_the_value() {
        let src = "export default { render: \"edge\" };";
        let e = read(src).unwrap_err();
        assert_eq!(&src[e.offset..e.offset + e.len], "\"edge\"");
    }
}
