// MathML in a real browser: `<math>` and what it holds, conditionals included, are built in
// the MathML namespace, so the browser lays the formula out instead of treating the tags
// as unknown HTML elements.
import { expect, test } from 'runtime:test';
import { render } from '@opentf/afw-test';
import MathDemo from './fixtures/MathDemo.jsx';

const MATHML = 'http://www.w3.org/1998/Math/MathML';

test('<math> and its children are MathML elements the browser renders', async () => {
  const { getByTestId, unmount } = render(MathDemo);
  const formula = getByTestId('formula');
  expect(formula.namespaceURI).toBe(MATHML);
  expect(formula.firstElementChild.namespaceURI).toBe(MATHML);
  expect(formula instanceof MathMLElement).toBe(true);
  expect(formula.getBoundingClientRect().width > 0).toBe(true);
  getByTestId('toggle').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(getByTestId('power').namespaceURI).toBe(MATHML); // a conditional's branch too
  unmount();
});
