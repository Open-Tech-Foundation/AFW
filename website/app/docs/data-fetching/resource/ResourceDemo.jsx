// Live output for the resource() page: a reactive source (the user id), loading and
// error states, refetch, and abort when the source changes mid-request.
import { resource } from "@opentf/afw";
import { fakeRequest, person } from "../fake-api.js";

export default function ResourceDemo() {
  let id = $state(1);
  let failNext = false; // a plain variable: the fetcher reads it once per request
  let requests = $state(0);

  const user = resource(
    () => id, // reactive source: a new id fetches again, aborting the request in flight
    (id, { signal }) => {
      const fail = failNext;
      failNext = false;
      requests++;
      return fakeRequest(() => person(id), { fail, signal });
    },
  );

  return (
    <div class="demo-output demo-output--jsx">
      <span class="demo-output-label">Output</span>
      <div class="demo-jsx-stack">
        <div class="demo-row">
          <button class="demo-jsx-btn" onclick={() => id++}>Next user</button>
          <button class="demo-jsx-btn" onclick={() => user.refetch()}>Refetch</button>
          <button class="demo-jsx-btn demo-jsx-btn--ghost" onclick={() => { failNext = true; user.refetch(); }}>Make the next request fail</button>
        </div>
        <div class="demo-card" aria-live="polite">
          {user.loading && <p class="demo-jsx-line demo-jsx-muted">Loading user {id}…</p>}
          {user.error && !user.loading && <p class="demo-jsx-line demo-error">{user.error.message}</p>}
          {user.data && !user.loading && !user.error && (
            <p class="demo-jsx-line"><strong>{user.data.name}</strong> · {user.data.role}, since {user.data.joined}</p>
          )}
        </div>
        <p class="demo-jsx-line demo-jsx-muted">Requests sent: {requests}. Click "Next user" quickly: the older request is aborted.</p>
      </div>
    </div>
  );
}
