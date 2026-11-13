export default function Counter({ start = 0 }: { start?: number }) {
  let count = $state(start);
  const doubled = $derived(count * 2);

  return (
    <p>
      <button class="rounded-md bg-sky-600 px-3 py-1 text-white" onclick={() => count++}>Count: {count}</button> Doubled: {doubled}
    </p>
  );
}
