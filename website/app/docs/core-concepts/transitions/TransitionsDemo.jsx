// Live output for the Transitions page: a notice with a chosen transition, and a keyed
// list whose added and removed items slide.
import { fade, fly, scale, slide } from "@opentf/afw/transition";

const EFFECTS = { fade, fly, scale };
const TASKS = ["Write the docs", "Ship the release", "Tell the team", "Review the PR", "Plan the next one"];

export default function TransitionsDemo() {
  let shown = $state(true);
  let effect = $state("fly");
  let items = $state([{ id: 1, name: TASKS[0] }, { id: 2, name: TASKS[1] }]);
  let next = $state(3);

  function add() {
    items = [...items, { id: next, name: TASKS[(next - 1) % TASKS.length] }];
    next++;
  }

  return (
    <div class="demo-output demo-output--jsx">
      <span class="demo-output-label">Output</span>
      <div class="demo-jsx-stack">
        <div class="demo-row">
          <button class="demo-jsx-btn" onclick={() => (shown = !shown)}>{shown ? "Hide" : "Show"} the notice</button>
          {Object.keys(EFFECTS).map((name) => (
            <button class={effect === name ? "demo-jsx-btn demo-chip demo-chip--on" : "demo-jsx-btn demo-chip"} onclick={() => (effect = name)}>
              {name}()
            </button>
          ))}
        </div>
        {shown && <p class="demo-jsx-banner" transition={EFFECTS[effect]({ duration: 260 })}>Saved. This notice uses {effect}().</p>}
        <ul class="demo-list">
          {items.map((item) => (
            <li key={item.id} transition={slide()} class="demo-list-item">
              <span>{item.name}</span>
              <button class="demo-jsx-btn demo-jsx-btn--sm demo-jsx-btn--ghost" aria-label={`Remove ${item.name}`} onclick={() => (items = items.filter((i) => i.id !== item.id))}>Remove</button>
            </li>
          ))}
        </ul>
        <button class="demo-jsx-btn" onclick={add}>Add a task</button>
      </div>
    </div>
  );
}
