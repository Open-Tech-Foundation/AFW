<div align="center">

# @opentf/afw-test

***Render, query and interact with AFW components in tests***

[Docs](https://afw.opentechf.org/packages/afw-test) | [API](https://afw.opentechf.org/api/afw-test) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-test/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> Mount a compiled component or a page, query it the way a user would with
> [Testing Library](https://testing-library.com), and let the setup module tear it
> down after each test, lifecycle and reactive scopes included.

```js
import { expect, test } from "runtime:test";
import { render, userEvent } from "@opentf/afw-test";
import Counter from "./Counter.jsx";

test("increments on click", async () => {
  const { getByRole } = render(Counter);
  const button = getByRole("button", { name: "Count: 0" });

  await userEvent.setup().click(button);

  expect(button.textContent).toBe("Count: 1");
});
```

```sh
esdev test --config=esdev.test.json --dom
```

> [!NOTE]
> **Alpha.** The API can change between minor versions; see the
> [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-test/CHANGELOG.md).

## Install

```sh
pnpm add -D @opentf/afw-test @opentf/esdev-plugin-afw
```

Requires esdev 0.17 or newer. The test runner supplies the DOM; this package adds
no DOM library and no compiler of its own.

## Configure

Create `esdev.test.json`, which compiles JSX imports for tests and registers
automatic cleanup:

```json
{
  "plugins": [{
    "module": "@opentf/esdev-plugin-afw",
    "export": "createAfwPlugin",
    "options": { "target": "csr", "failOnError": true }
  }],
  "test": { "setup": ["@opentf/afw-test/setup"] }
}
```

## Two engines

| Command | Runs in | Use for |
| --- | --- | --- |
| `esdev test --config=esdev.test.json --dom` | esdev's native DOM | Most component tests: fast, no browser needed |
| `esdev test --config=esdev.test.json --browser` | A real browser engine | Layout, CSS and real event timing |

`--browser` needs a supported browser and its matching driver; see
[esdev browser testing](https://esrun.opentechf.org/esdev/test/browser).

## API

| Export | Purpose |
| --- | --- |
| `render(Component, props?)` | Mount a compiled component, a page factory or a tag name; props are set before connection. Returns `container`, `unmount()` and bound Testing Library queries |
| `cleanup()` | Unmount everything `render()` created; the setup module runs it after each test |
| `userEvent` | [`@testing-library/user-event`](https://testing-library.com/docs/user-event/intro): clicks, typing, keyboard and selection |
| `@opentf/afw-test/setup` | Registers `afterEach(cleanup)` for every test file |

`unmount()` disposes the view's lifecycle hooks and reactive scopes and removes its
container; calling it twice is safe. Custom-element disconnect callbacks can settle
asynchronously, so await the effect you assert on when testing teardown.

## Documentation

| Doc | Purpose |
| --- | --- |
| [Setup](https://afw.opentechf.org/packages/afw-test/setup) | Configuration in detail |
| [Writing tests](https://afw.opentechf.org/packages/afw-test/writing-tests) | Structure, props and async updates |
| [Queries](https://afw.opentechf.org/packages/afw-test/queries) | Finding elements by role, label and text |
| [User events](https://afw.opentechf.org/packages/afw-test/user-events) | Simulating real interaction |
| [Strategies](https://afw.opentechf.org/packages/afw-test/strategies) | When to use the native DOM or a real browser |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
