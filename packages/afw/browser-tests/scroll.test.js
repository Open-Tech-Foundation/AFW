// Scroll restoration and view transitions with the real router, history and layout.
// One app is mounted for the whole file (mountApp wires popstate once per mount).
import { expect, test } from 'runtime:test';
import { mountApp, navigate } from '@opentf/afw';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await tick(20);
  }
  return check();
}

const block = (id, height) => () => {
  const el = document.createElement('section');
  el.id = id;
  el.style.height = `${height}px`;
  el.textContent = id;
  return el;
};
// A page whose content arrives later, as with loader data or a resource.
const growing = () => {
  const el = document.createElement('section');
  el.id = 'grow';
  el.style.height = '100px';
  setTimeout(() => (el.style.height = '6000px'), 400);
  return el;
};

const app = document.createElement('div');
document.body.appendChild(app);
const startedAt = location.pathname + location.search;
let transitions = 0;
const realStart = document.startViewTransition?.bind(document);
if (realStart) document.startViewTransition = (cb) => (transitions++, realStart(cb));
history.replaceState({}, '', '/');
await mountApp({
  target: app,
  viewTransitions: true,
  pages: {
    '/t/app/page.jsx': { default: block('home', 200) },
    '/t/app/long/page.jsx': { default: block('long', 6000) },
    '/t/app/other/page.jsx': { default: block('other', 6000) },
    '/t/app/grow/page.jsx': { default: growing },
  },
});

async function back() {
  history.back();
  await tick(50);
}

test('back restores the scroll position of the page you left', async () => {
  await navigate('/long');
  window.scrollTo(0, 1500);
  await navigate('/other');
  expect(window.scrollY).toBe(0); // a new page starts at the top
  await back();
  expect(await until(() => document.getElementById('long') && Math.abs(window.scrollY - 1500) < 2)).toBe(true);
});

test('forward restores too, and each entry keeps its own position', async () => {
  await navigate('/long');
  window.scrollTo(0, 800);
  await navigate('/other');
  window.scrollTo(0, 2400);
  await back();
  expect(await until(() => document.getElementById('long') && Math.abs(window.scrollY - 800) < 2)).toBe(true);
  history.forward();
  expect(await until(() => document.getElementById('other') && Math.abs(window.scrollY - 2400) < 2)).toBe(true);
});

test('a page that grows after rendering is scrolled once it is tall enough', async () => {
  await navigate('/grow');
  await until(() => document.getElementById('grow')?.offsetHeight === 6000);
  window.scrollTo(0, 3000);
  await navigate('/other');
  await back();
  await tick(20);
  expect(window.scrollY).toBeLessThan(3000); // the page is short again at first
  expect(await until(() => Math.abs(window.scrollY - 3000) < 2)).toBe(true);
});

test('user input stops a pending restore', async () => {
  await navigate('/grow');
  await until(() => document.getElementById('grow')?.offsetHeight === 6000);
  window.scrollTo(0, 3000);
  await navigate('/other');
  await back();
  await tick(20);
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
  await tick(600); // the page has grown by now
  expect(window.scrollY).toBeLessThan(3000);
});

test('client navigations run inside a view transition', async () => {
  if (!realStart) return; // browser without the View Transitions API
  const before = transitions;
  await navigate('/long');
  expect(transitions).toBe(before + 1);
  expect(document.getElementById('long')).not.toBe(null);
  history.replaceState({}, '', startedAt);
});
