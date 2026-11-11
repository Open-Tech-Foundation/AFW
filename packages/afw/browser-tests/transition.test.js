// Enter/exit transitions in a real browser: the compiled `transition` prop, the Web
// Animations API, and the deferred removal the `--dom` tier can only fake.
import { expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import Transitions from './fixtures/Transitions.jsx';

const settle = (el) => Promise.all(el.getAnimations().map((a) => a.finished));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a conditional element fades in, then fades out before it is removed', async () => {
  const { getByTestId, queryByTestId, unmount } = render(Transitions);
  expect(queryByTestId('panel')).toBe(null);
  getByTestId('toggle').click();
  const panel = getByTestId('panel');
  expect(panel.getAnimations()).toHaveLength(1);
  await settle(panel);
  expect(panel.getAnimations()).toHaveLength(0);

  getByTestId('toggle').click();
  expect(panel.isConnected).toBe(true);
  expect(panel.inert).toBe(true);
  expect(panel.getAnimations()).toHaveLength(1);
  await settle(panel);
  await sleep(0);
  expect(panel.isConnected).toBe(false);
  unmount();
});

test('toggling back mid-exit shows a fresh element alongside the leaving one', async () => {
  const { getByTestId, container, unmount } = render(Transitions);
  getByTestId('toggle').click();
  const first = getByTestId('panel');
  await settle(first);
  getByTestId('toggle').click();
  getByTestId('toggle').click();
  const panels = container.querySelectorAll('[data-testid="panel"]');
  expect(panels).toHaveLength(2);
  expect(panels[0]).toBe(first);
  await settle(first);
  await sleep(0);
  expect(container.querySelectorAll('[data-testid="panel"]')).toHaveLength(1);
  unmount();
});

test('list items: the first render is still, added items slide in, removed ones slide out', async () => {
  const { getByTestId, container, unmount } = render(Transitions);
  const items = () => [...container.querySelectorAll('li')];
  expect(items().every((li) => li.getAnimations().length === 0)).toBe(true);

  getByTestId('add').click();
  const added = items().at(-1);
  expect(added.dataset.id).toBe('3');
  expect(added.getAnimations()).toHaveLength(1);
  expect(added.style.overflow).toBe('hidden');
  await settle(added);
  await sleep(0);
  expect(added.style.overflow).toBe(''); // restored once the enter ends

  const removed = items()[0];
  getByTestId('remove-first').click();
  expect(removed.isConnected).toBe(true);
  expect(removed.inert).toBe(true);
  await settle(removed);
  await sleep(0);
  expect(items().map((li) => li.dataset.id)).toEqual(['2', '3']);
  unmount();
});
