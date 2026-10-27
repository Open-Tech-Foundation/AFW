<div align="center">

# @opentf/afw-form

***Path-based reactive forms for AFW***

[Docs](https://afw.opentechf.org/packages/afw-form) | [API](https://afw.opentechf.org/api/afw-form) | [Changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-form/CHANGELOG.md) | [GitHub](https://github.com/Open-Tech-Foundation/afw)

</div>

<div align="right">

*An [Open Tech Foundation](https://opentechf.org/) project*

</div>

> Fields bind straight to reactive stores, addressed by dot-path. Typing in one
> field re-runs only the bindings that read that field: per-keystroke work grows
> with the path, not with the number of fields.

```jsx
import { createForm } from "@opentf/afw-form";

export default function SignupForm() {
  const form = createForm({
    initialValues: { username: "", email: "" },
    validate: (values) => {
      const errors = {};
      if (!values.username) errors.username = "Username required";
      if (!values.email.includes("@")) errors.email = "Invalid email";
      return errors;
    },
  });

  return (
    <form onsubmit={form.handleSubmit((values) => console.log(values))}>
      <input {...form.register("username")} placeholder="Username" />
      {form.errors.username && <span class="error">{form.errors.username}</span>}

      <input {...form.register("email")} placeholder="Email" />
      {form.errors.email && <span class="error">{form.errors.email}</span>}

      <button type="submit" disabled={form.isSubmitting}>Sign up</button>
    </form>
  );
}
```

`register(path)` returns everything an input needs: `name`, `value`, `checked`,
`oninput` and `onblur`, plus the field's `error` and `isTouched` state. `handleSubmit` validates first and calls your handler only
when the form is valid.

> [!NOTE]
> **Alpha.** The API can change between minor versions; see the
> [changelog](https://github.com/Open-Tech-Foundation/afw/blob/main/packages/afw-form/CHANGELOG.md).

## Why afw-form

| Need | How afw-form meets it |
| --- | --- |
| 🎯 **Fine-grained** | `form.values`, `form.errors`, `form.touched` and `form.changed` are reactive stores; only the nodes that read a changed path update |
| 🌲 **Nested state and arrays** | Any depth by dot-path (`"user.profile.firstName"`, `"tags.0"`); arrays are mutated directly |
| 🛡️ **Validation your way** | A plain function, an async check, or a schema library such as Zod or Valibot |
| ⏱️ **Validation timing** | `onChange`, `onBlur` or `onSubmit`, with a separate mode for re-validation |
| 🔌 **No provider** | The form is a plain object; pass it down or read it where it was created |

## Install

```sh
pnpm add @opentf/afw-form
```

`@opentf/afw` is a peer dependency.

## Nested state and arrays

```jsx
const form = createForm({
  initialValues: { user: { name: "Ada" }, skills: ["JavaScript"] },
});

<input {...form.register("user.name")} />

{form.values.skills.map((skill, i) => (
  <input {...form.register(`skills.${i}`)} />
))}

<button type="button" onclick={() => form.values.skills.push("")}>Add skill</button>
```

Editing one row never re-renders the others; `push` and `splice` on
`form.values.skills` update the list in place.

## Validation

`validate(values)` returns an errors object keyed by field path. `validator(values)`
returns `{ errors }` instead, which suits schema resolvers. Either may be async;
`form.isValidating` is `true` while it runs.

```js
import { z } from "zod";

const schema = z.object({
  username: z.string().min(3, "Too short"),
  email: z.string().email("Invalid email"),
});

const zodResolver = (schema) => (values) => {
  const result = schema.safeParse(values);
  if (result.success) return { errors: {} };
  const errors = {};
  for (const issue of result.error.issues) errors[issue.path.join(".")] = issue.message;
  return { errors };
};

const form = createForm({ initialValues: { username: "", email: "" }, validator: zodResolver(schema) });
```

| Option | Values | Default | Validates |
| --- | --- | --- | --- |
| `mode` | `"onChange"`, `"onBlur"`, `"onSubmit"` | `"onBlur"` | On every edit (and on mount), on blur, or only on submit |
| `reValidateMode` | `"onChange"`, `"onBlur"` | `"onChange"` | Once an error exists, when to check again |

## API

`createForm(options)` returns a stable form object; called again from the same
component, it returns the same instance.

| Option | Purpose |
| --- | --- |
| `initialValues` | Starting values; also the baseline for `isChanged` |
| `validate` / `validator` | Validation function, as above |
| `mode` / `reValidateMode` | Validation timing, as above |
| `key` | Distinguishes several forms created in one component |

| Member | Purpose |
| --- | --- |
| `register(path)` | Props to spread onto an input |
| `handleSubmit(fn)` | Submit handler: validates, then calls `fn(values)` when valid |
| `reset(values?)` | Restore `initialValues`, or reset to new baseline values |
| `values`, `errors`, `touched`, `changed` | Reactive stores, read by path |
| `isValid`, `isChanged`, `isTouched` | Form-wide status |
| `isSubmitting`, `isValidating`, `isSubmitted`, `submitCount` | Submission status |

## License

MIT — see [LICENSE](https://github.com/Open-Tech-Foundation/afw/blob/main/LICENSE).
