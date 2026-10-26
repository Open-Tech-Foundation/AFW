import { createForm } from "../index.js";

export default function BasicForm({ onSubmit }) {
  const form = createForm({
    initialValues: { username: "alice", email: "" },
    validate: (values) => {
      const errs = {};
      if (!values.username) errs.username = "Username required";
      if (!values.email.includes("@")) errs.email = "Invalid email";
      return errs;
    }
  });

  return (
    <form onsubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label for="username">Username</label>
        <input {...form.register("username")} id="username" data-testid="username" />
        {form.errors.username && <span data-testid="username-error">{form.errors.username}</span>}
      </div>
      <div>
        <label for="email">Email</label>
        <input {...form.register("email")} id="email" data-testid="email" />
        {form.errors.email && <span data-testid="email-error">{form.errors.email}</span>}
      </div>
      <button type="submit" data-testid="submit">Submit</button>
    </form>
  );
}
