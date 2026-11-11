import { fade, slide } from '@opentf/afw/transition';

export default function Transitions() {
  let open = $state(false);
  let items = $state([{ id: 1 }, { id: 2 }]);
  let next = $state(3);
  return (
    <div>
      <button type="button" data-testid="toggle" onclick={() => (open = !open)}>Toggle</button>
      {open && <p data-testid="panel" transition={fade({ duration: 80 })}>Panel</p>}
      <button type="button" data-testid="add" onclick={() => { items = [...items, { id: next }]; next++; }}>Add</button>
      <button type="button" data-testid="remove-first" onclick={() => (items = items.slice(1))}>Remove</button>
      <ul>
        {items.map((item) => (
          <li key={item.id} data-id={item.id} style={{ padding: '4px' }} transition={slide({ duration: 80 })}>Item {item.id}</li>
        ))}
      </ul>
    </div>
  );
}
