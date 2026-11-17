// The query cache in a real browser: a remounted keyed resource shows its cached data
// through <Pending> at once (content plus the refreshing view), never the fallback.
import { afterEach, expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import { __resetQueryCache } from '../runtime/query-cache.js';
import CachedDemo from './fixtures/CachedDemo.jsx';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
/** Is `el` rendered (has a layout box)? Slotted-out light DOM has none. */
const visible = (el) => el.getClientRects().length > 0;

afterEach(() => __resetQueryCache());

test('a remount shows the cached data while it revalidates, not the fallback', async () => {
  const first = render(CachedDemo);
  await tick();
  expect(visible(first.getByTestId('skeleton'))).toBe(true);
  window.__resolveProfile('Ada');
  await tick();
  expect(first.getByTestId('profile').textContent).toBe('Ada');
  first.unmount();

  const again = render(CachedDemo);
  await tick();
  expect(visible(again.getByTestId('skeleton'))).toBe(false);
  expect(visible(again.getByTestId('profile'))).toBe(true);
  expect(again.getByTestId('profile').textContent).toBe('Ada');
  expect(visible(again.getByTestId('updating'))).toBe(true);
  window.__resolveProfile('Grace');
  await tick();
  expect(again.getByTestId('profile').textContent).toBe('Grace');
  expect(visible(again.getByTestId('updating'))).toBe(false);
  again.unmount();
});
