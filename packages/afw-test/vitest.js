// Vitest setup for AFW component tests (the Vite + Node workflow). List it in
// `test.setupFiles`; it registers `cleanup` after each test, as `./setup` does under
// esdev. Vitest's DOM environment (`happy-dom` or `jsdom`) supplies the document.
import { afterEach } from "vitest";
import { cleanup } from "./index.js";

if (typeof document === "undefined") {
  throw new Error('@opentf/afw-test/vitest needs a DOM environment: set test.environment to "happy-dom" or "jsdom"');
}

afterEach(cleanup);
