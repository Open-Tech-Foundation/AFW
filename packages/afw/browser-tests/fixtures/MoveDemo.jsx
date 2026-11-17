import { Portal } from "@opentf/afw";

export default function MoveDemo() {
  let rows = $state(["a", "b", "c"]);
  return (
    <div>
      <button data-testid="reverse" onclick={() => (rows = [...rows.slice(1), rows[0]])}>rotate</button>
      <ul>{rows.map((row) => <li key={row}><input data-testid={`input-${row}`} value={row} /></li>)}</ul>
      <Portal><input data-testid="portaled" value="p" /></Portal>
    </div>
  );
}
