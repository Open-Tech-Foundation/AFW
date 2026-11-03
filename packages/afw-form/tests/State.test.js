import { expect, test, describe } from "runtime:test";
import { createForm } from "../index.js";
import { sleep } from "@opentf/std";

describe("AFW Forms Library - State Helpers", () => {
  test("isValid tracks error state", () => {
    const form = createForm({
      mode: "onChange",
      initialValues: { name: "" },
      validate: (v) => v.name ? {} : { name: "Error" }
    });
    
    expect(form.isValid).toBe(false);
    form.values.name = "Alice";
    expect(form.isValid).toBe(true);
  });

  test("isChanged tracks deep equality with initial values", () => {
    const form = createForm({
      initialValues: { user: { name: "Alice" } }
    });
    
    expect(form.isChanged).toBe(false);
    expect(form.changed.user).toBe(false);
    
    form.values.user = { name: "Bob" };
    expect(form.isChanged).toBe(true);
    expect(form.changed.user).toBe(true);
    
    form.values.user = { name: "Alice" };
    expect(form.isChanged).toBe(false);
    expect(form.changed.user).toBe(false);
  });

  test("isTouched tracks field blur state", () => {
    const form = createForm({
      initialValues: { email: "" }
    });
    const { onblur } = form.register("email");
    
    expect(form.isTouched).toBe(false);
    expect(form.touched.email).toBe(false);
    
    onblur();
    expect(form.isTouched).toBe(true);
    expect(form.touched.email).toBe(true);
  });

  test("isSubmitting and isSubmitted lifecycle", async () => {
    let resolved = false;
    const form = createForm({
      initialValues: { name: "Alice" }
    });
    
    const onSubmit = async () => {
      await sleep(50);
      resolved = true;
    };
    
    const handler = form.handleSubmit(onSubmit);
    
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitted).toBe(false);
    
    const promise = handler();
    expect(form.isSubmitting).toBe(true);
    
    await promise;
    expect(resolved).toBe(true);
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitted).toBe(true);
  });

  test("a validator that rejects or throws ends the submit", async () => {
    for (const validator of [
      async () => { throw new Error("network down"); },
      () => { throw new Error("bad schema"); },
    ]) {
      let called = false;
      const form = createForm({ initialValues: { name: "Alice" }, validator });
      const handler = form.handleSubmit(() => { called = true; });
      let error;
      try { await handler(); } catch (e) { error = e; }
      expect(error instanceof Error).toBe(true);
      expect(called).toBe(false);
      expect(form.isSubmitting).toBe(false);
      expect(form.isValidating).toBe(false);
      expect(form.isSubmitted).toBe(false);
      expect(form.submitCount).toBe(1);
    }
  });

  test("a submit handler that throws ends the submit without marking it submitted", async () => {
    const form = createForm({ initialValues: { name: "Alice" } });
    let error;
    try { await form.handleSubmit(async () => { throw new Error("save failed"); })(); } catch (e) { error = e; }
    expect(error?.message).toBe("save failed");
    expect(form.isSubmitting).toBe(false);
    expect(form.isSubmitted).toBe(false);
  });

  test("reset() restores initial state", () => {
    const form = createForm({
      initialValues: { count: 0 }
    });
    
    form.values.count = 10;
    form.register("count").onblur();
    
    expect(form.values.count).toBe(10);
    expect(form.isChanged).toBe(true);
    expect(form.isTouched).toBe(true);
    
    form.reset();
    
    expect(form.values.count).toBe(0);
    expect(form.isChanged).toBe(false);
    expect(form.isTouched).toBe(false);
  });

});
