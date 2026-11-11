import { Pending, resource } from '@opentf/afw';

// Two independent sections; each run waits for the test: window.__revenue / window.__orders.
const controlled = (name) => () => new Promise((resolve, reject) => {
  window[name] = { resolve, reject: (message) => reject(new Error(message)) };
});

function Revenue() {
  const revenue = resource(controlled('__revenue'));
  return <p data-testid="revenue">{revenue.data}</p>;
}

function Orders() {
  const orders = resource(controlled('__orders'));
  return <p data-testid="orders">{orders.data}</p>;
}

export default function SectionsDemo() {
  return (
    <div>
      <Pending fallback={<p data-testid="revenue-skeleton">…</p>} error={(error, retry) => <button type="button" data-testid="revenue-retry" onclick={retry}>{error.message}</button>}>
        <Revenue />
      </Pending>
      <Pending fallback={<p data-testid="orders-skeleton">…</p>}>
        <Orders />
      </Pending>
    </div>
  );
}
