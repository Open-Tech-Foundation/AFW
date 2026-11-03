export default function Counter({ start = 0 }) {
  let count = $state(start);
  return <button id="counter" onclick={() => count++}>Count {count}</button>;
}
