import { signal, effect } from "@opentf/afw";

// Global store
export const globalCount = signal(0);

// Just a logger to prove the effect is running
let effectRunCount = 0;

export function Child() {
  let localCount = $state(0);
  
  $effect(() => {
    // This effect subscribes to the global count
    const val = globalCount.value;
    effectRunCount++;
    console.log(`[Child Effect] Global count is now ${val}. Total effect runs: ${effectRunCount}`);
  });

  return (
    <div style="border: 1px solid red; padding: 10px; margin: 10px;">
      <h3>Child Component</h3>
      <p>Global: {globalCount.value}</p>
      <button onclick={() => localCount++}>Local++ ({localCount})</button>
    </div>
  );
}

export default function ReconnectDemo() {
  let show = $state(true);

  return (
    <div style="padding: 20px;">
      <h2>Memory Leak / Re-connection Demo</h2>
      <p>
        1. Open DevTools Console.<br/>
        2. Click "Global++" a few times. You'll see the [Child Effect] log fire.<br/>
        3. Click "Toggle Child" to unmount it.<br/>
        4. Click "Global++" again. **Notice the [Child Effect] log NO LONGER fires!** (The effect is correctly disposed).<br/>
        5. Toggle Child back ON. It mounts a NEW instance. Clicking Global++ fires only ONE effect.
      </p>
      
      <div style="margin-bottom: 20px;">
        <button onclick={() => globalCount.value++}>Global++</button>
        <button onclick={() => show = !show}>Toggle Child</button>
      </div>

      {show && <Child />}
    </div>
  );
}
