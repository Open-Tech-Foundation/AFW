import { createForm } from "../index.js";

// A form created without `initialValues`.
export default function NoInitialValues() {
  const form = createForm();
  return (
    <div>
      <input {...form.register("name")} data-testid="name" />
      <input type="checkbox" {...form.register("agree")} data-testid="agree" />
      <span data-testid="echo">{form.values.name ?? ""}</span>
    </div>
  );
}
