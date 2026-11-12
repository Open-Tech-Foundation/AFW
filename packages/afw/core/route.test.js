import { expect, test } from "runtime:test";

import { defineRoute } from "./route.js";
import { defineRoute as serverDefineRoute } from "../server/index.js";

test("defineRoute returns the config as written, and the server entry exports it", () => {
  const paths = async () => [{ slug: "hello" }];
  const config = { render: "static", paths };
  expect(defineRoute(config)).toBe(config);
  expect(serverDefineRoute).toBe(defineRoute);
});
