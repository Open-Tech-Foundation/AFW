//! The exports of a `*.server.{js,ts}` module and which are server functions
//! (docs/SERVER_FUNCTIONS.md). The build uses this to give each `query()` / `action()`
//! export an endpoint and to replace the module with fetch stubs in browser code —
//! without running the module, which holds server-only code.
//!
//! An export is a server function when it is `export const name = query(…)` or
//! `action(…)` (or `export { name }` of such a declaration), with `query` / `action`
//! imported from `@opentf/afw/server` under any local name. Exports whose shape cannot
//! be read statically (`export * from`, re-exports) are an error, so a server function
//! is never missed or exposed by accident.

use std::collections::HashMap;
use std::path::Path;

use oxc::ast::ast::{BindingPattern, Declaration, Expression, ImportDeclarationSpecifier, Statement};

use crate::parse::ParseSession;

const SERVER_MODULE: &str = "@opentf/afw/server";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerFunctionKind {
    Query,
    Action,
}

impl ServerFunctionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ServerFunctionKind::Query => "query",
            ServerFunctionKind::Action => "action",
        }
    }
}

/// One export of a `.server` module. `kind` is `None` for a plain export (a helper
/// that client code may not import).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerExport {
    pub name: String,
    pub kind: Option<ServerFunctionKind>,
}

/// Why a module's exports could not be listed, with the offending span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerExportError {
    pub message: String,
    pub offset: usize,
    pub len: usize,
}

/// List the exports of the `.server` module at `path`.
pub fn server_exports(path: &Path, source: &str) -> Result<Vec<ServerExport>, ServerExportError> {
    let session = ParseSession::new();
    let parsed = session.parse(path, source);
    if let Some(error) = parsed.errors.first() {
        let span = error.labels.as_ref().first().map(|l| (l.offset(), l.len())).unwrap_or((0, 0));
        return Err(ServerExportError { message: error.message.to_string(), offset: span.0 as usize, len: span.1 as usize });
    }

    // Local names bound to `query` / `action` from @opentf/afw/server.
    let mut factories: HashMap<String, ServerFunctionKind> = HashMap::new();
    for stmt in &parsed.program.body {
        let Statement::ImportDeclaration(decl) = stmt else { continue };
        if decl.source.value.as_str() != SERVER_MODULE {
            continue;
        }
        for spec in decl.specifiers.iter().flatten() {
            if let ImportDeclarationSpecifier::ImportSpecifier(s) = spec {
                let kind = match s.imported.name().as_str() {
                    "query" => ServerFunctionKind::Query,
                    "action" => ServerFunctionKind::Action,
                    _ => continue,
                };
                factories.insert(s.local.name.as_str().to_string(), kind);
            }
        }
    }

    let kind_of_init = |init: &Option<Expression>| -> Option<ServerFunctionKind> {
        let Some(Expression::CallExpression(call)) = init else { return None };
        let Expression::Identifier(callee) = &call.callee else { return None };
        factories.get(callee.name.as_str()).copied()
    };

    // Top-level `const x = query(…)` declarations, for `export { x }`.
    let mut locals: HashMap<String, ServerFunctionKind> = HashMap::new();
    for stmt in &parsed.program.body {
        let Statement::VariableDeclaration(vd) = stmt else { continue };
        for d in &vd.declarations {
            if let (BindingPattern::BindingIdentifier(bi), Some(kind)) = (&d.id, kind_of_init(&d.init)) {
                locals.insert(bi.name.as_str().to_string(), kind);
            }
        }
    }

    let error = |message: &str, span: oxc::span::Span| ServerExportError {
        message: message.to_string(),
        offset: span.start as usize,
        len: (span.end - span.start) as usize,
    };

    let mut exports = Vec::new();
    for stmt in &parsed.program.body {
        match stmt {
            Statement::ExportAllDeclaration(e) => {
                return Err(error("`export * from` is not allowed in a .server module: export each server function from the module that defines it", e.span));
            }
            Statement::ExportNamedDeclaration(e) => {
                if e.export_kind.is_type() {
                    continue;
                }
                if e.source.is_some() {
                    return Err(error("re-exports are not allowed in a .server module: export each server function from the module that defines it", e.span));
                }
                match &e.declaration {
                    Some(Declaration::VariableDeclaration(vd)) => {
                        for d in &vd.declarations {
                            let BindingPattern::BindingIdentifier(bi) = &d.id else {
                                return Err(error("destructured exports are not allowed in a .server module", d.span));
                            };
                            exports.push(ServerExport { name: bi.name.as_str().to_string(), kind: kind_of_init(&d.init) });
                        }
                    }
                    Some(Declaration::FunctionDeclaration(f)) => {
                        if let Some(id) = &f.id {
                            exports.push(ServerExport { name: id.name.as_str().to_string(), kind: None });
                        }
                    }
                    Some(Declaration::ClassDeclaration(c)) => {
                        if let Some(id) = &c.id {
                            exports.push(ServerExport { name: id.name.as_str().to_string(), kind: None });
                        }
                    }
                    Some(_) => {} // type declarations
                    None => {
                        for spec in &e.specifiers {
                            if spec.export_kind.is_type() {
                                continue;
                            }
                            let local = spec.local.name();
                            exports.push(ServerExport {
                                name: spec.exported.name().as_str().to_string(),
                                kind: locals.get(local.as_str()).copied(),
                            });
                        }
                    }
                }
            }
            Statement::ExportDefaultDeclaration(_) => {
                exports.push(ServerExport { name: "default".to_string(), kind: None });
            }
            _ => {}
        }
    }
    Ok(exports)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(source: &str) -> Vec<(String, Option<&'static str>)> {
        server_exports(Path::new("/app/todos.server.ts"), source)
            .expect("lists exports")
            .into_iter()
            .map(|e| (e.name, e.kind.map(|k| k.as_str())))
            .collect()
    }

    #[test]
    fn finds_query_and_action_exports() {
        let found = list(
            "import { query, action } from \"@opentf/afw/server\";\n\
             export const listTodos = query(async () => []);\n\
             export const addTodo = action(schema, async (input) => input);\n\
             export function helper() {}\n\
             export const LIMIT = 10;\n",
        );
        assert_eq!(found, vec![
            ("listTodos".into(), Some("query")),
            ("addTodo".into(), Some("action")),
            ("helper".into(), None),
            ("LIMIT".into(), None),
        ]);
    }

    #[test]
    fn follows_aliases_and_export_lists() {
        let found = list(
            "import { query as q, action as act } from \"@opentf/afw/server\";\n\
             const read = q(async () => 1);\n\
             const write = act(async () => 2);\n\
             const plain = 3;\n\
             export { read, write as save, plain };\n",
        );
        assert_eq!(found, vec![("read".into(), Some("query")), ("save".into(), Some("action")), ("plain".into(), None)]);
    }

    #[test]
    fn a_query_from_another_module_is_not_a_server_function() {
        let found = list("import { query } from \"./db.js\";\nexport const rows = query(\"select 1\");\n");
        assert_eq!(found, vec![("rows".into(), None)]);
    }

    #[test]
    fn type_exports_are_ignored_and_default_is_plain() {
        let found = list(
            "import { query } from \"@opentf/afw/server\";\n\
             export type Todo = { title: string };\n\
             export interface Row { id: number }\n\
             export default query(async () => 1);\n",
        );
        assert_eq!(found, vec![("default".into(), None)]);
    }

    #[test]
    fn unreadable_shapes_are_errors_with_a_position() {
        let source = "export * from \"./other.server.js\";\n";
        let err = server_exports(Path::new("/app/a.server.js"), source).unwrap_err();
        assert!(err.message.contains("export * from"), "{}", err.message);
        assert_eq!(err.offset, 0);
        let err = server_exports(Path::new("/app/a.server.js"), "export { x } from \"./x.js\";").unwrap_err();
        assert!(err.message.contains("re-exports"));
        let err = server_exports(Path::new("/app/a.server.js"), "export const { a, b } = obj;").unwrap_err();
        assert!(err.message.contains("destructured"));
    }

    #[test]
    fn a_syntax_error_is_reported() {
        assert!(server_exports(Path::new("/app/a.server.js"), "export const = ;").is_err());
    }

}
