// Live output for the Pending page: one fallback until every resource inside has loaded,
// instead of each part popping in on its own.
import { Pending } from "@opentf/afw";
import ProfileCard from "./ProfileCard.jsx";

export default function PendingDemo() {
  let id = $state(1);
  let shown = $state(true);

  function reload() {
    shown = false;
    id++;
    queueMicrotask(() => (shown = true));
  }

  return (
    <div class="demo-output demo-output--jsx">
      <span class="demo-output-label">Output</span>
      <div class="demo-jsx-stack">
        <button class="demo-jsx-btn" onclick={reload}>Load another profile</button>
        {shown && (
          <Pending fallback={<div class="demo-card demo-skeleton" aria-label="Loading"><span /><span /><span /></div>}>
            <ProfileCard id={id} />
          </Pending>
        )}
        <p class="demo-jsx-line demo-jsx-muted">The name arrives after 0.5 s and the activity after 1.1 s; the card appears once, when both have.</p>
      </div>
    </div>
  );
}
