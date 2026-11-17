// Types for @opentf/afw-form: path-based reactive forms over AFW's signals.

export { signal, computed, batch, effect, untracked, reactive, getCurrentInstance } from "@opentf/afw";

/** When the form validates. */
export type ValidationMode = "onChange" | "onBlur" | "onSubmit";
/** When the form validates again once a field has an error. */
export type ReValidationMode = "onChange" | "onBlur";

/**
 * Errors keyed by field path, as nested objects: `{ email: "Required", user: { name: "Too short" } }`.
 * A falsy leaf means no error.
 */
export interface FormErrors {
  [path: string]: string | false | null | undefined | FormErrors;
}

export interface FormOptions<T extends object> {
  /** The starting values; they also set the shape `register` paths address. */
  initialValues?: T;
  /** Returns the errors object directly. May be async. */
  validate?: (values: T) => FormErrors | undefined | null | Promise<FormErrors | undefined | null>;
  /** Returns `{ errors }`, the shape schema resolvers produce. May be async. */
  validator?: (values: T) => { errors?: FormErrors } | Promise<{ errors?: FormErrors }>;
  /** When to validate: a mode, or a signal holding one. Default `"onBlur"`. */
  mode?: ValidationMode | { value: ValidationMode | undefined };
  /** When to validate again after the first error. Default `"onChange"`. */
  reValidateMode?: ReValidationMode | { value: ReValidationMode | undefined };
  /** Identifies the form within its component, in place of its call position. */
  key?: string | number;
}

/** What `register(path)` returns: spread it onto an input. */
export interface FieldBinding {
  /** The field path. */
  name: string;
  /** The current value (`""` before the field has one). */
  value: any;
  /** The current value, read as a boolean by checkboxes. */
  checked: any;
  /** The field's current error, if any. */
  error: { readonly value: string | undefined };
  /** Whether the field has been blurred. */
  isTouched: { readonly value: boolean };
  /** Writes the input's value (or `checked`) back to the form. */
  oninput: (event: Event) => void;
  /** Marks the field touched and runs `onBlur` validation. */
  onblur: () => void;
}

export interface Form<T extends object> {
  /** Bind a field by dotted path: `register("user.name")`, `register("items.0.qty")`. */
  register(path: string): FieldBinding;
  /** A submit handler: validates, then calls `fn(values)` only when the form is valid. */
  handleSubmit(fn: (values: T) => unknown): (event?: Event) => Promise<void>;
  /** Reset to the initial values, or to `values`, which become the new baseline. */
  reset(values?: T): void;
  /** Set a field's error from outside the validator; an empty message clears it. */
  setError(path: string, message?: string | null): void;
  /** The current values, reactive per path. */
  readonly values: T;
  /** The current errors, keyed by path, reactive per path. */
  readonly errors: FormErrors;
  /** Which fields have been blurred, mirroring the values' shape. */
  readonly touched: Record<string, any>;
  /** Which top-level fields differ from the baseline. */
  readonly changed: Record<string, boolean>;
  /** No errors are set. */
  readonly isValid: boolean;
  /** The values differ from the baseline. */
  readonly isChanged: boolean;
  /** At least one field has been blurred. */
  readonly isTouched: boolean;
  /** A submit handler is running. */
  readonly isSubmitting: boolean;
  /** An async validator is running. */
  readonly isValidating: boolean;
  /** A submit has completed. */
  readonly isSubmitted: boolean;
  /** The number of submit attempts. */
  readonly submitCount: number;
}

/** Create a form, stable across re-runs of the component body that calls it. */
export function createForm<T extends object = Record<string, any>>(options?: FormOptions<T>): Form<T>;
