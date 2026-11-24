// Native choice controls: Checkbox, Switch, RadioGroup + Radio, Select.
//
// They are the platform's own inputs, so keyboard behavior, form submission, autofill
// and screen reader semantics come for free; a theme restyles them (`accent-color`,
// `appearance: base-select`) instead of rebuilding them.
//
//   <Checkbox checked={terms} onCheckedChange={(v) => (terms = v)}>I accept the terms</Checkbox>
//   <Switch checked={alerts} onCheckedChange={(v) => (alerts = v)}>Email alerts</Switch>
//   <RadioGroup label="Plan" name="plan" value={plan} onValueChange={(v) => (plan = v)}>
//     <Radio value="free">Free</Radio>
//     <Radio value="team">Team</Radio>
//   </RadioGroup>
//   <Field label="Country"><Select name="country" value={c} onValueChange={(v) => (c = v)}>…<option/>…</Select></Field>

import { ContextProvider, createContext } from "@opentf/afw";
import { FieldContext } from "./Field.jsx";
import { supportsSwitch } from "../internal/support.js";

const RadioContext = createContext(null);

// `indeterminate` is a property only (no attribute), so it is applied from script.
export function Checkbox({ checked, indeterminate = false, onCheckedChange, children, ...rest }) {
  const field = $context(FieldContext);
  const input = $ref();
  $effect(() => {
    if (input) input.indeterminate = Boolean(indeterminate);
  });
  return (
    <label class="afw-ui-checkbox">
      <input
        {...rest}
        ref={input}
        type="checkbox"
        id={field?.controlId ?? rest.id}
        checked={checked}
        aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
        aria-invalid={field?.invalid() ? "true" : rest["aria-invalid"]}
        onchange={(e) => onCheckedChange?.(e.currentTarget.checked)}
      />
      <span class="afw-ui-checkbox-label">{children}</span>
    </label>
  );
}

// A checkbox with the `switch` attribute: native switch semantics where supported, and
// `role="switch"` (the same accessible role) where not. Its state is on/off, read with
// `.checked`.
export function Switch({ checked, onCheckedChange, children, ...rest }) {
  const field = $context(FieldContext);
  const input = $ref();
  onMount(() => {
    if (!supportsSwitch()) input.setAttribute("role", "switch");
  });
  return (
    <label class="afw-ui-switch">
      <input
        {...rest}
        ref={input}
        type="checkbox"
        switch=""
        id={field?.controlId ?? rest.id}
        checked={checked}
        aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
        onchange={(e) => onCheckedChange?.(e.currentTarget.checked)}
      />
      <span class="afw-ui-switch-label">{children}</span>
    </label>
  );
}

// A <fieldset> named by its <legend>; native radios with one `name` give the group its
// arrow-key behavior and single Tab stop.
export function RadioGroup({ label, name, value, onValueChange, description, children, ...rest }) {
  const ownName = $id();
  const descriptionId = $id();
  const api = {
    name: name ?? ownName,
    value: () => value,
    choose: (v) => onValueChange?.(v),
  };
  return (
    <ContextProvider context={RadioContext} value={api}>
      <fieldset {...rest} class={["afw-ui-radio-group", rest.class]} aria-describedby={description ? descriptionId : undefined}>
        <legend class="afw-ui-radio-group-label">{label}</legend>
        {description ? (
          <p id={descriptionId} class="afw-ui-field-description">
            {description}
          </p>
        ) : null}
        {children}
      </fieldset>
    </ContextProvider>
  );
}

export function Radio({ value, children, ...rest }) {
  const group = $context(RadioContext);
  return (
    <label class="afw-ui-radio">
      <input
        {...rest}
        type="radio"
        name={group?.name}
        value={value}
        checked={group ? group.value() === value : undefined}
        onchange={(e) => e.currentTarget.checked && group?.choose(value)}
      />
      <span class="afw-ui-radio-label">{children}</span>
    </label>
  );
}

// A native <select> (options are its children). The theme opts it into the
// customizable select (`appearance: base-select`); without support it is the OS picker.
export function Select({ value, onValueChange, children, ...rest }) {
  const field = $context(FieldContext);
  const ownId = $id();
  const el = $ref();
  // `value` can only select an option once the options exist, so apply it from here.
  $effect(() => {
    if (el && value !== undefined && value !== null && el.value !== String(value)) el.value = String(value);
  });
  return (
    <select
      {...rest}
      ref={el}
      id={field?.controlId ?? rest.id ?? ownId}
      class={["afw-ui-select", rest.class]}
      aria-describedby={field?.describedBy() ?? rest["aria-describedby"]}
      aria-invalid={field?.invalid() ? "true" : rest["aria-invalid"]}
      required={field?.required() || "required" in rest || undefined}
      onchange={(e) => onValueChange?.(e.currentTarget.value)}
    >
      {children}
    </select>
  );
}
