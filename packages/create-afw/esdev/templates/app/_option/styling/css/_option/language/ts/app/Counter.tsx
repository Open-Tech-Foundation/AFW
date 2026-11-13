export default function Counter({ start = 0 }: { start?: number }) {
  let count = $state(start);
  const doubled = $derived(count * 2);

  return (
    <p>
      <button onclick={() => count++}>Count: {count}</button> Doubled: {doubled}
    </p>
  );
}
