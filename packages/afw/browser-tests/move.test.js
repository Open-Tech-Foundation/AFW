// Moving nodes keeps their state in a real browser: a keyed list reorder and a <Portal>
// relocate with `moveBefore()` where the browser has it, so a focused input stays focused
// (`insertBefore` drops focus), and the fallback still moves them where it does not.
import { expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import MoveDemo from './fixtures/MoveDemo.jsx';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const supported = typeof Element.prototype.moveBefore === 'function';

test('a keyed list reorder keeps a moved row focused', async () => {
  const { getByTestId, unmount } = render(MoveDemo);
  const input = getByTestId('input-a');
  input.focus();
  getByTestId('reverse').click(); // [b, c, a]: b and c stay, the focused row a moves
  await tick();
  expect(getByTestId('input-a')).toBe(input); // same element, moved
  expect([...document.querySelectorAll('li input')].map((el) => el.value)).toEqual(['b', 'c', 'a']);
  if (supported) expect(document.activeElement).toBe(input);
  unmount();
});

test('a <Portal> moves its children to the target', async () => {
  const { getByTestId, unmount } = render(MoveDemo);
  await tick();
  const portaled = document.querySelector('[data-testid="portaled"]');
  expect(portaled.parentElement).toBe(document.body);
  unmount();
});
