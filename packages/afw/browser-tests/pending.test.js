// <Pending> in a real browser: compiled output, real shadow DOM and slots (what is
// actually displayed), and the route from a failed load to <ErrorBoundary> and back.
import { expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import PendingDemo from './fixtures/PendingDemo.jsx';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
/** Is `el` rendered (has a layout box)? Slotted-out light DOM has none. */
const visible = (el) => el.getClientRects().length > 0;

test('shows the fallback until the page and component resources load', async () => {
  const { getByTestId, unmount } = render(PendingDemo);
  await tick();
  expect(visible(getByTestId('skeleton'))).toBe(true);
  expect(visible(getByTestId('name'))).toBe(false); // built, connected, not displayed
  window.__user({ name: 'Ada' });
  await tick();
  expect(visible(getByTestId('skeleton'))).toBe(true); // Bio still loading
  window.__settle('Mathematician');
  await tick();
  expect(visible(getByTestId('skeleton'))).toBe(false);
  expect(getByTestId('name').textContent).toBe('Ada');
  expect(visible(getByTestId('bio'))).toBe(true);
  unmount();
});

test('a refetch keeps the content and shows the refreshing view beside it', async () => {
  const { getByTestId, container, unmount } = render(PendingDemo);
  window.__user({ name: 'Ada' });
  window.__settle('bio');
  await tick();
  window.__refetchUser();
  await tick();
  const boundary = container.querySelector('afw-internal-pending');
  expect(boundary.hasAttribute('data-pending')).toBe(true);
  expect(visible(getByTestId('updating'))).toBe(true);
  expect(visible(getByTestId('name'))).toBe(true);
  window.__user({ name: 'Grace' });
  await tick();
  expect(boundary.hasAttribute('data-pending')).toBe(false);
  expect(visible(getByTestId('updating'))).toBe(false);
  expect(getByTestId('name').textContent).toBe('Grace');
  unmount();
});

test('a failed first load shows the ErrorBoundary, and retry loads it again', async () => {
  const { getByTestId, queryByTestId, unmount } = render(PendingDemo);
  window.__user({ name: 'Ada' });
  await tick();
  window.__fail('bio service down');
  await tick();
  expect(getByTestId('retry').textContent).toBe('bio service down');
  getByTestId('retry').click();
  await tick();
  await tick();
  window.__settle('back');
  await tick();
  expect(queryByTestId('retry')).toBe(null);
  expect(getByTestId('bio').textContent).toBe('back');
  expect(visible(getByTestId('bio'))).toBe(true);
  unmount();
});
