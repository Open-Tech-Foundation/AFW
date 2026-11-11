// `fetch` for the framework's own requests (server functions, loader data) that
// rides out a development server restart.
//
// In the esdev workflow an edit to server code restarts the app server process
// (SIGTERM, then a new process): for a moment the port refuses connections, and a
// call made then fails with a network error. The Vite workflow runs server code in
// its dev server, which never stops, so the same edit never fails a call. In
// development, a request that could not connect is retried until the server is back
// (up to RETRY_FOR_MS), so both workflows behave the same.
//
// Only a failure to connect (`fetch` rejecting with a TypeError) is retried: esdev
// drains in-flight requests before stopping, so such a request never reached the
// server. An HTTP error, an abort, or a production build passes straight through.

import { DEV } from "../core/dev.js";

const RETRY_FOR_MS = 3000;
const RETRY_EVERY_MS = 100;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `fetch(input, init)`, retrying a failed connection in development. */
export async function devFetch(input, init = {}, { dev = DEV } = {}) {
  if (!dev) return fetch(input, init);
  const end = Date.now() + RETRY_FOR_MS;
  for (;;) {
    try {
      return await fetch(input, init);
    } catch (error) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (!(error instanceof TypeError) || init.signal?.aborted || offline || Date.now() >= end) throw error;
      await wait(RETRY_EVERY_MS);
    }
  }
}
