export default function Counter({ start = 0 }) {
  let count = $state(start);
  const doubled = $derived(count * 2);
  return (
    <div>
      <button onclick={() => count++}>Count: {count}</button>
      <p>Doubled: {doubled}</p>
    </div>
  );
}
