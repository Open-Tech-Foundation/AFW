// Type check for `defineRoute` (run by `tsr typecheck`): valid configs compile, and an
// unknown strategy or key is a type error.
import { defineRoute } from "@opentf/afw";

defineRoute({ render: "static", paths: async () => [{ slug: "a" }, { slug: "b" }] });
defineRoute({ render: "static", paths: () => [{ parts: ["guide", "intro"] }] });
defineRoute({ render: "client", data: "client" });
defineRoute({});
// @ts-expect-error unknown strategy
defineRoute({ render: "edge" });
// @ts-expect-error unknown key
defineRoute({ render: "static", rendr: 1 });
// @ts-expect-error paths returns params objects
defineRoute({ render: "static", paths: () => ["a"] });
