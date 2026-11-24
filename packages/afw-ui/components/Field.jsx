// Field — a label, an optional description and an error message, linked to one control.
//
//   <Field label="Email" description="We only use it for receipts." error={errors.email} required>
//     <TextField name="email" type="email" autocomplete="email" />
//   </Field>
//
// The control inside (TextField, Textarea, Select, Checkbox, Switch) reads the field's
// context: it takes the field's id (so the <label for> names it), `aria-describedby` the
// description and — while there is one — the error, `aria-invalid` while invalid, and
// `required`. A control works on its own too, with its own id.
//
// Show errors after the user has interacted with the control, not on page load (pair
// with @opentf/afw-form's touched state).

import { ContextProvider, createContext } from "@opentf/afw";

export const FieldContext = createContext(null);

export function Field({ label, description, error, required = false, children, ...rest }) {
  const controlId = $id();
  const descriptionId = $id();
  const errorId = $id();
  const api = {
    controlId,
    required: () => Boolean(required),
    invalid: () => Boolean(error),
    describedBy: () =>
      [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined,
  };
  return (
    <ContextProvider context={FieldContext} value={api}>
      <div {...rest} class={["afw-ui-field", rest.class]} data-invalid={error ? "" : undefined}>
        <label for={controlId} class="afw-ui-field-label">
          {label}
        </label>
        {children}
        {description ? (
          <p id={descriptionId} class="afw-ui-field-description">
            {description}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} class="afw-ui-field-error">
            {error}
          </p>
        ) : null}
      </div>
    </ContextProvider>
  );
}

export function TextField({ value, type = "text", onValueChange, ...rest }) {
  const field = $context(FieldContext);
  const ownId = $id();
  return (
    <input
      {...rest}
      type={type}
      id={field?.controlId ?? rest.id ?? ownId}
      class={["afw-ui-input", rest.class]}
      value={value}
      aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
      aria-invalid={field?.invalid() ? "true" : rest["aria-invalid"]}
      required={field?.required() || "required" in rest || undefined}
      oninput={(e) => onValueChange?.(e.currentTarget.value)}
    />
  );
}

export function Textarea({ value, onValueChange, ...rest }) {
  const field = $context(FieldContext);
  const ownId = $id();
  return (
    <textarea
      {...rest}
      id={field?.controlId ?? rest.id ?? ownId}
      class={["afw-ui-textarea", rest.class]}
      value={value}
      aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
      aria-invalid={field?.invalid() ? "true" : rest["aria-invalid"]}
      required={field?.required() || "required" in rest || undefined}
      oninput={(e) => onValueChange?.(e.currentTarget.value)}
    ></textarea>
  );
}
