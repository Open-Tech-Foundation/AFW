import { describe, expect, test } from "runtime:test";
import { createForm } from "../index.js";

describe("setError", () => {
  test("sets an error the validator did not produce, and clears it with an empty message", () => {
    const form = createForm({ initialValues: { text: "hello" } });
    form.setError("text", "Taken on the server");
    expect(form.errors.text).toBe("Taken on the server");
    expect(form.isValid).toBe(false);
    form.setError("text", "");
    expect(form.errors.text).toBe(undefined);
    expect(form.isValid).toBe(true);
  });

  test("reaches a registered field's error and a nested path", () => {
    const form = createForm({ initialValues: { user: { email: "" } } });
    const field = form.register("user.email");
    form.setError("user.email", "Already registered");
    expect(form.errors.user.email).toBe("Already registered");
    expect(field.error.value).toBe("Already registered");
  });

  test("an error set from a failed submit stays until the field is validated again", async () => {
    const form = createForm({
      initialValues: { text: "" },
      validate: (values) => (values.text ? {} : { text: "Required" }),
    });
    form.values.text = "dup";
    await form.handleSubmit(async () => form.setError("text", "Already exists"))();
    expect(form.errors.text).toBe("Already exists");
    expect(form.isSubmitting).toBe(false);
    // Editing re-validates the field (reValidateMode "onChange"): the validator has no
    // error for it, so the server's message goes.
    form.register("text").oninput({ target: { type: "text", value: "fresh" } });
    expect(form.errors.text).toBe(undefined);
  });

  test("reset() clears it", () => {
    const form = createForm({ initialValues: { text: "" } });
    form.setError("text", "Nope");
    form.reset();
    expect(form.errors.text).toBe(undefined);
  });
});
