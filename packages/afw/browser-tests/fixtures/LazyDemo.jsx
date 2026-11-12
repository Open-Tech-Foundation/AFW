import { Pending } from '@opentf/afw';

const Heavy = () => import('./LazyHeavy.jsx');

export default function LazyDemo() {
  let show = $state(false);
  let picked = $state('');
  let label = $state('first');
  const heavy = $ref();
  window.__lazy = { show: () => (show = true), relabel: (v) => (label = v), ping: () => heavy.ping() };
  return (
    <div>
      <p data-testid="picked">{picked}</p>
      {show && (
        <Pending fallback={<p data-testid="lazy-fallback">Loading…</p>}>
          <Heavy ref={heavy} label={label} onpicked={(v) => (picked = v)}><i data-testid="kid">kid</i></Heavy>
        </Pending>
      )}
    </div>
  );
}
