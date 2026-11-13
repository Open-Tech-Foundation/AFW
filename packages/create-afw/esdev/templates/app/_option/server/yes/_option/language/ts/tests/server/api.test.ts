import { expect, test } from "@opentf/afw-test/test";
import { GET } from "../../app/api/hello/route.ts";

test("GET /api/hello greets by name", async () => {
  const response = GET(new Request("http://localhost/api/hello?name=AFW"), { query: { name: "AFW" }, locals: { requestId: "r1" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ message: "Hello, AFW!", requestId: "r1" });
});
