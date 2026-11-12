// Lazy components in a real browser: the chunk is a separate request made only when
// the component first renders, and props, children, callbacks and $expose all work.
import { expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import LazyDemo from './fixtures/LazyDemo.jsx';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return true; await tick(20); }
  return check();
}
const requested = () => performance.getEntriesByType('resource').some((e) => e.name.includes('LazyHeavy'));

test('the lazy chunk loads only when the component first renders', async () => {
  const { getByTestId, queryByTestId, unmount } = render(LazyDemo);
  await tick(200);
  expect(requested()).toBe(false);
  expect(queryByTestId('heavy')).toBe(null);
  window.__lazy.show();
  expect(await until(() => !!queryByTestId('heavy'))).toBe(true);
  expect(requested()).toBe(true);
  expect(getByTestId('pick').textContent).toBe('first');
  expect(getByTestId('kid').closest('[data-testid="heavy"]')).not.toBe(null); // children moved in
  window.__lazy.relabel('second');
  await tick();
  expect(getByTestId('pick').textContent).toBe('second'); // prop updates reach it
  getByTestId('pick').click();
  await tick();
  expect(getByTestId('picked').textContent).toBe('second'); // callback props work
  expect(window.__lazy.ping()).toBe('pong second'); // the ref forwards $expose
  unmount();
});
